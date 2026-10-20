import { test } from "node:test";
import assert from "node:assert/strict";
import { crearBase, leer } from "./helpers/db.js";

test("datos de prueba: se pueden cargar dos veces, sin tocar datos reales ni enviar emails", async () => {
  const b = await crearBase();
  await b.db.exec(`insert into public.empleado (id, nombre, apellidos) values ('real-1', 'Real', 'Persona');
    insert into public.registro_asistencia (empleado_id, fecha, estado) values ('real-1', '2026-10-01', 'presente');`);
  await b.db.exec("delete from net.enviados");

  const demo = leer("supabase/datos_demo.sql");
  const r1 = (await b.db.exec(demo)).at(-1).rows[0];
  const r2 = (await b.db.exec(demo)).at(-1).rows[0];
  assert.deepEqual(r1, r2);
  assert.equal(Number(r1.empleados), 12);
  assert.equal(Number(r1.con_pin), 9);

  assert.equal(await b.uno("select count(*)::int from net.enviados"), 0);
  assert.equal(await b.uno("select tgenabled from pg_trigger where tgname = 'aviso_incidencia'"), "O");
  assert.equal(await b.uno("select count(*)::int from public.registro_asistencia where empleado_id = 'real-1'"), 1);
  assert.equal(await b.uno(`select count(*)::int from public.registro_asistencia where empleado_id like 'demo-%' and fecha = '${b.hoy}'`), 0);

  // Retrasos y llegadas puntuales coherentes con la tolerancia (5 min)
  assert.equal(await b.uno(`select count(*)::int from public.registro_asistencia r join public.empleado e on e.id = r.empleado_id
    where r.estado = 'retraso' and public._minutos(r.hora_entrada) <= public._minutos(e.horario_entrada) + 5`), 0);
  assert.equal(await b.uno(`select count(*)::int from public.registro_asistencia r join public.empleado e on e.id = r.empleado_id
    where r.estado = 'presente' and r.hora_entrada > e.horario_entrada`), 0);

  // Los PIN de prueba funcionan en el kiosco
  await b.db.exec("create or replace function public.is_admin() returns boolean language sql as $$ select true $$");
  const token = await b.uno("select public.kiosco_crear('Test')");
  const fichar = async (e, p) => (await b.q("select public.kiosco_fichar($1, $2, $3, 'entrada') as r", [token, e, p]))[0].r;
  assert.equal((await fichar("demo-01", "2580")).ok, true);
  assert.equal((await fichar("demo-05", "9148")).error, "bloqueado");
  assert.equal((await fichar("demo-10", "1111")).error, "sin_pin");

  await b.db.exec(leer("supabase/datos_demo_borrar.sql"));
  assert.equal(await b.uno("select count(*)::int from public.empleado"), 1);
  assert.equal(await b.uno("select count(*)::int from public.turno"), 0);
});
