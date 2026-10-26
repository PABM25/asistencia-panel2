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

// Paleta casi monocroma: el melocotón queda para lo que pide atención (retraso)
// y la tinta llena para la ausencia. El texto de la etiqueta siempre dice el estado.
export const estadoBadge = {
  presente: "bg-card text-foreground ring-1 ring-inset ring-border",
  retraso: "bg-peach text-sienna",
  ausente: "bg-foreground text-background",
  vacaciones: "bg-muted text-muted-foreground",
  permiso: "bg-muted text-muted-foreground border border-dashed border-border",
};
