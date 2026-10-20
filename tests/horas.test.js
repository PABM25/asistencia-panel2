import { test } from "node:test";
import assert from "node:assert/strict";
import { duracion, formatoHoras, horasRegistro, minutosEsperados } from "../src/lib/horas.js";

const emp = { horario_entrada: "09:00", horario_salida: "18:00" };

test("duración y formato", () => {
  assert.equal(duracion("09:00", "18:00"), 540);
  assert.equal(duracion("22:00", "06:00"), 480, "cruza la medianoche");
  assert.equal(duracion("09:00", null), null);
  assert.equal(formatoHoras(125), "2:05");
  assert.equal(formatoHoras(null), "—");
});

test("horas trabajadas y extra con horario fijo", () => {
  assert.deepEqual(horasRegistro({ hora_entrada: "09:00", hora_salida: "18:00" }, null, emp, 60), { trabajado: 480, extra: 0 });
  assert.deepEqual(horasRegistro({ hora_entrada: "09:00", hora_salida: "19:00" }, null, emp, 60), { trabajado: 540, extra: 60 });
  assert.deepEqual(horasRegistro({ hora_entrada: "09:00", hora_salida: "13:00" }, null, emp, 60), { trabajado: 240, extra: 0 }, "jornada corta: sin descanso");
  assert.equal(horasRegistro({ hora_entrada: "09:00" }, null, emp, 60), null, "sin salida no cuenta");
});

test("con turno: usa el descanso y la duración del turno", () => {
  const noche = [{ hora_inicio: "22:00", hora_fin: "06:00", minutos_descanso: 45 }];
  assert.deepEqual(horasRegistro({ hora_entrada: "21:55", hora_salida: "06:30" }, noche, emp, 60), { trabajado: 470, extra: 35 });
  const partido = [
    { hora_inicio: "08:00", hora_fin: "12:00", minutos_descanso: 0 },
    { hora_inicio: "16:00", hora_fin: "20:00", minutos_descanso: 0 },
  ];
  assert.equal(minutosEsperados(partido, emp, 60), 480);
});
