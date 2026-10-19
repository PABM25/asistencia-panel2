import { format } from "date-fns";

// Fecha local en formato yyyy-MM-dd. No usar toISOString(): devuelve la fecha
// en UTC, que en Chile ya es "mañana" a partir de las 20:00/21:00.
export const toDateStr = (date) => format(date, "yyyy-MM-dd");
export const todayStr = () => toDateStr(new Date());

// Convierte "yyyy-MM-dd" en un Date a medianoche local (new Date("yyyy-MM-dd")
// lo interpretaría como medianoche UTC, es decir, el día anterior en Chile).
export const parseDateStr = (str) => new Date(`${str}T00:00`);

export const DEPARTAMENTOS = [
  "Administración",
  "Ventas",
  "Marketing",
  "Tecnología",
  "Recursos Humanos",
  "Operaciones",
  "Finanzas",
  "Logística",
];

export const ESTADOS_ASISTENCIA = ["presente", "retraso", "ausente", "vacaciones", "permiso"];

export const estadoBadge = {
  presente: "bg-emerald-500/10 text-emerald-600",
  retraso: "bg-amber-500/10 text-amber-600",
  ausente: "bg-rose-500/10 text-rose-600",
  vacaciones: "bg-sky-500/10 text-sky-600",
  permiso: "bg-violet-500/10 text-violet-600",
};
