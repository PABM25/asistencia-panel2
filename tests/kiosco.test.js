import { before, test } from "node:test";
import assert from "node:assert/strict";
import { crearBase, hhmm } from "./helpers/db.js";

let b, token;
const fichar = async (emp, pin, tipo) =>
  (await b.comoAnon("select public.kiosco_fichar($1, $2, $3, $4) as r", [token, emp, pin, tipo])).rows[0].r;

before(async () => {
  b = await crearBase();
  await b.db.exec(`insert into public.empleado (id, nombre, apellidos, horario_entrada) values
    ('e1', 'Ana', 'Pérez', '${hhmm(b.ahora - 60)}'),
    ('e2', 'Luis', 'Soto', '23:59'),
    ('e3', 'Inés', 'Rojas', '09:00')`);
});

test("PIN: rechaza PIN débiles o mal formados", async () => {
  for (const pin of ["1234", "7777", "9876", "12a4", "123", "1234567"]) {
    const r = await b.comoAdmin("select public.empleado_set_pin('e1', $1)", [pin]);
    assert.ok(r.error, `debería rechazar ${pin}`);
  }
});

test("PIN: un admin lo asigna; nadie más puede", async () => {
  assert.ok(!(await b.comoAdmin("select public.empleado_set_pin('e1', '2580')")).error);
  assert.ok(!(await b.comoAdmin("select public.empleado_set_pin('e2', '135790')")).error);
  assert.equal(await b.uno("select tiene_pin from public.empleado where id = 'e1'"), true);
  assert.equal((await b.comoUsuario("select public.empleado_set_pin('e3', '2580')")).code, "42501");
  assert.ok((await b.comoAnon("select public.empleado_set_pin('e3', '2580')")).error);
});

test("kiosco: solo un admin lo crea y el token es secreto", async () => {
  token = (await b.comoAdmin("select public.kiosco_crear('Entrada') as t")).rows[0].t;
  assert.equal(token.length, 64);
  assert.equal((await b.comoUsuario("select public.kiosco_crear('x')")).code, "42501");
  const anon = await b.comoAnon("select * from public.kiosco");
  assert.ok(anon.error || anon.rows.length === 0);
});

test("nadie lee los PIN ni llama a las funciones internas", async () => {
  assert.ok((await b.comoAnon("select * from public.empleado_pin")).error);
  assert.ok((await b.comoAdmin("select * from public.empleado_pin")).error);
  assert.ok((await b.comoAnon("select public._fichar('e1', 'entrada', 'empleado')")).error);
  assert.ok((await b.comoAnon("select public.admin_fichar('e1', 'entrada')")).error);
});

test("kiosco: lista de empleados solo con token válido", async () => {
  const falso = await b.comoAnon("select * from public.kiosco_empleados($1)", ["x".repeat(64)]);
  assert.match(falso.error, /kiosco_no_autorizado/);
  const lista = await b.comoAnon("select * from public.kiosco_empleados($1)", [token]);
  assert.equal(lista.rows.length, 3);
});

test("PIN incorrecto: avisa intentos restantes y bloquea al quinto", async () => {
  assert.equal((await fichar("e3", "2580", "entrada")).error, "sin_pin");
  for (let i = 1; i <= 4; i++) {
    const r = await fichar("e1", "0000", "entrada");
    assert.equal(r.error, "pin_incorrecto");
    assert.equal(r.intentos_restantes, 5 - i);
  }
  assert.equal((await fichar("e1", "0000", "entrada")).error, "bloqueado");
  assert.equal((await fichar("e1", "2580", "entrada")).error, "bloqueado");
});

test("desbloquear sin cambiar el PIN", async () => {
  assert.equal((await b.comoUsuario("select public.empleado_desbloquear_pin('e1')")).code, "42501");
  assert.ok(!(await b.comoAdmin("select public.empleado_desbloquear_pin('e1')")).error);
  const r = await fichar("e1", "2580", "entrada");
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.estado, "retraso");
});

test("no se puede marcar dos veces la entrada ni la salida", async () => {
  assert.equal((await fichar("e1", "2580", "entrada")).error, "ya_fichado");
  assert.equal((await fichar("e1", "2580", "salida")).ok, true);
  assert.equal((await fichar("e1", "2580", "salida")).error, "ya_fichado");
  assert.equal((await fichar("e2", "135790", "almuerzo")).error, "tipo_invalido");
});

test("fichaje desde el panel: solo admin, con origen 'admin'", async () => {
  assert.equal((await b.comoUsuario("select public.admin_fichar('e3', 'entrada')")).code, "42501");
  const r = (await b.comoAdmin("select public.admin_fichar('e3', 'entrada') as r")).rows[0].r;
  assert.equal(r.ok, true);
  assert.equal(await b.uno("select registrado_por from public.registro_asistencia where empleado_id = 'e3'"), "admin");
  assert.equal(await b.uno("select registrado_por from public.registro_asistencia where empleado_id = 'e1'"), "empleado");
  assert.equal(await b.uno("select fecha::text from public.registro_asistencia where empleado_id = 'e1'"), b.hoy);
});

test("un kiosco revocado deja de funcionar", async () => {
  await b.comoAdmin("update public.kiosco set activo = false");
  assert.equal((await fichar("e2", "135790", "entrada")).error, "kiosco_no_autorizado");
});
