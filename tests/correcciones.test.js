import { before, test } from "node:test";
import assert from "node:assert/strict";
import { aplicar, crearBase, hhmm } from "./helpers/db.js";

let b;
before(async () => {
  b = await crearBase();
});

test("turnos duplicados: la migración los elimina y luego no se permiten", async () => {
  const p = await crearBase({ hasta: "20261022000000" });
  await p.db.exec(`insert into public.turno (id, empleado_id, fecha, hora_inicio, hora_fin, created_date) values
    ('t1', 'e1', '2026-10-20', '09:00', '18:00', now() - interval '1 min'),
    ('t2', 'e1', '2026-10-20', '09:00', '18:00', now()),
    ('t3', 'e1', '2026-10-20', '15:00', '19:00', now())`);
  await aplicar(p.db, "20261022000000");
  assert.deepEqual((await p.q("select id from public.turno order by id")).map((r) => r.id), ["t1", "t3"]);
  const dup = await p.comoAdmin("insert into public.turno (empleado_id, fecha, hora_inicio, hora_fin) values ('e1', '2026-10-20', '09:00', '17:00')");
  assert.equal(dup.code, "23505");
});

test("resumen de hoy: sin fichar, pendientes y quién no debía trabajar", async () => {
  await b.db.exec(`
    update public.configuracion set dias_laborales = '{1,2,3,4,5,6,7}', tolerancia_minutos = 5;
    insert into public.empleado (id, nombre, apellidos, horario_entrada) values
      ('r-llego', 'A', 'A', '${hhmm(b.ahora - 60)}'),
      ('r-falta', 'B', 'B', '${hhmm(b.ahora - 60)}'),
      ('r-aun-no', 'C', 'C', '${hhmm(b.ahora + 60)}'),
      ('r-libre', 'D', 'D', '${hhmm(b.ahora - 60)}');
    insert into public.registro_asistencia (empleado_id, fecha, hora_entrada, estado) values ('r-llego', '${b.hoy}', '08:00', 'presente');
    -- r-libre usa turnos esta semana pero no tiene turno hoy: día libre
    insert into public.turno (empleado_id, fecha, hora_inicio, hora_fin)
      select 'r-libre', d::date, '09:00', '18:00'
        from generate_series(date_trunc('week', '${b.hoy}'::date), date_trunc('week', '${b.hoy}'::date) + interval '6 days', interval '1 day') d
       where d::date <> '${b.hoy}'::date;`);
  const r = (await b.comoAdmin("select public.resumen_hoy() as r")).rows[0].r;
  assert.equal(r.activos, 4);
  assert.equal(r.esperados, 3, "r-libre no debía trabajar hoy");
  assert.equal(r.presentes, 1);
  assert.equal(r.sin_fichar, 1, "r-falta ya debería haber llegado");
  assert.equal(r.pendientes, 1, "r-aun-no todavía no empieza");
  assert.equal((await b.comoUsuario("select public.resumen_hoy()")).code, "42501");
  assert.ok((await b.comoAnon("select public.resumen_hoy()")).error);
});

test("un fin de semana sin turnos nadie aparece 'sin fichar'", async () => {
  await b.db.exec("update public.configuracion set dias_laborales = '{}'");
  const r = (await b.comoAdmin("select public.resumen_hoy() as r")).rows[0].r;
  assert.equal(r.sin_fichar, 0);
  assert.equal(r.esperados, 0);
  await b.db.exec("update public.configuracion set dias_laborales = '{1,2,3,4,5}'");
});

test("cambiar nombre o departamento actualiza registros y turnos futuros", async () => {
  await b.db.exec(`
    insert into public.empleado (id, nombre, apellidos, departamento) values ('p1', 'Ana', 'Viejo', 'Ventas');
    insert into public.registro_asistencia (empleado_id, empleado_nombre, fecha, estado) values ('p1', 'Ana Viejo', '2026-01-05', 'presente');
    insert into public.turno (empleado_id, empleado_nombre, departamento, fecha, hora_inicio, hora_fin) values
      ('p1', 'Ana Viejo', 'Ventas', '2026-01-05', '09:00', '18:00'),
      ('p1', 'Ana Viejo', 'Ventas', '${b.hoy}'::date + 7, '09:00', '18:00');`);
  await b.comoAdmin("update public.empleado set apellidos = 'Nuevo', departamento = 'Finanzas' where id = 'p1'");
  assert.equal(await b.uno("select empleado_nombre from public.registro_asistencia where empleado_id = 'p1'"), "Ana Nuevo");
  assert.deepEqual(
    await b.q("select empleado_nombre, departamento from public.turno where empleado_id = 'p1' order by fecha"),
    [
      { empleado_nombre: "Ana Nuevo", departamento: "Ventas" }, // turno pasado: conserva el departamento
      { empleado_nombre: "Ana Nuevo", departamento: "Finanzas" },
    ]
  );
});

test("eliminar un empleado borra sus turnos futuros y conserva el historial", async () => {
  await b.comoAdmin("delete from public.empleado where id = 'p1'");
  assert.equal(await b.uno("select count(*)::int from public.turno where empleado_id = 'p1'"), 1);
  assert.equal(await b.uno("select count(*)::int from public.registro_asistencia where empleado_id = 'p1'"), 1);
});

test("avisos: un email por retraso manual, ninguno por ausencia automática", async () => {
  await b.db.exec("delete from net.enviados");
  await b.db.exec(`insert into public.empleado (id, nombre, apellidos, fecha_alta) values ('m1', 'Mario', 'M', '2020-01-01'), ('m2', 'Marta', 'M', '2020-01-01')`);
  await b.comoAdmin(`insert into public.registro_asistencia (empleado_id, empleado_nombre, fecha, estado) values ('m1', 'Mario M', '2026-10-01', 'retraso')`);
  assert.equal(await b.uno("select count(*)::int from net.enviados"), 1);
  await b.db.exec("delete from net.enviados");
  // Miércoles: m2 y otros empleados de prueba quedan ausentes -> un solo resumen
  const n = (await b.comoAdmin("select public.marcar_ausencias('2026-10-07') as n")).rows[0].n;
  assert.ok(n >= 2);
  const enviados = await b.q("select body from net.enviados");
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0].body.tipo, "resumen_ausencias");
  assert.ok(enviados[0].body.empleados.includes("Marta M"));
});

test("las funciones internas nuevas no se pueden llamar desde la app", async () => {
  for (const sql of [
    "select public._debe_trabajar('m1', '2026-10-07')",
    "select public._notificar('{}'::jsonb)",
    "select public._enviar_resumen_ausencias('2026-10-07')",
  ]) {
    assert.ok((await b.comoAdmin(sql)).error, sql);
    assert.ok((await b.comoAnon(sql)).error, sql);
  }
});
