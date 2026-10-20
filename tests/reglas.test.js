import { before, test } from "node:test";
import assert from "node:assert/strict";
import { crearBase, hhmm } from "./helpers/db.js";

let b;
const fichar = async (id, tipo) => (await b.q("select public._fichar($1, $2, 'admin') as r", [id, tipo]))[0].r;

before(async () => {
  b = await crearBase();
});

test("tolerancia: 3 min tarde es presente, 10 min es retraso", async () => {
  await b.db.exec(`insert into public.empleado (id, nombre, apellidos, horario_entrada) values
    ('t1', 'A', 'A', '${hhmm(b.ahora - 3)}'), ('t2', 'B', 'B', '${hhmm(b.ahora - 10)}')`);
  assert.equal((await fichar("t1", "entrada")).estado, "presente");
  assert.equal((await fichar("t2", "entrada")).estado, "retraso");
});

test("el turno del día manda sobre el horario fijo", async () => {
  await b.db.exec(`insert into public.empleado (id, nombre, apellidos, horario_entrada) values ('t3', 'C', 'C', '${hhmm(b.ahora - 60)}');
    insert into public.turno (empleado_id, fecha, hora_inicio, hora_fin) values ('t3', '${b.hoy}', '${hhmm(b.ahora + 30)}', '23:59')`);
  const r = await fichar("t3", "entrada");
  assert.equal(r.estado, "presente");
  assert.equal(r.esperada, hhmm(b.ahora + 30));
});

test("la tolerancia se puede cambiar", async () => {
  await b.db.exec(`update public.configuracion set tolerancia_minutos = 15;
    insert into public.empleado (id, nombre, apellidos, horario_entrada) values ('t4', 'D', 'D', '${hhmm(b.ahora - 10)}')`);
  assert.equal((await fichar("t4", "entrada")).estado, "presente");
  await b.db.exec("update public.configuracion set tolerancia_minutos = 5");
});

test("turno de noche: la salida de madrugada cierra la jornada de ayer", async (t) => {
  if (b.ahora >= 720) return t.skip("solo se puede probar antes del mediodía");
  await b.db.exec(`insert into public.empleado (id, nombre, apellidos, horario_entrada, horario_salida) values
      ('n1', 'Noche', 'N', '22:00', '06:00'), ('n2', 'Dia', 'D', '09:00', '18:00');
    insert into public.registro_asistencia (empleado_id, fecha, hora_entrada, estado) values
      ('n1', '${b.ayer}', '21:58', 'presente'), ('n2', '${b.ayer}', '09:00', 'presente')`);
  const r1 = await fichar("n1", "salida");
  assert.equal(r1.turno_noche, true);
  assert.equal(r1.fecha, b.ayer);
  assert.equal(await b.uno(`select count(*)::int from public.registro_asistencia where empleado_id = 'n1' and fecha = '${b.hoy}'`), 0);
  const r2 = await fichar("n2", "salida");
  assert.equal(r2.turno_noche, undefined);
  assert.equal(r2.fecha, b.hoy);
});

