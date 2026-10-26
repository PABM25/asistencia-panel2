-- ===========================================================================
--  SOLO PARA EL PROYECTO DE DEMO PÚBLICA. NUNCA en un proyecto con datos reales.
--  Cada noche BORRA TODOS los empleados, registros, turnos y feriados y vuelve
--  a cargar los datos de prueba.
-- ===========================================================================
--
-- Qué hace:
--  * Guarda el email de la cuenta demo y el hash (bcrypt) de su contraseña, las
--    mismas que pones en VITE_DEMO_EMAIL y VITE_DEMO_PASSWORD de Cloudflare.
--    La contraseña no queda guardada en texto plano en ninguna tabla.
--  * Impide que los visitantes cambien la contraseña, el email o el rol de la
--    cuenta demo (todos la comparten). Cada noche además se restauran.
--  * Crea el kiosco público de la demo (su token está en src/lib/demo.js), para
--    que cualquiera pueda probar el kiosco sin activarlo.
--  * Crea public.reiniciar_demo() y la programa cada día a las 08:00 UTC
--    (04:00 o 05:00 en Chile) con pg_cron.
--  * Ejecuta el primer reinicio ahora mismo.
--
-- Antes de ejecutarlo (ver docs/DEMO.md):
--  1. Ejecuta las migraciones de supabase/migrations y supabase/datos_demo.sql.
--  2. Activa pg_cron (Database → Extensions).
--  3. Crea la cuenta demo en Authentication → Users → Add user.
--  4. Cambia <EMAIL_DEMO> y <PASSWORD_DEMO> en el paso 1 del script (línea
--     marcada con ← CAMBIA ESTOS DOS VALORES). No guardes ese cambio en git:
--     el script se niega a ejecutarse si siguen los marcadores.
--
-- Se puede ejecutar más de una vez (por ejemplo, para cambiar la contraseña).

begin;

-- Protección: la primera vez, si hay empleados que no son de prueba, este no es
-- un proyecto de demo y no se toca nada. (Si ya se configuró antes, los
-- empleados extra son de visitantes y se permite volver a ejecutarlo.)
do $$
begin
  if to_regprocedure('public._cargar_datos_demo(boolean)') is null then
    raise exception 'Primero ejecuta supabase/datos_demo.sql en el SQL Editor (crea los datos de prueba que usa la demo). No se hizo ningún cambio.';
  end if;
  if to_regclass('public.demo_config') is null
     and exists (select 1 from public.empleado where id not like 'demo-%') then
    raise exception 'Este proyecto tiene empleados que no son de prueba. configurar_demo.sql es SOLO para un proyecto de demo; no se hizo ningún cambio.';
  end if;
end;
$$;

-- 1) Cuenta demo -------------------------------------------------------------
-- Las credenciales no se guardan en el repositorio: se escriben aquí solo al
-- ejecutar el script en el SQL Editor.
create temp table demo_cuenta on commit drop as
select '<EMAIL_DEMO>'::text as email, '<PASSWORD_DEMO>'::text as password;   -- ← CAMBIA ESTOS DOS VALORES

do $$
declare
  v demo_cuenta;
begin
  select * into v from demo_cuenta;
  if v.email like '<%' or v.password like '<%' then
    raise exception 'Cambia <EMAIL_DEMO> y <PASSWORD_DEMO> en el paso 1 por los datos de la cuenta demo. No se hizo ningún cambio.';
  end if;
  if v.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v.password) < 6 then
    raise exception 'El email de la cuenta demo no es válido o la contraseña tiene menos de 6 caracteres. No se hizo ningún cambio.';
  end if;
end;
$$;

create table if not exists public.demo_config (
  id             integer primary key default 1 check (id = 1),
  email          text not null,
  password_hash  text
);
-- Versiones anteriores de este script guardaban la contraseña en texto plano.
alter table public.demo_config drop column if exists password;
alter table public.demo_config add column if not exists password_hash text;
alter table public.demo_config enable row level security;   -- sin políticas: nadie la lee desde la app
revoke all on public.demo_config from anon, authenticated;

insert into public.demo_config (id, email, password_hash)
select 1, email, extensions.crypt(password, extensions.gen_salt('bf'))
  from demo_cuenta
