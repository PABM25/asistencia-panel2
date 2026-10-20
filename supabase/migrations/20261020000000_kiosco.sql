-- Modo kiosco: los empleados fichan desde un dispositivo autorizado (p. ej.
-- una tablet en la entrada) eligiendo su nombre y escribiendo su PIN.
--
-- * El fichaje se calcula en el servidor, con la hora de Supabase en la zona
--   horaria de zona_horaria(), no con el reloj del dispositivo.
-- * Los PIN se guardan cifrados (bcrypt) en una tabla sin acceso directo.
-- * Tras 5 PIN incorrectos el empleado queda bloqueado 5 minutos.
-- * Un dispositivo solo funciona como kiosco si un admin lo activó desde el
--   panel (recibe un token secreto que se puede revocar).
--
-- Orden: después de 20261019000001_registro_unico_y_admin.sql.
-- Ejecútala una sola vez: volver a ejecutarla después de las migraciones
-- siguientes reemplazaría funciones por versiones anteriores.

-- ---------------------------------------------------------------------------
-- Zona horaria de la empresa (cámbiala aquí si hace falta).
-- ---------------------------------------------------------------------------
create or replace function public.zona_horaria()
returns text
language sql
immutable
as $$ select 'America/Santiago' $$;

-- ---------------------------------------------------------------------------
-- PIN de los empleados
-- ---------------------------------------------------------------------------
alter table public.empleado add column if not exists tiene_pin boolean not null default false;

create table if not exists public.empleado_pin (
  empleado_id        text primary key references public.empleado (id) on delete cascade,
  pin_hash           text not null,
  intentos_fallidos  integer not null default 0,
  bloqueado_hasta    timestamptz,
  updated_date       timestamptz not null default now()
);

-- Sin políticas: nadie lee ni escribe esta tabla directamente, solo las
-- funciones de este archivo.
alter table public.empleado_pin enable row level security;
revoke all on public.empleado_pin from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Dispositivos kiosco
-- ---------------------------------------------------------------------------
create table if not exists public.kiosco (
  id            text primary key default gen_random_uuid()::text,
  nombre        text not null,
  token_hash    text not null unique,
  activo        boolean not null default true,
  ultimo_uso    timestamptz,
  created_by    uuid default auth.uid() references auth.users (id) on delete set null,
  created_date  timestamptz not null default now()
);

alter table public.kiosco enable row level security;

drop policy if exists "admin kiosco" on public.kiosco;
create policy "admin kiosco" on public.kiosco
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Funciones internas (no se pueden llamar desde la app)
-- ---------------------------------------------------------------------------
create or replace function public._hash_token(p_token text)
returns text
language sql
immutable
as $$ select encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') $$;

