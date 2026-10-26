-- Endurecimiento de seguridad:
--  1. PIN del kiosco: el bloqueo crece con cada tanda de 5 fallos seguidos
--     (5 min, 30 min, 2 h y después 24 h). Antes el contador volvía a cero tras
--     cada bloqueo y permitía probar ~1.400 PIN al día por empleado.
--  2. Validación en la base de datos (no solo en la app): formato de las horas
--     y largo máximo de los textos. Un valor como '9am' en un horario rompía
--     los cálculos de retraso de ese empleado.
--
-- Orden: después de 20261022000000_correcciones.sql.
-- Ejecútala una sola vez: volver a ejecutarla después de las migraciones
-- siguientes reemplazaría funciones por versiones anteriores.

-- ---------------------------------------------------------------------------
-- 1) Bloqueo progresivo del PIN
-- ---------------------------------------------------------------------------

-- Minutos de bloqueo tras la tanda número p_tanda de 5 fallos seguidos.
create or replace function public._minutos_bloqueo_pin(p_tanda integer)
returns integer
language sql
immutable
as $$
  select case
    when p_tanda <= 1 then 5
    when p_tanda = 2 then 30
    when p_tanda = 3 then 120
    else 1440
  end
$$;

-- Igual que en 20261020000000_kiosco.sql, salvo que intentos_fallidos cuenta
-- los fallos seguidos y ya no se pone a cero al bloquear: solo un PIN
-- correcto, un PIN nuevo o el desbloqueo de un admin lo reinician.
create or replace function public.kiosco_fichar(p_token text, p_empleado_id text, p_pin text, p_tipo text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_pin      public.empleado_pin;
  v_fallos   integer;
  v_minutos  integer;
begin
  if public._kiosco_id(p_token) is null then
    return jsonb_build_object('ok', false, 'error', 'kiosco_no_autorizado');
  end if;

  -- Un PIN válido tiene como máximo 6 dígitos: no se gasta bcrypt en
  -- entradas enormes enviadas a propósito.
  if p_pin is null or length(p_pin) > 6 then
    p_pin := '';
  end if;

  select * into v_pin from public.empleado_pin where empleado_id = p_empleado_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'sin_pin');
  end if;

  if v_pin.bloqueado_hasta is not null and v_pin.bloqueado_hasta > now() then
    return jsonb_build_object('ok', false, 'error', 'bloqueado',
      'minutos', ceil(extract(epoch from v_pin.bloqueado_hasta - now()) / 60));
  end if;

  if crypt(p_pin, v_pin.pin_hash) is distinct from v_pin.pin_hash then
    v_fallos := v_pin.intentos_fallidos + 1;
    if v_fallos % 5 = 0 then
      v_minutos := public._minutos_bloqueo_pin(v_fallos / 5);
      update public.empleado_pin
         set intentos_fallidos = v_fallos,
             bloqueado_hasta = now() + make_interval(mins => v_minutos)
       where empleado_id = p_empleado_id;
      return jsonb_build_object('ok', false, 'error', 'bloqueado', 'minutos', v_minutos);
    end if;
    update public.empleado_pin
       set intentos_fallidos = v_fallos
     where empleado_id = p_empleado_id;
    return jsonb_build_object('ok', false, 'error', 'pin_incorrecto',
      'intentos_restantes', 5 - v_fallos % 5);
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
-- 2) Validación de datos
--    NOT VALID: se aplican a todo lo que se guarde desde ahora sin rechazar la
--    migración por filas antiguas. Para revisar las antiguas:
--      alter table public.empleado validate constraint empleado_horario_entrada_formato;
-- ---------------------------------------------------------------------------
create or replace function public._es_hora(p_hora text)
returns boolean
language sql
immutable
as $$ select p_hora is null or p_hora ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' $$;

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('empleado', 'empleado_horario_entrada_formato', 'public._es_hora(horario_entrada)'),
      ('empleado', 'empleado_horario_salida_formato',  'public._es_hora(horario_salida)'),
      ('empleado', 'empleado_textos_largo',
         'length(nombre) <= 100 and length(apellidos) <= 100 and length(email) <= 254
          and length(telefono) <= 40 and length(departamento) <= 100 and length(cargo) <= 100'),
      ('empleado', 'empleado_email_formato', $c$email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'$c$),
      ('registro_asistencia', 'registro_horas_formato',
         'public._es_hora(hora_entrada) and public._es_hora(hora_salida)'),
      ('registro_asistencia', 'registro_textos_largo',
         'length(empleado_nombre) <= 250 and length(notas) <= 1000'),
      ('turno', 'turno_horas_formato', 'public._es_hora(hora_inicio) and public._es_hora(hora_fin)'),
      ('turno', 'turno_textos_largo',
         'length(empleado_nombre) <= 250 and length(departamento) <= 100
          and length(cargo) <= 100 and length(notas) <= 1000'),
      ('turno', 'turno_descanso_rango', 'minutos_descanso between 0 and 720'),
      ('kiosco', 'kiosco_nombre_largo', 'length(nombre) <= 100'),
      ('feriado', 'feriado_nombre_largo', 'length(nombre) <= 100')
    ) as v(tabla, nombre, regla)
  loop
    if not exists (select 1 from pg_constraint where conname = r.nombre) then
      -- Solo se interpolan los literales de esta lista, nunca datos externos.
      execute format('alter table public.%I add constraint %I check (%s) not valid',
                     r.tabla, r.nombre, r.regla);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
revoke all on function public._minutos_bloqueo_pin(integer) from public, anon, authenticated;

revoke all on function public.kiosco_fichar(text, text, text, text) from public;
grant execute on function public.kiosco_fichar(text, text, text, text) to anon, authenticated;
