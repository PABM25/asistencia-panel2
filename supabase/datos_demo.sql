-- Datos de prueba: 12 empleados, PIN para el kiosco, 3 semanas de asistencia
-- y turnos de esta semana y la próxima.
--
-- Cómo usarlo: pégalo en Supabase → SQL Editor y pulsa Run. Requiere haber
-- ejecutado antes las tres migraciones de supabase/migrations.
--
-- Todos los datos de prueba usan ids que empiezan por "demo-". Ejecutarlo de
-- nuevo borra los datos de prueba anteriores y los vuelve a crear (con las
-- fechas actualizadas). Para quitarlos: supabase/datos_demo_borrar.sql.
-- No toca empleados ni registros reales.
--
-- No se envían emails de aviso por los retrasos/ausencias de prueba.
--
-- PIN para probar el kiosco:
--   Ana Pérez        2580      Diego Fuentes    3691
--   Luis Soto        1470      Valentina Muñoz  4826
--   Camila Rojas     8024      Matías González  5917
--   Javier Díaz      6203      Sofía Herrera    7395
--   Fernanda Castro  9148  (bloqueada 30 min: prueba el bloqueo)
--   Tomás Vargas     — sin PIN (prueba "Sin PIN")
--   Isidora Reyes    — inactiva (no aparece en el kiosco)
--   Benjamín Silva   — inactivo

begin;

-- 1) Limpiar datos de prueba anteriores --------------------------------------
delete from public.turno               where empleado_id like 'demo-%';
delete from public.registro_asistencia where empleado_id like 'demo-%';
delete from public.empleado            where id like 'demo-%';   -- borra también sus PIN

-- 2) Empleados ---------------------------------------------------------------
insert into public.empleado
  (id, nombre, apellidos, email, telefono, departamento, cargo, fecha_alta, estado, horario_entrada, horario_salida)
values
  ('demo-01', 'Ana',       'Pérez',    'ana.perez@demo.cl',       '+56 9 1111 0001', 'Ventas',           'Ejecutiva de ventas',  '2023-03-01', 'activo',   '09:00', '18:00'),
  ('demo-02', 'Luis',      'Soto',     'luis.soto@demo.cl',       '+56 9 1111 0002', 'Tecnología',       'Desarrollador',        '2022-07-15', 'activo',   '09:00', '18:00'),
  ('demo-03', 'Camila',    'Rojas',    'camila.rojas@demo.cl',    '+56 9 1111 0003', 'Recursos Humanos', 'Analista de RR.HH.',   '2021-01-10', 'activo',   '08:30', '17:30'),
  ('demo-04', 'Javier',    'Díaz',     'javier.diaz@demo.cl',     '+56 9 1111 0004', 'Operaciones',      'Supervisor de turno',  '2020-05-04', 'activo',   '07:00', '15:00'),
  ('demo-05', 'Fernanda',  'Castro',   'fernanda.castro@demo.cl', '+56 9 1111 0005', 'Operaciones',      'Operaria',             '2024-02-19', 'activo',   '15:00', '23:00'),
  ('demo-06', 'Diego',     'Fuentes',  'diego.fuentes@demo.cl',   '+56 9 1111 0006', 'Logística',        'Bodeguero',            '2023-09-01', 'activo',   '22:00', '06:00'),
  ('demo-07', 'Valentina', 'Muñoz',    'valentina.munoz@demo.cl', '+56 9 1111 0007', 'Finanzas',         'Contadora',            '2019-11-20', 'activo',   '09:00', '18:00'),
  ('demo-08', 'Matías',    'González', 'matias.gonzalez@demo.cl', '+56 9 1111 0008', 'Marketing',        'Diseñador',            '2024-06-03', 'activo',   '10:00', '19:00'),
  ('demo-09', 'Sofía',     'Herrera',  'sofia.herrera@demo.cl',   '+56 9 1111 0009', 'Administración',   'Asistente',            '2022-03-14', 'activo',   '08:00', '17:00'),
  ('demo-10', 'Tomás',     'Vargas',   'tomas.vargas@demo.cl',    '+56 9 1111 0010', 'Ventas',           'Vendedor',             '2025-08-01', 'activo',   '09:00', '18:00'),
  ('demo-11', 'Isidora',   'Reyes',    'isidora.reyes@demo.cl',   '+56 9 1111 0011', 'Marketing',        'Community manager',    '2021-04-12', 'inactivo', '09:00', '18:00'),
  ('demo-12', 'Benjamín',  'Silva',    'benjamin.silva@demo.cl',  '+56 9 1111 0012', 'Tecnología',       'Soporte',              '2020-10-05', 'inactivo', '09:00', '18:00');

