import { before, test } from "node:test";
import assert from "node:assert/strict";
import { crearBase } from "./helpers/db.js";

let b, token;
const fichar = async (pin) =>
  (await b.comoAnon("select public.kiosco_fichar($1, 'e1', $2, 'entrada') as r", [token, pin])).rows[0].r;
const fallar5 = async () => {
  let r;
  for (let i = 0; i < 5; i++) r = await fichar("0000");
  return r;
};
const desbloquearSoloElTiempo = () =>
  b.db.exec("update public.empleado_pin set bloqueado_hasta = now() - interval '1 second' where empleado_id = 'e1'");

before(async () => {
  b = await crearBase();
  await b.db.exec("insert into public.empleado (id, nombre, apellidos, horario_entrada) values ('e1', 'Ana', 'Pérez', '09:00')");
  await b.comoAdmin("select public.empleado_set_pin('e1', '2580')");
  token = (await b.comoAdmin("select public.kiosco_crear('Entrada') as t")).rows[0].t;
});

test("PIN: cada tanda de 5 fallos seguidos bloquea más tiempo", async () => {
  assert.deepEqual(await fallar5(), { ok: false, error: "bloqueado", minutos: 5 });
  await desbloquearSoloElTiempo();
  assert.equal((await fichar("0000")).intentos_restantes, 4, "vuelve a avisar los intentos");
  for (let i = 0; i < 4; i++) await fichar("0000");
  assert.equal(await b.uno("select intentos_fallidos from public.empleado_pin where empleado_id = 'e1'"), 10);
  await desbloquearSoloElTiempo();
  assert.equal((await fallar5()).minutos, 120);
  await desbloquearSoloElTiempo();
  assert.equal((await fallar5()).minutos, 1440);
  await desbloquearSoloElTiempo();
  assert.equal((await fallar5()).minutos, 1440, "el máximo es 24 h");
});

test("PIN: un admin desbloquea y el contador vuelve a empezar", async () => {
  assert.equal((await fichar("2580")).error, "bloqueado");
  await b.comoAdmin("select public.empleado_desbloquear_pin('e1')");
  assert.equal((await fichar("0000")).intentos_restantes, 4);
  assert.equal((await fichar("2580")).ok, true);
  assert.equal(await b.uno("select intentos_fallidos from public.empleado_pin where empleado_id = 'e1'"), 0);
});

test("PIN: entradas absurdas cuentan como fallo, sin error", async () => {
  await b.db.exec("delete from public.registro_asistencia");
  for (const pin of [null, "9".repeat(10000)]) {
    assert.equal((await fichar(pin)).error, "pin_incorrecto");
  }
});

test("la base rechaza horas mal escritas y textos enormes", async () => {
  const malos = [
    "update public.empleado set horario_entrada = '9am' where id = 'e1'",
    "update public.empleado set horario_salida = '25:00' where id = 'e1'",
    "update public.empleado set email = 'no-es-un-email' where id = 'e1'",
    `update public.empleado set nombre = '${"x".repeat(101)}' where id = 'e1'`,
    "insert into public.turno (empleado_id, fecha, hora_inicio, hora_fin) values ('e1', current_date, '8:00', '16:00')",
    "insert into public.turno (empleado_id, fecha, hora_inicio, hora_fin, minutos_descanso) values ('e1', current_date, '08:00', '16:00', -5)",
    `insert into public.registro_asistencia (empleado_id, fecha, notas) values ('e1', '2020-01-01', '${"x".repeat(1001)}')`,
    `select public.kiosco_crear('${"x".repeat(101)}')`,
  ];
  for (const sql of malos) {
    assert.equal((await b.comoAdmin(sql)).code, "23514", sql);
  }
  for (const sql of [
    "update public.empleado set horario_entrada = '08:30', horario_salida = '23:59:00', email = 'ana@empresa.cl' where id = 'e1'",
    "update public.empleado set email = null, telefono = null where id = 'e1'",
  ]) {
    assert.ok(!(await b.comoAdmin(sql)).error, sql);
  }
});

test("nadie llama a las funciones internas nuevas", async () => {
  assert.ok((await b.comoAnon("select public._minutos_bloqueo_pin(1)")).error);
  assert.ok((await b.comoAdmin("select public._minutos_bloqueo_pin(1)")).error);
});