-- Devuelve el id del kiosco si el token es válido y está activo.
create or replace function public._kiosco_id(p_token text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
begin
  if p_token is null or length(p_token) < 32 then
    return null;
  end if;
  update public.kiosco
     set ultimo_uso = now()
   where token_hash = public._hash_token(p_token) and activo
  returning id into v_id;
  return v_id;
end;
$$;

-- Registra una entrada o salida del día actual (hora del servidor).
-- p_origen: 'empleado' (kiosco) o 'admin' (panel).
create or replace function public._fichar(p_empleado_id text, p_tipo text, p_origen text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp     public.empleado;
  v_rec     public.registro_asistencia;
  v_existe  boolean;
  v_ahora   timestamp := now() at time zone public.zona_horaria();
  v_fecha   date := v_ahora::date;
  v_hora    text := to_char(v_ahora, 'HH24:MI');
  v_nombre  text;
  v_estado  text;
begin
  if p_tipo is null or p_tipo not in ('entrada', 'salida') then
    return jsonb_build_object('ok', false, 'error', 'tipo_invalido');
  end if;

  select * into v_emp from public.empleado where id = p_empleado_id and estado = 'activo';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'empleado_no_encontrado');
  end if;
  v_nombre := trim(v_emp.nombre || ' ' || v_emp.apellidos);

  select * into v_rec
    from public.registro_asistencia
   where empleado_id = p_empleado_id and fecha = v_fecha
   for update;
  v_existe := found;

  if p_tipo = 'entrada' then
    if v_existe and v_rec.hora_entrada is not null then
      return jsonb_build_object('ok', false, 'error', 'ya_fichado', 'tipo', p_tipo,
                                'nombre', v_nombre, 'hora', v_rec.hora_entrada);
    end if;

    v_estado := case
      when v_emp.horario_entrada is not null and v_hora > v_emp.horario_entrada then 'retraso'
      else 'presente'
    end;

    if v_existe then
      -- Vacaciones, permiso o un retraso ya anotado se respetan.
      if v_rec.estado not in ('ausente', 'presente') then
        v_estado := v_rec.estado;
      end if;
      update public.registro_asistencia
         set hora_entrada = v_hora, estado = v_estado, registrado_por = p_origen
       where id = v_rec.id;
    else
      insert into public.registro_asistencia
        (empleado_id, empleado_nombre, fecha, hora_entrada, estado, registrado_por)
      values (p_empleado_id, v_nombre, v_fecha, v_hora, v_estado, p_origen)
      on conflict (empleado_id, fecha) do nothing;
      if not found then
        -- Otro fichaje simultáneo se adelantó.
        return jsonb_build_object('ok', false, 'error', 'ya_fichado', 'tipo', p_tipo,
                                  'nombre', v_nombre, 'hora', v_hora);
      end if;
    end if;
  else
    if v_existe and v_rec.hora_salida is not null then
      return jsonb_build_object('ok', false, 'error', 'ya_fichado', 'tipo', p_tipo,
                                'nombre', v_nombre, 'hora', v_rec.hora_salida);
    end if;

    if v_existe then
      v_estado := v_rec.estado;
      update public.registro_asistencia set hora_salida = v_hora where id = v_rec.id;
    else
      -- Salida sin entrada marcada: se registra igualmente para no perderla.
      v_estado := 'presente';
      insert into public.registro_asistencia
        (empleado_id, empleado_nombre, fecha, hora_salida, estado, registrado_por)
      values (p_empleado_id, v_nombre, v_fecha, v_hora, v_estado, p_origen)
      on conflict (empleado_id, fecha) do nothing;
      if not found then
        return jsonb_build_object('ok', false, 'error', 'ya_fichado', 'tipo', p_tipo,
                                  'nombre', v_nombre, 'hora', v_hora);
      end if;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'tipo', p_tipo, 'nombre', v_nombre,
                            'fecha', v_fecha, 'hora', v_hora, 'estado', v_estado);
end;
$$;

-- ---------------------------------------------------------------------------
-- Funciones para administradores
-- ---------------------------------------------------------------------------

