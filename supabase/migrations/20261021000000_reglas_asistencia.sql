-- Reglas de asistencia:
--  * Ajustes editables desde la app (tabla configuracion): minutos de
--    tolerancia, descanso por defecto, días laborales y ausencias automáticas.
--  * Feriados (tabla feriado): no se marcan ausencias esos días.
--  * El retraso se calcula contra el turno del día (si tiene) o contra el
--    horario fijo del empleado, más la tolerancia.
--  * Turnos de noche: una salida de madrugada cierra la jornada que empezó el
--    día anterior.
--  * Ausencias automáticas: cada madrugada se marca "ausente" a quien debía
--    trabajar el día anterior y no fichó (necesita pg_cron, ver README).
--
-- Ejecútalo DESPUÉS de 20261020000000_kiosco.sql.
-- AVISO: ejecútala una sola vez, en orden. Volver a ejecutarla después de
-- migraciones posteriores reemplazaría funciones por versiones antiguas.

-- ---------------------------------------------------------------------------
-- Ajustes (una sola fila)
-- ---------------------------------------------------------------------------
create table if not exists public.configuracion (
  id                  integer primary key default 1 check (id = 1),
  tolerancia_minutos  integer not null default 5  check (tolerancia_minutos between 0 and 120),
  descanso_minutos    integer not null default 60 check (descanso_minutos between 0 and 240),
  -- 1 = lunes ... 7 = domingo (ISO). Se usan para quien no tiene turnos asignados.
  dias_laborales      integer[] not null default '{1,2,3,4,5}'
                      check (dias_laborales <@ '{1,2,3,4,5,6,7}'::integer[]),
  marcar_ausencias    boolean not null default true,
  updated_date        timestamptz not null default now()
);
insert into public.configuracion (id) values (1) on conflict (id) do nothing;

drop trigger if exists configuracion_updated on public.configuracion;
create trigger configuracion_updated before update on public.configuracion
  for each row execute function public.set_updated_date();

alter table public.configuracion enable row level security;
drop policy if exists "admin lee configuracion" on public.configuracion;
create policy "admin lee configuracion" on public.configuracion
  for select to authenticated using (public.is_admin());
drop policy if exists "admin edita configuracion" on public.configuracion;
create policy "admin edita configuracion" on public.configuracion
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Feriados
-- ---------------------------------------------------------------------------
create table if not exists public.feriado (
  fecha         date primary key,
  nombre        text not null,
  created_date  timestamptz not null default now()
);

alter table public.feriado enable row level security;
drop policy if exists "admin feriado" on public.feriado;
create policy "admin feriado" on public.feriado
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Nuevo origen 'sistema' para las ausencias automáticas
-- ---------------------------------------------------------------------------
alter table public.registro_asistencia
  drop constraint if exists registro_asistencia_registrado_por_check;
alter table public.registro_asistencia
  add constraint registro_asistencia_registrado_por_check
  check (registrado_por in ('admin', 'empleado', 'sistema'));

-- ---------------------------------------------------------------------------
-- Funciones auxiliares
-- ---------------------------------------------------------------------------

-- "HH:MM" (o "HH:MM:SS") -> minutos desde medianoche.
create or replace function public._minutos(p_hora text)
returns integer
language sql
immutable
as $$
  select case when p_hora is null or p_hora = '' then null
              else (extract(hour from p_hora::time) * 60 + extract(minute from p_hora::time))::integer
         end
$$;

-- Hora de inicio y fin esperadas de un empleado en una fecha:
-- el primer turno de ese día, o su horario fijo si no tiene turno.
create or replace function public._jornada_esperada(p_empleado_id text, p_fecha date)
returns table (inicio text, fin text, con_turno boolean)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(t.hora_inicio, e.horario_entrada),
         coalesce(t.hora_fin, e.horario_salida),
         t.hora_inicio is not null
    from public.empleado e
    left join lateral (
      select hora_inicio, hora_fin
        from public.turno
       where empleado_id = e.id and fecha = p_fecha
       order by hora_inicio
       limit 1
    ) t on true
   where e.id = p_empleado_id
$$;

