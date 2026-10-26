import { before, test } from "node:test";
import assert from "node:assert/strict";
import { ADMIN, USUARIO, crearBase, leer } from "./helpers/db.js";

const TOKEN = "demo-publico-pulso-kiosco-no-usar-en-produccion";
const DEMO_ID = "00000000-0000-0000-0000-0000000000de";
const EMAIL = "demo@pulso.test";
const PASSWORD = "clave-de-prueba";
const SIN_COMPLETAR = leer("supabase/demo/configurar_demo.sql");
// Lo que hace quien lo ejecuta: cambia los marcadores en el SQL Editor.
const configurar = SIN_COMPLETAR
  .replace("'<EMAIL_DEMO>'::text", `'${EMAIL}'::text`)
  .replace("'<PASSWORD_DEMO>'::text", `'${PASSWORD}'::text`);

test("el script del repositorio no trae credenciales y no corre sin ellas", async () => {
  assert.doesNotMatch(SIN_COMPLETAR, /demo1234/);
  const b = await crearBase();
  await b.db.exec(leer("supabase/datos_demo.sql"));
  await assert.rejects(b.db.exec(SIN_COMPLETAR), /Cambia <EMAIL_DEMO> y <PASSWORD_DEMO>/);
  await b.db.exec("rollback");
  assert.equal(await b.uno("select to_regclass('public.demo_config')::text"), null);
});

test("no se instala en un proyecto con empleados reales", async () => {
  const b = await crearBase();
  await b.db.exec(leer("supabase/datos_demo.sql"));
  await b.db.exec("insert into public.empleado (id, nombre, apellidos) values ('real-1', 'Real', 'Persona')");
  await assert.rejects(b.db.exec(configurar), /SOLO para un proyecto de demo/);
  await b.db.exec("rollback"); // el SQL Editor de Supabase deshace la transacción solo
  assert.equal(await b.uno("select to_regclass('public.demo_config')::text"), null);
  assert.equal(await b.uno("select count(*)::int from public.empleado where id = 'real-1'"), 1);
});

test("si falta datos_demo.sql lo dice con un mensaje claro", async () => {
  const b = await crearBase();
  await assert.rejects(b.db.exec(configurar), /Primero ejecuta supabase\/datos_demo\.sql/);
  await b.db.exec("rollback");
  assert.equal(await b.uno("select to_regclass('public.demo_config')::text"), null);
});

let b;
const ficharKiosco = async (emp, pin) =>
  (await b.comoAnon("select public.kiosco_fichar($1, $2, $3, 'entrada') as r", [TOKEN, emp, pin])).rows[0].r;

before(async () => {
  b = await crearBase();
  await b.db.exec(leer("supabase/datos_demo.sql"));
  await b.db.exec(`insert into auth.users (id, email) values ('${DEMO_ID}', '${EMAIL}')`);
  await b.db.exec("delete from net.enviados");
  await b.db.exec(configurar);
});

test("configura la demo: datos, kiosco público y cuenta demo admin", async () => {
  assert.equal(await b.uno("select count(*)::int from public.empleado"), 12);
  assert.equal(await b.uno(`select role from public.profiles where id = '${DEMO_ID}'`), "admin");
  assert.equal(
    await b.uno(`select encrypted_password = extensions.crypt('${PASSWORD}', encrypted_password) from auth.users where id = '${DEMO_ID}'`),
    true
  );
  assert.equal(await b.uno("select count(*)::int from net.enviados"), 0, "sin emails");
});

test("el kiosco público funciona sin activar y nadie queda bloqueado", async () => {
  const lista = await b.comoAnon("select * from public.kiosco_empleados($1)", [TOKEN]);
  assert.equal(lista.rows.length, 10);
  assert.equal((await ficharKiosco("demo-01", "2580")).ok, true);
  assert.equal((await ficharKiosco("demo-05", "9148")).ok, true);
});

