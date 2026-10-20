-- Correcciones de la segunda revisión:
--  1. Turnos: no se permiten dos turnos del mismo empleado, el mismo día y a la
--     misma hora de inicio (se eliminan los duplicados que ya existan).
--  2. "Debe trabajar": una sola regla para las ausencias automáticas y para el
--     resumen del Dashboard (resumen_hoy).
--  3. Los registros y turnos copian el nombre/departamento del empleado: se
--     actualizan solos cuando el empleado cambia.
--  4. Al eliminar un empleado se borran sus turnos futuros.
--  5. Avisos por email: las ausencias automáticas se envían en UN resumen
--     diario en vez de un email por ausencia.
--  6. La tarea diaria de ausencias se puede programar desde Ajustes (ya no hay
--     que volver a ejecutar migraciones).
--  7. Un admin puede desbloquear el PIN de un empleado sin cambiárselo.
--
-- Ejecútalo DESPUÉS de 20261021000000_reglas_asistencia.sql.
-- IMPORTANTE: no vuelvas a ejecutar migraciones anteriores después de esta;
-- reemplazarían funciones por versiones antiguas.

-- ---------------------------------------------------------------------------
-- 1) Turnos únicos por empleado, fecha y hora de inicio
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'turno_empleado_fecha_inicio_key') then
    return;
  end if;
  delete from public.turno t
   using (
     select id, first_value(id) over (
       partition by empleado_id, fecha, hora_inicio order by created_date, id
     ) as keep_id
     from public.turno
   ) g
   where t.id = g.id and g.id <> g.keep_id;
  alter table public.turno
    add constraint turno_empleado_fecha_inicio_key unique (empleado_id, fecha, hora_inicio);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) ¿Debía trabajar este empleado en esta fecha?
--    * activo y ya dado de alta, y
--    * tiene un turno ese día, o
--    * no tiene turnos esa semana (no usa turnos), el día es laboral y no es
--      feriado.
-- ---------------------------------------------------------------------------
create or replace function public._debe_trabajar(p_empleado_id text, p_fecha date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.empleado e
      cross join public.configuracion c
     where e.id = p_empleado_id
       and c.id = 1
       and e.estado = 'activo'
       and (e.fecha_alta is null or e.fecha_alta <= p_fecha)
       and (
         exists (select 1 from public.turno t where t.empleado_id = e.id and t.fecha = p_fecha)
         or (
           extract(isodow from p_fecha)::integer = any (c.dias_laborales)
           and not exists (select 1 from public.feriado f where f.fecha = p_fecha)
           and not exists (
             select 1 from public.turno t
              where t.empleado_id = e.id
                and t.fecha between date_trunc('week', p_fecha)::date
                                and date_trunc('week', p_fecha)::date + 6
           )
         )
       )
  )
$$;

create or replace function public._marcar_ausencias(p_fecha date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  insert into public.registro_asistencia
    (empleado_id, empleado_nombre, fecha, estado, notas, registrado_por)
  select e.id, trim(e.nombre || ' ' || e.apellidos), p_fecha, 'ausente',
         'Sin fichaje (marcado automáticamente)', 'sistema'
    from public.empleado e
   where public._debe_trabajar(e.id, p_fecha)
  on conflict (empleado_id, fecha) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Resumen de hoy para el Dashboard.
--   sin_fichar: debían trabajar, no tienen registro y su hora de entrada
--               (más la tolerancia) ya pasó.
--   pendientes: debían trabajar, no tienen registro y aún no es su hora.
create or replace function public.resumen_hoy()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ahora  timestamp := now() at time zone public.zona_horaria();
  v_hoy    date := v_ahora::date;
  v_min    integer := public._minutos(to_char(v_ahora, 'HH24:MI'));
  v_tol    integer := coalesce((select tolerancia_minutos from public.configuracion where id = 1), 0);
  v        jsonb;
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  with activos as (
    select e.id from public.empleado e where e.estado = 'activo'
  ),
  regs as (
    select r.empleado_id, r.estado from public.registro_asistencia r where r.fecha = v_hoy
  ),
  esperados as (
    select a.id, j.inicio
      from activos a
      cross join lateral public._jornada_esperada(a.id, v_hoy) j
     where public._debe_trabajar(a.id, v_hoy)
  ),
  faltan as (
    select x.* from esperados x where not exists (select 1 from regs r where r.empleado_id = x.id)
  )
  select jsonb_build_object(
    'activos',    (select count(*) from activos),
    'esperados',  (select count(*) from esperados),
    'presentes',  (select count(*) from regs where estado = 'presente'),
    'retrasos',   (select count(*) from regs where estado = 'retraso'),
    'ausentes',   (select count(*) from regs where estado = 'ausente'),
    'permisos',   (select count(*) from regs where estado in ('vacaciones', 'permiso')),
    'sin_fichar', (select count(*) from faltan
                    where inicio is null or public._minutos(inicio) + v_tol < v_min),
    'pendientes', (select count(*) from faltan
                    where inicio is not null and public._minutos(inicio) + v_tol >= v_min)
  ) into v;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Mantener al día los datos copiados del empleado
-- ---------------------------------------------------------------------------
create or replace function public.propagar_cambios_empleado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy date := (now() at time zone public.zona_horaria())::date;
begin
  if (new.nombre, new.apellidos) is distinct from (old.nombre, old.apellidos) then
    update public.registro_asistencia
       set empleado_nombre = trim(new.nombre || ' ' || new.apellidos)
     where empleado_id = new.id;
    update public.turno
       set empleado_nombre = trim(new.nombre || ' ' || new.apellidos)
     where empleado_id = new.id;
  end if;
  -- El departamento y cargo de turnos pasados se conservan como historial.
  if (new.departamento, new.cargo) is distinct from (old.departamento, old.cargo) then
    update public.turno
       set departamento = new.departamento, cargo = new.cargo
     where empleado_id = new.id and fecha >= v_hoy;
  end if;
  return new;
end;
$$;

drop trigger if exists empleado_propagar on public.empleado;
create trigger empleado_propagar
  after update of nombre, apellidos, departamento, cargo on public.empleado
  for each row execute function public.propagar_cambios_empleado();

-- ---------------------------------------------------------------------------
-- 4) Al eliminar un empleado, sus turnos futuros se borran (los pasados y los
--    registros de asistencia se conservan como historial).
-- ---------------------------------------------------------------------------
create or replace function public.limpiar_turnos_empleado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.turno
   where empleado_id = old.id
     and fecha >= (now() at time zone public.zona_horaria())::date;
  return old;