-- Fichaje rápido desde el panel (pantalla Asistencia).
create or replace function public.admin_fichar(p_empleado_id text, p_tipo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return public._fichar(p_empleado_id, p_tipo, 'admin');
end;
$$;

-- Asigna (o quita, con p_pin vacío) el PIN de un empleado.
create or replace function public.empleado_set_pin(p_empleado_id text, p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if not exists (select 1 from public.empleado where id = p_empleado_id) then
    raise exception 'Empleado no encontrado' using errcode = 'P0002';
  end if;

  if p_pin is null or p_pin = '' then
    delete from public.empleado_pin where empleado_id = p_empleado_id;
    update public.empleado set tiene_pin = false where id = p_empleado_id;
    return;
  end if;

  if p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'El PIN debe tener entre 4 y 6 dígitos.' using errcode = '22023';
  end if;
  if p_pin ~ '^(.)\1+$'
     or position(p_pin in '0123456789') > 0
     or position(p_pin in '9876543210') > 0 then
    raise exception 'El PIN es demasiado fácil de adivinar (evita 1111, 1234, 4321...).' using errcode = '22023';
  end if;

  insert into public.empleado_pin (empleado_id, pin_hash)
  values (p_empleado_id, crypt(p_pin, gen_salt('bf', 8)))
  on conflict (empleado_id) do update
    set pin_hash = excluded.pin_hash,
        intentos_fallidos = 0,
        bloqueado_hasta = null,
        updated_date = now();
  update public.empleado set tiene_pin = true where id = p_empleado_id;
end;
$$;

-- Crea un kiosco y devuelve su token (solo se muestra esta vez).
create or replace function public.kiosco_crear(p_nombre text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.kiosco (nombre, token_hash)
  values (coalesce(nullif(trim(p_nombre), ''), 'Kiosco'), public._hash_token(v_token));
  return v_token;
end;
$$;

-- ---------------------------------------------------------------------------
-- Funciones para el dispositivo kiosco (sin sesión, con su token)
-- ---------------------------------------------------------------------------

-- Lista de empleados activos para elegir en pantalla.
create or replace function public.kiosco_empleados(p_token text)
returns table (id text, nombre text, departamento text, tiene_pin boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  if public._kiosco_id(p_token) is null then
    raise exception 'kiosco_no_autorizado' using errcode = '28000';
  end if;
  return query
    select e.id, trim(e.nombre || ' ' || e.apellidos), e.departamento, e.tiene_pin
      from public.empleado e
     where e.estado = 'activo'
     order by e.nombre, e.apellidos;
end;
$$;

-- Fichaje desde el kiosco: comprueba el PIN y registra entrada o salida.
-- Devuelve errores como JSON (no como excepción) para que el contador de
-- intentos fallidos se guarde.
create or replace function public.kiosco_fichar(p_token text, p_empleado_id text, p_pin text, p_tipo text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_pin public.empleado_pin;
begin
  if public._kiosco_id(p_token) is null then
    return jsonb_build_object('ok', false, 'error', 'kiosco_no_autorizado');
  end if;

  select * into v_pin from public.empleado_pin where empleado_id = p_empleado_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'sin_pin');
  end if;

  if v_pin.bloqueado_hasta is not null and v_pin.bloqueado_hasta > now() then
    return jsonb_build_object('ok', false, 'error', 'bloqueado',
      'minutos', ceil(extract(epoch from v_pin.bloqueado_hasta - now()) / 60));
  end if;

  if crypt(coalesce(p_pin, ''), v_pin.pin_hash) is distinct from v_pin.pin_hash then
    if v_pin.intentos_fallidos + 1 >= 5 then
      update public.empleado_pin
         set intentos_fallidos = 0, bloqueado_hasta = now() + interval '5 minutes'
       where empleado_id = p_empleado_id;
      return jsonb_build_object('ok', false, 'error', 'bloqueado', 'minutos', 5);
    end if;
    update public.empleado_pin
       set intentos_fallidos = intentos_fallidos + 1
     where empleado_id = p_empleado_id;
    return jsonb_build_object('ok', false, 'error', 'pin_incorrecto',
      'intentos_restantes', 5 - (v_pin.intentos_fallidos + 1));
  end if;

  if v_pin.intentos_fallidos > 0 or v_pin.bloqueado_hasta is not null then
    update public.empleado_pin
       set intentos_fallidos = 0, bloqueado_hasta = null
     where empleado_id = p_empleado_id;
  end if;

  return public._fichar(p_empleado_id, p_tipo, 'empleado');
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos. Supabase da permiso de ejecución a todos por defecto, así que se
-- quita y se concede solo lo necesario.
-- ---------------------------------------------------------------------------
revoke all on function public._hash_token(text)              from public, anon, authenticated;
revoke all on function public._kiosco_id(text)               from public, anon, authenticated;
revoke all on function public._fichar(text, text, text)      from public, anon, authenticated;

revoke all on function public.admin_fichar(text, text)       from public, anon;
revoke all on function public.empleado_set_pin(text, text)   from public, anon;
revoke all on function public.kiosco_crear(text)             from public, anon;
grant execute on function public.admin_fichar(text, text)     to authenticated;
grant execute on function public.empleado_set_pin(text, text) to authenticated;
grant execute on function public.kiosco_crear(text)           to authenticated;

revoke all on function public.kiosco_empleados(text)                  from public;
revoke all on function public.kiosco_fichar(text, text, text, text)   from public;
grant execute on function public.kiosco_empleados(text)                to anon, authenticated;
grant execute on function public.kiosco_fichar(text, text, text, text) to anon, authenticated;
