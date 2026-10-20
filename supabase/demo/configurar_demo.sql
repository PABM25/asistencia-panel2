-- ===========================================================================
--  SOLO PARA EL PROYECTO DE DEMO PÚBLICA. NUNCA en un proyecto con datos reales.
--  Cada noche BORRA TODOS los empleados, registros, turnos y feriados y vuelve
--  a cargar los datos de prueba.
-- ===========================================================================
--
-- Qué hace:
--  * Guarda el email y la contraseña de la cuenta demo (las mismas que pones en
--    VITE_DEMO_EMAIL y VITE_DEMO_PASSWORD de Cloudflare). Cada noche restaura
--    esa contraseña y su rol de admin, por si un visitante los cambia.
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
--  4. Cambia el email y la contraseña de abajo (paso 1 del script).
--
-- Se puede ejecutar más de una vez (por ejemplo, para cambiar la contraseña).

begin;

-- Protección: la primera vez, si hay empleados que no son de prueba, este no es
-- un proyecto de demo y no se toca nada. (Si ya se configuró antes, los
-- empleados extra son de visitantes y se permite volver a ejecutarlo.)
do $$
begin
  if to_regclass('public.demo_config') is null
     and exists (select 1 from public.empleado where id not like 'demo-%') then
    raise exception 'Este proyecto tiene empleados que no son de prueba. configurar_demo.sql es SOLO para un proyecto de demo; no se hizo ningún cambio.';
  end if;
end;
$$;

-- 1) Cuenta demo -------------------------------------------------------------
create table if not exists public.demo_config (
  id        integer primary key default 1 check (id = 1),
  email     text not null,
  password  text not null
);
alter table public.demo_config enable row level security;   -- sin políticas: nadie la lee desde la app
revoke all on public.demo_config from anon, authenticated;

insert into public.demo_config (id, email, password)
values (1, 'bemaker.dev@gmail.com', 'demo1234')    
on conflict (id) do update set email = excluded.email, password = excluded.password;

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
       set encrypted_password = crypt(v_cfg.password, gen_salt('bf'))
     where lower(email) = lower(v_cfg.email);
    update public.profiles set role = 'admin' where lower(email) = lower(v_cfg.email);
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