end;
$$;

drop trigger if exists empleado_limpiar_turnos on public.empleado;
create trigger empleado_limpiar_turnos
  after delete on public.empleado
  for each row execute function public.limpiar_turnos_empleado();

-- ---------------------------------------------------------------------------
-- 5) Avisos por email
-- ---------------------------------------------------------------------------

-- Llama a la Edge Function notificar-incidencia (si los secretos de Vault
-- están configurados; si no, no hace nada).
create or replace function public._notificar(p_body jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fn_url    text;
  fn_secret text;
begin
  select decrypted_secret into fn_url
    from vault.decrypted_secrets where name = 'notificar_incidencia_url';
  select decrypted_secret into fn_secret
    from vault.decrypted_secrets where name = 'notificar_incidencia_secret';
  if fn_url is null or fn_secret is null then
    return;
  end if;
  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', fn_secret),
    body    := p_body
  );
end;
$$;

-- Un email por retraso o ausencia registrada a mano o en el kiosco. Las
-- ausencias automáticas (origen 'sistema') van en el resumen diario.
create or replace function public.avisar_incidencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado not in ('retraso', 'ausente') or new.registrado_por = 'sistema' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.estado is not distinct from new.estado then
    return new;
  end if;
  perform public._notificar(jsonb_build_object(
    'empleado',     new.empleado_nombre,
    'fecha',        new.fecha,
    'estado',       new.estado,
    'hora_entrada', new.hora_entrada,
    'notas',        new.notas
  ));
  return new;
end;
$$;

-- Un solo email con todas las ausencias automáticas de un día.
create or replace function public._enviar_resumen_ausencias(p_fecha date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lista jsonb;
begin
  select jsonb_agg(empleado_nombre order by empleado_nombre) into v_lista
    from public.registro_asistencia
   where fecha = p_fecha and estado = 'ausente' and registrado_por = 'sistema';
  if v_lista is null then
    return;
  end if;
  perform public._notificar(jsonb_build_object(
    'tipo', 'resumen_ausencias', 'fecha', p_fecha, 'empleados', v_lista
  ));
end;
$$;

create or replace function public._marcar_ausencias_ayer()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fecha date := ((now() at time zone public.zona_horaria())::date) - 1;
  v_n     integer;
begin
  if not coalesce((select marcar_ausencias from public.configuracion where id = 1), false) then
    return 0;
  end if;
  v_n := public._marcar_ausencias(v_fecha);
  if v_n > 0 then
    perform public._enviar_resumen_ausencias(v_fecha);
  end if;
  return v_n;
end;
$$;

create or replace function public.marcar_ausencias(p_fecha date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_fecha is null or p_fecha >= (now() at time zone public.zona_horaria())::date then
    raise exception 'Solo se pueden marcar ausencias de días que ya terminaron.' using errcode = '22023';
  end if;
  v_n := public._marcar_ausencias(p_fecha);
  if v_n > 0 then
    perform public._enviar_resumen_ausencias(p_fecha);
  end if;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Programar la tarea diaria desde Ajustes. Devuelve false si pg_cron no
--    está activado.
-- ---------------------------------------------------------------------------
create or replace function public.programar_tarea_ausencias()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return false;
  end if;
  -- 07:00 UTC = 03:00 o 04:00 en Chile; procesa el día anterior.
  execute $cron$select cron.schedule('marcar-ausencias', '0 7 * * *', 'select public._marcar_ausencias_ayer()')$cron$;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) Desbloquear un PIN sin cambiarlo
-- ---------------------------------------------------------------------------
create or replace function public.empleado_desbloquear_pin(p_empleado_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  update public.empleado_pin
     set intentos_fallidos = 0, bloqueado_hasta = null
   where empleado_id = p_empleado_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
revoke all on function public._debe_trabajar(text, date)          from public, anon, authenticated;
revoke all on function public._marcar_ausencias(date)             from public, anon, authenticated;
revoke all on function public._marcar_ausencias_ayer()            from public, anon, authenticated;
revoke all on function public._notificar(jsonb)                   from public, anon, authenticated;
revoke all on function public._enviar_resumen_ausencias(date)     from public, anon, authenticated;
revoke all on function public.propagar_cambios_empleado()         from public, anon, authenticated;
revoke all on function public.limpiar_turnos_empleado()           from public, anon, authenticated;
revoke all on function public.avisar_incidencia()                 from public, anon, authenticated;

revoke all on function public.resumen_hoy()                       from public, anon;
revoke all on function public.marcar_ausencias(date)              from public, anon;
revoke all on function public.programar_tarea_ausencias()         from public, anon;
revoke all on function public.empleado_desbloquear_pin(text)      from public, anon;
grant execute on function public.resumen_hoy()                    to authenticated;
grant execute on function public.marcar_ausencias(date)           to authenticated;
grant execute on function public.programar_tarea_ausencias()      to authenticated;
grant execute on function public.empleado_desbloquear_pin(text)   to authenticated;