test("ausencias automáticas: a quién marca y a quién no", async () => {
  const X = "2026-10-14"; // miércoles; semana del lunes 12 al domingo 18
  await b.db.exec(`
    insert into public.empleado (id, nombre, apellidos, estado, fecha_alta) values
      ('a-sin-turno', 'A', 'SinTurno', 'activo', '2020-01-01'),
      ('a-ficho', 'B', 'Ficho', 'activo', '2020-01-01'),
      ('a-turno-hoy', 'C', 'TurnoHoy', 'activo', '2020-01-01'),
      ('a-libre', 'D', 'DiaLibre', 'activo', '2020-01-01'),
      ('a-inactivo', 'E', 'Inactivo', 'inactivo', '2020-01-01'),
      ('a-nuevo', 'F', 'Nuevo', 'activo', '2026-10-20'),
      ('a-vacas', 'G', 'Vacaciones', 'activo', '2020-01-01');
    insert into public.registro_asistencia (empleado_id, fecha, hora_entrada, estado) values ('a-ficho', '${X}', '09:00', 'presente');
    insert into public.registro_asistencia (empleado_id, fecha, estado) values ('a-vacas', '${X}', 'vacaciones');
    insert into public.turno (empleado_id, fecha, hora_inicio, hora_fin) values
      ('a-turno-hoy', '${X}', '14:00', '22:00'), ('a-libre', '2026-10-13', '09:00', '18:00');`);
  await b.comoAdmin("select public.marcar_ausencias($1)", [X]);
  const aus = (await b.q(`select empleado_id from public.registro_asistencia where fecha = '${X}' and estado = 'ausente'`)).map((r) => r.empleado_id);
  assert.ok(aus.includes("a-sin-turno"));
  assert.ok(aus.includes("a-turno-hoy"));
  for (const no of ["a-ficho", "a-libre", "a-inactivo", "a-nuevo", "a-vacas"]) assert.ok(!aus.includes(no), no);
  assert.equal(await b.uno(`select registrado_por from public.registro_asistencia where empleado_id = 'a-sin-turno' and fecha = '${X}'`), "sistema");
  assert.equal((await b.comoAdmin("select public.marcar_ausencias($1) as n", [X])).rows[0].n, 0, "repetir no duplica");
});

test("ausencias: respeta feriados y días no laborales", async () => {
  await b.db.exec("insert into public.feriado (fecha, nombre) values ('2026-10-15', 'Feriado de prueba')");
  await b.comoAdmin("select public.marcar_ausencias('2026-10-15')");
  assert.equal(await b.uno("select count(*)::int from public.registro_asistencia where fecha = '2026-10-15' and empleado_id = 'a-sin-turno'"), 0);
  assert.equal((await b.comoAdmin("select public.marcar_ausencias('2026-10-17') as n")).rows[0].n, 0);
});

test("ausencias: solo días pasados y solo admin", async () => {
  assert.match((await b.comoAdmin("select public.marcar_ausencias($1)", [b.hoy])).error, /ya terminaron/);
  assert.equal((await b.comoUsuario("select public.marcar_ausencias('2026-10-16')")).code, "42501");
  assert.ok((await b.comoAnon("select public.marcar_ausencias('2026-10-16')")).error);
  assert.ok((await b.comoAnon("select public._marcar_ausencias('2026-10-16')")).error);
});

test("ajustes: solo admin los lee y edita, con valores válidos", async () => {
  assert.equal((await b.comoUsuario("select * from public.configuracion")).rows.length, 0);
  assert.equal((await b.comoAdmin("select * from public.configuracion")).rows.length, 1);
  assert.equal((await b.comoUsuario("update public.configuracion set tolerancia_minutos = 99 returning 1")).rows.length, 0);
  assert.ok((await b.comoAdmin("update public.configuracion set tolerancia_minutos = 500")).error);
  assert.ok((await b.comoAdmin("update public.configuracion set dias_laborales = '{8}'")).error);
  assert.ok((await b.comoUsuario("insert into public.feriado values ('2026-12-25', 'Navidad')")).error);
  assert.ok(!(await b.comoAdmin("insert into public.feriado values ('2026-12-25', 'Navidad')")).error);
});

test("sin pg_cron la tarea no queda programada", async () => {
  assert.equal((await b.comoAdmin("select public.ausencias_programadas() as v")).rows[0].v, false);
  assert.equal((await b.comoAdmin("select public.programar_tarea_ausencias() as v")).rows[0].v, false);
  assert.equal((await b.comoUsuario("select public.programar_tarea_ausencias()")).code, "42501");
});

test("la tarea diaria respeta el interruptor de Ajustes", async () => {
  await b.db.exec("update public.configuracion set marcar_ausencias = false");
  assert.equal(await b.uno("select public._marcar_ausencias_ayer()"), 0);
  await b.db.exec("update public.configuracion set marcar_ausencias = true");
});