test("el reinicio deshace lo que hagan los visitantes", async () => {
  // Un visitante (con la cuenta demo) hace de todo
  await b.db.exec(`
    insert into public.empleado (id, nombre, apellidos) values ('visita-1', 'Pepe', 'Visita');
    update public.kiosco set activo = false;
    update public.configuracion set tolerancia_minutos = 60, marcar_ausencias = false;
    delete from public.empleado where id = 'demo-02';
    update auth.users set encrypted_password = 'otra' where id = '${DEMO_ID}';
    update public.profiles set role = 'user' where id = '${DEMO_ID}';`);
  assert.equal((await ficharKiosco("demo-03", "8024")).error, "kiosco_no_autorizado");

  await b.db.exec("select public.reiniciar_demo()");

  assert.equal(await b.uno("select count(*)::int from public.empleado where id = 'visita-1'"), 0);
  assert.equal(await b.uno("select count(*)::int from public.empleado"), 12);
  assert.equal(await b.uno("select tolerancia_minutos from public.configuracion"), 5);
  assert.equal(await b.uno("select role from public.profiles where id = '" + DEMO_ID + "'"), "admin");
  assert.equal(
    await b.uno(`select encrypted_password = extensions.crypt('${PASSWORD}', encrypted_password) from auth.users where id = '${DEMO_ID}'`),
    true
  );
  assert.equal((await ficharKiosco("demo-03", "8024")).ok, true);
  assert.equal(await b.uno(`select count(*)::int from public.registro_asistencia where fecha = '${b.hoy}' and empleado_id = 'demo-01'`), 0, "hoy queda limpio");
});

test("se puede volver a ejecutar aunque haya empleados de visitantes", async () => {
  await b.db.exec("insert into public.empleado (id, nombre, apellidos) values ('visita-2', 'Otra', 'Visita')");
  await b.db.exec(configurar);
  assert.equal(await b.uno("select count(*)::int from public.empleado where id = 'visita-2'"), 0);
});

test("la contraseña no se guarda en texto plano", async () => {
  const [cfg] = await b.q("select * from public.demo_config");
  assert.equal("password" in cfg, false);
  assert.notEqual(cfg.password_hash, PASSWORD);
  assert.equal(await b.uno("select password_hash = extensions.crypt($1, password_hash) from public.demo_config", [PASSWORD]), true);
});

test("un visitante no puede cambiar el rol de la cuenta demo", async () => {
  await b.comoAdmin(`update public.profiles set role = 'user' where id = '${DEMO_ID}'`);
  assert.equal(await b.uno(`select role from public.profiles where id = '${DEMO_ID}'`), "admin");
  // Las demás cuentas no se ven afectadas.
  await b.comoAdmin(`update public.profiles set role = 'user' where id = '${USUARIO}'`);
  await b.comoAdmin(`update public.profiles set role = 'admin' where id = '${USUARIO}'`);
  assert.equal(await b.uno(`select role from public.profiles where id = '${USUARIO}'`), "admin");
});

test("un visitante no puede cambiar la contraseña ni el email de la cuenta demo", async () => {
  // Base aparte: PGlite no deja volver de "set session authorization".
  const otra = await crearBase();
  await otra.db.exec(leer("supabase/datos_demo.sql"));
  await otra.db.exec(`insert into auth.users (id, email) values ('${DEMO_ID}', '${EMAIL}')`);
  await otra.db.exec(configurar);
  // Supabase Auth aplica updateUser() con el rol supabase_auth_admin.
  await otra.db.exec(`
    create role supabase_auth_admin;
    grant usage on schema auth to supabase_auth_admin;
    grant all on auth.users to supabase_auth_admin;
    set session authorization supabase_auth_admin;
    update auth.users set encrypted_password = 'otra', email = 'robada@x.cl';`);
  const usuarios = await otra.q("select id, email, encrypted_password from auth.users order by id");
  const demo = usuarios.find((u) => u.id === DEMO_ID);
  assert.equal(demo.email, EMAIL);
  assert.notEqual(demo.encrypted_password, "otra");
  // Las demás cuentas sí se pueden cambiar.
  assert.equal(usuarios.find((u) => u.id === ADMIN).email, "robada@x.cl");
});

test("nadie puede reiniciar la demo ni leer su configuración desde la app", async () => {
  assert.ok((await b.comoAnon("select public.reiniciar_demo()")).error);
  assert.ok((await b.comoAdmin("select public.reiniciar_demo()")).error);
  assert.ok((await b.comoAnon("select * from public.demo_config")).error);
  assert.ok((await b.comoAdmin("select * from public.demo_config")).error);
});
