-- Borra todos los datos de prueba creados por datos_demo.sql (ids "demo-...").
-- No toca empleados ni registros reales.
begin;
delete from public.turno               where empleado_id like 'demo-%';
delete from public.registro_asistencia where empleado_id like 'demo-%';
delete from public.empleado            where id like 'demo-%';   -- borra también sus PIN
drop function if exists public._cargar_datos_demo(boolean);
commit;