on conflict (id) do update set email = excluded.email, password_hash = excluded.password_hash;
alter table public.demo_config alter column password_hash set not null;

-- La cuenta demo es compartida: un visitante no debe poder dejar fuera a los
-- demás cambiando su contraseña o email (Supabase Auth hace esos cambios con
-- el rol supabase_auth_admin) ni quitarle el rol de admin desde la app.
-- session_user y no current_user: dentro de security definer, current_user es
-- el dueño de la función.
create or replace function public.proteger_cuenta_demo()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not exists (select 1 from public.demo_config c where lower(c.email) = lower(old.email)) then
    return new;
  end if;
  if tg_table_schema = 'auth' then
    if session_user = 'supabase_auth_admin' then
      new.encrypted_password := old.encrypted_password;
      new.email := old.email;
    end if;
  else
    new.role := 'admin';
    new.email := old.email;
  end if;
  return new;
end;
$fn$;

revoke all on function public.proteger_cuenta_demo() from public, anon, authenticated;

drop trigger if exists proteger_cuenta_demo on auth.users;
create trigger proteger_cuenta_demo
  before update on auth.users
  for each row execute function public.proteger_cuenta_demo();

drop trigger if exists proteger_cuenta_demo on public.profiles;
create trigger proteger_cuenta_demo
  before update on public.profiles
  for each row execute function public.proteger_cuenta_demo();

-- 2) Reinicio ----------------------------------------------------------------
create or replace function public.reiniciar_demo()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_cfg   public.demo_config;
  v_anio  integer := extract(year from (now() at time zone public.zona_horaria()))::integer;
begin
  -- Los visitantes pueden haber creado o borrado cualquier cosa: se vacía todo.
  delete from public.turno;
  delete from public.registro_asistencia;
  delete from public.empleado;        -- borra también los PIN
  delete from public.feriado;
  delete from public.kiosco where id <> 'demo-kiosco';

  -- Kiosco público (token en src/lib/demo.js; solo existe en este proyecto).
  insert into public.kiosco (id, nombre, token_hash, activo)
  values ('demo-kiosco', 'Kiosco de la demo',
          public._hash_token('demo-publico-pulso-kiosco-no-usar-en-produccion'), true)
  on conflict (id) do update
    set activo = true, nombre = excluded.nombre, token_hash = excluded.token_hash;

  update public.configuracion
     set tolerancia_minutos = 5, descanso_minutos = 60,
         dias_laborales = '{1,2,3,4,5}', marcar_ausencias = true
   where id = 1;

  insert into public.feriado (fecha, nombre) values
    (make_date(v_anio, 12, 25), 'Navidad'),
    (make_date(v_anio + 1, 1, 1), 'Año Nuevo')
  on conflict (fecha) do nothing;

  perform public._cargar_datos_demo(false);

  -- Cuenta demo: misma contraseña y rol de admin de siempre.
  select * into v_cfg from public.demo_config where id = 1;
  if found then
    update auth.users
       set encrypted_password = v_cfg.password_hash
     where lower(email) = lower(v_cfg.email);
    update public.profiles set role = 'admin' where lower(email) = lower(v_cfg.email);
    -- Un visitante podría haber activado MFA en la cuenta compartida.
    if to_regclass('auth.mfa_factors') is not null then
      execute 'delete from auth.mfa_factors where user_id in
                 (select id from auth.users where lower(email) = lower($1))'
        using v_cfg.email;
    end if;
  end if;
end;
$fn$;

revoke all on function public.reiniciar_demo() from public, anon, authenticated;

-- 3) Programar el reinicio diario --------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $cron$select cron.schedule('reiniciar-demo', '0 8 * * *', 'select public.reiniciar_demo()')$cron$;
  else
    raise notice 'pg_cron no está activado: la demo NO se reiniciará sola. Actívalo y vuelve a ejecutar este script.';
  end if;
end;
$$;

-- 4) Primer reinicio ---------------------------------------------------------
select public.reiniciar_demo();

commit;

-- Comprobación
select
  (select count(*) from public.empleado)                       as empleados,
  (select count(*) from public.kiosco where id = 'demo-kiosco') as kiosco_demo,
  (select count(*) from public.profiles p join public.demo_config c on lower(p.email) = lower(c.email)
    where p.role = 'admin')                                     as cuenta_demo_admin;
