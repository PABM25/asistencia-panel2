-- 1) Un único registro de asistencia por empleado y día.
-- 2) Evita que dos registros simultáneos en una base vacía queden ambos como admin.
--
-- Ejecútalo DESPUÉS de 20261019000000_esquema_inicial.sql (`supabase db push`
-- o pegándolo en el SQL Editor). Se puede ejecutar más de una vez.

-- ---------------------------------------------------------------------------
-- 1) Fusionar duplicados existentes y añadir la restricción única.
--    Por cada (empleado_id, fecha) con varios registros se conserva el más
--    antiguo, con la entrada más temprana, la salida más tardía y las notas
--    de todos. El estado del registro conservado no se toca (así no se
--    vuelven a enviar avisos por email).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'registro_asistencia_empleado_fecha_key'
  ) then
    return;
  end if;

  with grupos as (
    select
      id,
      first_value(id) over w as keep_id,
      count(*) over (partition by empleado_id, fecha) as n
    from public.registro_asistencia
    window w as (partition by empleado_id, fecha order by created_date, id)
  ),
  resumen as (
    select
      g.keep_id,
      min(r.hora_entrada) as hora_entrada,
      max(r.hora_salida)  as hora_salida,
      string_agg(distinct nullif(trim(r.notas), ''), ' | ') as notas
    from grupos g
    join public.registro_asistencia r on r.id = g.id
    where g.n > 1
    group by g.keep_id
  )
  update public.registro_asistencia t
     set hora_entrada = coalesce(s.hora_entrada, t.hora_entrada),
         hora_salida  = coalesce(s.hora_salida, t.hora_salida),
         notas        = coalesce(s.notas, t.notas)
    from resumen s
   where t.id = s.keep_id;

  delete from public.registro_asistencia r
   using (
     select id, first_value(id) over (partition by empleado_id, fecha order by created_date, id) as keep_id
     from public.registro_asistencia
   ) g
   where r.id = g.id and g.id <> g.keep_id;

  alter table public.registro_asistencia
    add constraint registro_asistencia_empleado_fecha_key unique (empleado_id, fecha);
end;
$$;

-- El índice (empleado_id, fecha) queda cubierto por la restricción única.
drop index if exists public.registro_empleado_fecha_idx;

-- ---------------------------------------------------------------------------
-- 2) Primer usuario = admin, sin carreras.
--    El bloqueo serializa las altas simultáneas: la segunda espera a que la
--    primera termine y entonces ya ve su perfil.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('public.handle_new_user'));

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    case when exists (select 1 from public.profiles) then 'user' else 'admin' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
