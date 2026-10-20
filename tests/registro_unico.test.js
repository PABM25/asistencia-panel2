import { test } from "node:test";
import assert from "node:assert/strict";
import { aplicar, crearBase } from "./helpers/db.js";

test("la migración fusiona registros duplicados y crea la restricción única", async () => {
  const { db, q, comoAdmin } = await crearBase({ hasta: "20261019000001" });
  await db.exec(`
    insert into public.registro_asistencia (id, empleado_id, fecha, hora_entrada, hora_salida, estado, notas, created_date) values
      ('r1', 'e1', '2026-10-19', '09:10', null,    'retraso',  'nota A', now() - interval '3 min'),
      ('r2', 'e1', '2026-10-19', null,    '18:00', 'presente', 'nota B', now() - interval '2 min'),
      ('r3', 'e1', '2026-10-19', '08:55', null,    'presente', null,     now() - interval '1 min'),
      ('r4', 'e2', '2026-10-19', '09:00', '17:00', 'presente', null,     now());
  `);
  await aplicar(db, "20261019000001");

  const filas = await q("select id, hora_entrada, hora_salida, estado, notas from public.registro_asistencia order by id");
  assert.deepEqual(filas, [
    { id: "r1", hora_entrada: "08:55", hora_salida: "18:00", estado: "retraso", notas: "nota A | nota B" },
    { id: "r4", hora_entrada: "09:00", hora_salida: "17:00", estado: "presente", notas: null },
  ]);

  const dup = await comoAdmin("insert into public.registro_asistencia (empleado_id, fecha) values ('e2', '2026-10-19')");
  assert.equal(dup.code, "23505");
});

test("solo el primer usuario registrado queda como admin", async () => {
  const { q } = await crearBase();
  assert.deepEqual(await q("select email, role from public.profiles order by email"), [
    { email: "admin@x.cl", role: "admin" },
    { email: "user@x.cl", role: "user" },
  ]);
});
