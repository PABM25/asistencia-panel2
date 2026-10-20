// Cálculo de horas trabajadas y horas extra a partir de los registros.

// "HH:MM" (o "HH:MM:SS") -> minutos desde medianoche.
export function aMinutos(hora) {
  if (!hora) return null;
  const [h, m] = String(hora).split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

// Minutos entre dos horas; si la salida es anterior a la entrada, la jornada
// cruzó la medianoche (turno de noche).
export function duracion(inicio, fin) {
  const a = aMinutos(inicio);
  const b = aMinutos(fin);
  if (a == null || b == null) return null;
  const d = b - a;
  return d < 0 ? d + 1440 : d;
}

// 125 -> "2:05"
export function formatoHoras(minutos) {
  if (minutos == null) return "—";
  const m = Math.round(minutos);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

// Jornada esperada de un registro: los turnos de ese día (suma, por si es un
// turno partido) o, si no tiene turno, el horario fijo del empleado menos el
// descanso por defecto.
export function minutosEsperados(turnosDelDia, empleado, descansoDefecto) {
  if (turnosDelDia?.length) {
    return turnosDelDia.reduce(
      (acc, t) => acc + Math.max(0, (duracion(t.hora_inicio, t.hora_fin) ?? 0) - (t.minutos_descanso || 0)),
      0
    );
  }
  const total = duracion(empleado?.horario_entrada, empleado?.horario_salida);
  return total == null ? null : Math.max(0, total - descansoDefecto);
}

// Horas de un registro: solo cuenta si tiene entrada y salida. El descanso es
// el del turno del día (o el por defecto), y nunca deja la jornada en negativo.
export function horasRegistro(registro, turnosDelDia, empleado, descansoDefecto) {
  const bruto = duracion(registro.hora_entrada, registro.hora_salida);
  if (bruto == null) return null;
  const descanso = turnosDelDia?.length
    ? turnosDelDia.reduce((acc, t) => acc + (t.minutos_descanso || 0), 0)
    : descansoDefecto;
  // Jornadas cortas (menos de 6 h) no descuentan descanso.
  const trabajado = bruto > 360 ? Math.max(0, bruto - descanso) : bruto;
  const esperado = minutosEsperados(turnosDelDia, empleado, descansoDefecto);
  return {
    trabajado,
    extra: esperado == null ? 0 : Math.max(0, trabajado - esperado),
  };
}