-- 3) PIN (cifrados igual que empleado_set_pin) -------------------------------
insert into public.empleado_pin (empleado_id, pin_hash, bloqueado_hasta)
select v.id, extensions.crypt(v.pin, extensions.gen_salt('bf', 8)), v.bloqueo
from (values
  ('demo-01', '2580', null::timestamptz),
  ('demo-02', '1470', null),
  ('demo-03', '8024', null),
  ('demo-04', '6203', null),
  ('demo-05', '9148', now() + interval '30 minutes'),
  ('demo-06', '3691', null),
  ('demo-07', '4826', null),
  ('demo-08', '5917', null),
  ('demo-09', '7395', null)
) as v(id, pin, bloqueo);

update public.empleado set tiene_pin = true
 where id in (select empleado_id from public.empleado_pin where empleado_id like 'demo-%');

-- 4) Asistencia: últimos 21 días (lunes a viernes, sin hoy) -----------------
-- El estado de cada día sale de un "azar" fijo (hash), así que los datos son
-- variados pero siempre los mismos para la misma fecha.
alter table public.registro_asistencia disable trigger aviso_incidencia;

with hoy as (
  select (now() at time zone 'America/Santiago')::date as d
),
dias as (
  select (hoy.d - n)::date as fecha
  from hoy, generate_series(1, 21) as n
  where extract(isodow from hoy.d - n) < 6
),
base as (
  select e.*, d.fecha,
         abs(hashtext(e.id || d.fecha::text)) % 100 as r,
         abs(hashtext(d.fecha::text || e.id)) % 30  as m
  from public.empleado e
  cross join dias d
  where e.id like 'demo-%'
    and e.estado = 'activo'
    and d.fecha >= e.fecha_alta
),
estados as (
  select *,
    case
      when r < 72 then 'presente'
      when r < 86 then 'retraso'
      when r < 92 then 'ausente'
      when r < 96 then 'permiso'
      else 'vacaciones'
    end as estado_dia
  from base
)
insert into public.registro_asistencia
  (empleado_id, empleado_nombre, fecha, hora_entrada, hora_salida, estado, notas, registrado_por)
select
  id,
  nombre || ' ' || apellidos,
  fecha,
  case estado_dia
    when 'presente' then to_char(horario_entrada::time - make_interval(mins => m % 15), 'HH24:MI')
    when 'retraso'  then to_char(horario_entrada::time + make_interval(mins => 5 + m), 'HH24:MI')
  end,
  case when estado_dia in ('presente', 'retraso')
    then to_char(horario_salida::time + make_interval(mins => m % 20), 'HH24:MI')
  end,
  estado_dia,
  case estado_dia
    when 'permiso'    then 'Trámite personal'
    when 'vacaciones' then 'Vacaciones programadas'
    when 'ausente'    then case when m % 2 = 0 then 'Sin aviso' else 'Licencia médica pendiente' end
  end,
  case when m % 4 = 0 then 'admin' else 'empleado' end
from estados
on conflict (empleado_id, fecha) do nothing;

alter table public.registro_asistencia enable trigger aviso_incidencia;

-- 5) Turnos: esta semana y la próxima (lunes a viernes) ----------------------
with lunes as (
  select date_trunc('week', (now() at time zone 'America/Santiago'))::date as d
)
insert into public.turno
  (id, empleado_id, empleado_nombre, departamento, cargo, fecha, hora_inicio, hora_fin, tipo, minutos_descanso, notas)
select
  'demo-' || e.id || '-' || to_char(f.fecha, 'YYYYMMDD'),
  e.id,
  e.nombre || ' ' || e.apellidos,
  e.departamento,
  e.cargo,
  f.fecha,
  e.horario_entrada,
  e.horario_salida,
  case
    when e.horario_entrada >= '20:00' then 'noche'
    when e.horario_entrada >= '13:00' then 'tarde'
    else 'mañana'
  end,
  case when e.horario_entrada >= '20:00' then 45 else 60 end,
  null
from public.empleado e
cross join lunes
cross join lateral (
  select (lunes.d + n)::date as fecha
  from generate_series(0, 13) as n
  where extract(isodow from lunes.d + n) < 6
) f
where e.id like 'demo-%' and e.estado = 'activo';

commit;

-- Resumen de lo creado
select
  (select count(*) from public.empleado            where id like 'demo-%')          as empleados,
  (select count(*) from public.empleado_pin        where empleado_id like 'demo-%') as con_pin,
  (select count(*) from public.registro_asistencia where empleado_id like 'demo-%') as registros,
  (select count(*) from public.turno               where empleado_id like 'demo-%') as turnos;