-- ---------------------------------------------------------------------------
-- Fichaje (reemplaza la versión de 20261020000000_kiosco.sql)
-- ---------------------------------------------------------------------------
create or replace function public._fichar(p_empleado_id text, p_tipo text, p_origen text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp       public.empleado;
  v_rec       public.registro_asistencia;
  v_ayer_rec  public.registro_asistencia;
  v_existe    boolean;
  v_ahora     timestamp := now() at time zone public.zona_horaria();
  v_fecha     date := v_ahora::date;
  v_hora      text := to_char(v_ahora, 'HH24:MI');
  v_nombre    text;
  v_estado    text;
  v_tol       integer;
  v_inicio    text;
  v_ayer_ini  text;
  v_ayer_fin  text;
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

    select tolerancia_minutos into v_tol from public.configuracion where id = 1;
    select inicio into v_inicio from public._jornada_esperada(p_empleado_id, v_fecha);

    v_estado := case
      when v_inicio is not null
           and public._minutos(v_hora) > public._minutos(v_inicio) + coalesce(v_tol, 0)
        then 'retraso'
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

    return jsonb_build_object('ok', true, 'tipo', p_tipo, 'nombre', v_nombre,
                              'fecha', v_fecha, 'hora', v_hora, 'estado', v_estado,
                              'esperada', v_inicio);
  end if;

  -- Salida ------------------------------------------------------------------
  if v_existe and v_rec.hora_salida is not null then
    return jsonb_build_object('ok', false, 'error', 'ya_fichado', 'tipo', p_tipo,
                              'nombre', v_nombre, 'hora', v_rec.hora_salida);
  end if;

  -- Turno de noche: una salida antes del mediodía, sin entrada hoy, cierra la
  -- jornada de ayer si esa jornada cruza la medianoche y quedó abierta.
  if (not v_existe or v_rec.hora_entrada is null) and v_hora < '12:00' then
    select inicio, fin into v_ayer_ini, v_ayer_fin
      from public._jornada_esperada(p_empleado_id, v_fecha - 1);
    if public._minutos(v_ayer_fin) < public._minutos(v_ayer_ini) then
      select * into v_ayer_rec
        from public.registro_asistencia
       where empleado_id = p_empleado_id and fecha = v_fecha - 1
         and hora_entrada is not null and hora_salida is null
       for update;
      if found then
        update public.registro_asistencia set hora_salida = v_hora where id = v_ayer_rec.id;
        return jsonb_build_object('ok', true, 'tipo', p_tipo, 'nombre', v_nombre,
                                  'fecha', v_fecha - 1, 'hora', v_hora,
                                  'estado', v_ayer_rec.estado, 'turno_noche', true);
      end if;
    end if;
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

  return jsonb_build_object('ok', true, 'tipo', p_tipo, 'nombre', v_nombre,
                            'fecha', v_fecha, 'hora', v_hora, 'estado', v_estado);
end;
$$;

-- ---------------------------------------------------------------------------
-- Ausencias automáticas
-- ---------------------------------------------------------------------------

-- Marca "ausente" a los empleados activos que debían trabajar en p_fecha y no
-- tienen ningún registro ese día. Debía trabajar si:
--   * tiene un turno asignado ese día, o
--   * no tiene ningún turno esa semana (no usa turnos), el día es laboral
--     según configuracion.dias_laborales y no es feriado.
-- Devuelve cuántas ausencias marcó.
create or replace function public._marcar_ausencias(p_fecha date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg     public.configuracion;
  v_lunes   date := date_trunc('week', p_fecha)::date;
  v_n       integer;
begin
  select * into v_cfg from public.configuracion where id = 1;

  insert into public.registro_asistencia
    (empleado_id, empleado_nombre, fecha, estado, notas, registrado_por)
  select e.id, trim(e.nombre || ' ' || e.apellidos), p_fecha, 'ausente',
         'Sin fichaje (marcado automáticamente)', 'sistema'
    from public.empleado e
   where e.estado = 'activo'
     and (e.fecha_alta is null or e.fecha_alta <= p_fecha)
     and (
       exists (select 1 from public.turno t where t.empleado_id = e.id and t.fecha = p_fecha)
       or (
         extract(isodow from p_fecha)::integer = any (v_cfg.dias_laborales)
         and not exists (select 1 from public.feriado f where f.fecha = p_fecha)
         and not exists (
           select 1 from public.turno t
            where t.empleado_id = e.id and t.fecha between v_lunes and v_lunes + 6
         )
       )
     )
  on conflict (empleado_id, fecha) do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Para la tarea programada: marca las ausencias de ayer si está activado.
create or replace function public._marcar_ausencias_ayer()
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce((select marcar_ausencias from public.configuracion where id = 1), false) then
    return 0;
  end if;
  return public._marcar_ausencias(((now() at time zone public.zona_horaria())::date) - 1);
end;
$$;

-- Para el botón de Ajustes: un admin marca las ausencias de un día pasado.
create or replace function public.marcar_ausencias(p_fecha date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_fecha is null or p_fecha >= (now() at time zone public.zona_horaria())::date then
    raise exception 'Solo se pueden marcar ausencias de días que ya terminaron.' using errcode = '22023';
  end if;
  return public._marcar_ausencias(p_fecha);
end;
$$;

-- ¿Está programada la tarea diaria? (para mostrarlo en Ajustes)
create or replace function public.ausencias_programadas()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v boolean := false;
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute 'select exists (select 1 from cron.job where jobname = ''marcar-ausencias'')' into v;
  end if;
  return v;
end;
$$;

-- Programa la tarea diaria si pg_cron está activado. Corre a las 07:00 UTC
-- (03:00 o 04:00 en Chile) y procesa el día anterior.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $cron$select cron.schedule('marcar-ausencias', '0 7 * * *', 'select public._marcar_ausencias_ayer()')$cron$;
  else
    raise notice 'pg_cron no está activado: las ausencias automáticas no se programaron (ver README).';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
revoke all on function public._jornada_esperada(text, date)  from public, anon, authenticated;
revoke all on function public._marcar_ausencias(date)         from public, anon, authenticated;
revoke all on function public._marcar_ausencias_ayer()        from public, anon, authenticated;
revoke all on function public._fichar(text, text, text)       from public, anon, authenticated;

revoke all on function public.marcar_ausencias(date)          from public, anon;
revoke all on function public.ausencias_programadas()         from public, anon;
grant execute on function public.marcar_ausencias(date)        to authenticated;
grant execute on function public.ausencias_programadas()       to authenticated;
