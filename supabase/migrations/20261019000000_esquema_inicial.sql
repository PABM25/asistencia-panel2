-- Esquema base de Pulso: perfiles y roles, empleados, registros de asistencia,
-- turnos, seguridad (RLS) y aviso por email de incidencias.
--
-- Primera migración: `supabase db push`, o pégala en el SQL Editor de Supabase.
-- Ejecútala una sola vez: volver a ejecutarla después de las migraciones
-- siguientes reemplazaría funciones por versiones anteriores.

create extension if not exists pgcrypto;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- Perfiles: un registro por usuario de Supabase Auth, con su rol.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text,
  role        text not null default 'user' check (role in ('admin', 'user')),
  created_date timestamptz not null default now()
);

-- Crea el perfil al registrarse. El PRIMER usuario queda como administrador;
-- los siguientes entran como 'user' hasta que un admin los promueva.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ¿El usuario actual es administrador? (security definer evita recursión en RLS)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Tablas de la app
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_date()
returns trigger
language plpgsql
as $$
begin
  new.updated_date := now();
  return new;
end;
$$;

create table if not exists public.empleado (
  id               text primary key default gen_random_uuid()::text,
  nombre           text not null,
  apellidos        text not null,
  email            text,
  telefono         text,
  departamento     text,
  cargo            text,
  fecha_alta       date,
  estado           text not null default 'activo' check (estado in ('activo', 'inactivo')),
  horario_entrada  text default '09:00',
  horario_salida   text default '17:00',
  created_by       uuid default auth.uid() references auth.users (id) on delete set null,
  created_date     timestamptz not null default now(),
  updated_date     timestamptz not null default now()
);

create table if not exists public.registro_asistencia (
  id               text primary key default gen_random_uuid()::text,
  -- Sin clave foránea a propósito: el historial se conserva aunque se borre el empleado.
  -- Los id son texto para poder importar identificadores de otros sistemas.
  empleado_id      text not null,
  empleado_nombre  text,
  fecha            date not null,
  hora_entrada     text,
  hora_salida      text,
  estado           text not null default 'presente'
                   check (estado in ('presente', 'retraso', 'ausente', 'vacaciones', 'permiso')),
  notas            text,
  registrado_por   text not null default 'admin' check (registrado_por in ('admin', 'empleado')),
  created_by       uuid default auth.uid() references auth.users (id) on delete set null,
  created_date     timestamptz not null default now(),
  updated_date     timestamptz not null default now()
);

create table if not exists public.turno (
  id                text primary key default gen_random_uuid()::text,
  empleado_id       text not null,
  empleado_nombre   text,
  departamento      text,
  cargo             text,
  fecha             date not null,
  hora_inicio       text not null,
  hora_fin          text not null,
  tipo              text not null default 'mañana'
                    check (tipo in ('mañana', 'tarde', 'noche', 'partido', 'personalizado')),
  minutos_descanso  integer not null default 0,
  notas             text,
  created_by        uuid default auth.uid() references auth.users (id) on delete set null,
  created_date      timestamptz not null default now(),
  updated_date      timestamptz not null default now()
);

create index if not exists empleado_estado_idx       on public.empleado (estado);
create index if not exists empleado_apellidos_idx    on public.empleado (apellidos);
create index if not exists registro_fecha_idx        on public.registro_asistencia (fecha);
create index if not exists registro_empleado_fecha_idx on public.registro_asistencia (empleado_id, fecha);
create index if not exists turno_fecha_idx           on public.turno (fecha);
create index if not exists turno_empleado_idx        on public.turno (empleado_id);

drop trigger if exists empleado_updated on public.empleado;
create trigger empleado_updated before update on public.empleado
  for each row execute function public.set_updated_date();
drop trigger if exists registro_updated on public.registro_asistencia;
create trigger registro_updated before update on public.registro_asistencia
  for each row execute function public.set_updated_date();
drop trigger if exists turno_updated on public.turno;
create trigger turno_updated before update on public.turno
  for each row execute function public.set_updated_date();

-- ---------------------------------------------------------------------------
-- Seguridad (RLS): solo los administradores leen y escriben datos.
-- ---------------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.empleado            enable row level security;
alter table public.registro_asistencia enable row level security;
alter table public.turno               enable row level security;

drop policy if exists "perfil propio o admin" on public.profiles;
create policy "perfil propio o admin" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "admin gestiona perfiles" on public.profiles;
create policy "admin gestiona perfiles" on public.profiles
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin empleado" on public.empleado;
create policy "admin empleado" on public.empleado
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin registro" on public.registro_asistencia;
create policy "admin registro" on public.registro_asistencia
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin turno" on public.turno;
create policy "admin turno" on public.turno
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Aviso por email de retrasos y ausencias.
-- Llama a la Edge Function `notificar-incidencia` cuando un registro se crea
-- como retraso/ausente, o cambia a uno de esos estados.
-- Necesita dos secretos en Vault (ver README):
--   notificar_incidencia_url     -> https://<proyecto>.supabase.co/functions/v1/notificar-incidencia
--   notificar_incidencia_secret  -> el mismo valor que NOTIFY_SECRET de la función
-- Si no están configurados, simplemente no se envía nada.
-- ---------------------------------------------------------------------------
create or replace function public.avisar_incidencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fn_url    text;
  fn_secret text;
begin
  if new.estado not in ('retraso', 'ausente') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.estado is not distinct from new.estado then
    return new;
  end if;

  select decrypted_secret into fn_url
    from vault.decrypted_secrets where name = 'notificar_incidencia_url';
  select decrypted_secret into fn_secret
    from vault.decrypted_secrets where name = 'notificar_incidencia_secret';

  if fn_url is null or fn_secret is null then
    return new;
  end if;

  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', fn_secret
    ),
    body    := jsonb_build_object(
      'empleado',     new.empleado_nombre,
      'fecha',        new.fecha,
      'estado',       new.estado,
      'hora_entrada', new.hora_entrada,
      'notas',        new.notas
    )
  );
  return new;
end;
$$;

drop trigger if exists aviso_incidencia on public.registro_asistencia;
create trigger aviso_incidencia
  after insert or update of estado on public.registro_asistencia
  for each row execute function public.avisar_incidencia();
