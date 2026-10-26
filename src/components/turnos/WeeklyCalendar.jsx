import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Sun, Moon, Sunset } from "lucide-react";
import { addDays, format, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { DEPARTAMENTOS } from "@/lib/constants";

const tipoMeta = {
  mañana: { icon: Sun, color: "bg-card text-foreground border-border" },
  tarde: { icon: Sunset, color: "bg-muted text-foreground border-transparent" },
  noche: { icon: Moon, color: "bg-foreground text-background border-foreground" },
  partido: { color: "bg-peach text-sienna border-peach" },
  personalizado: { color: "bg-fog text-muted-foreground border-dashed border-border" },
};

const deptos = DEPARTAMENTOS;

export default function WeeklyCalendar({ turnos, empleados, weekStart, onWeekChange, deptoFilter, onDeptoChange }) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const empleadosVisibles = useMemo(
    () => deptoFilter === "Todos" ? empleados : empleados.filter((e) => e.departamento === deptoFilter),
    [empleados, deptoFilter]
  );

  const turnosPorEmpleadoDia = useMemo(() => {
    const map = {};
    for (const t of turnos) {
      const key = `${t.empleado_id}|${t.fecha}`;
      if (!map[key]) map[key] = [];
      map[key].push(t);
    }
    return map;
  }, [turnos]);

  const weekLabel = `${format(weekStart, "d MMM", { locale: es })} – ${format(addDays(weekStart, 6), "d MMM yyyy", { locale: es })}`;

  // Carga por día (cabecera): solo turnos de los empleados que se muestran.
  const idsVisibles = new Set(empleadosVisibles.map((e) => e.id));
  const cargaPorDia = days.map((d) => {
    const dStr = format(d, "yyyy-MM-dd");
    return turnos.filter((t) => t.fecha === dStr && idsVisibles.has(t.empleado_id)).length;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => onWeekChange(addDays(weekStart, -7))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[160px] text-center capitalize">{weekLabel}</span>
          <Button variant="outline" size="icon" onClick={() => onWeekChange(addDays(weekStart, 7))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onWeekChange(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
            Hoy
          </Button>
        </div>
        <div className="w-full sm:w-56">
          <Select value={deptoFilter} onValueChange={onDeptoChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Todos">Todos los departamentos</SelectItem>
              {deptos.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-3xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="sticky left-0 z-10 bg-muted/40 text-left text-xs font-semibold text-muted-foreground px-3 py-2.5 w-48">
                  Empleado
                </th>
                {days.map((d, i) => (
                  <th key={i} className="text-center text-xs font-semibold px-2 py-2.5">
                    <div className="capitalize">{format(d, "EEE", { locale: es })}</div>
                    <div className="text-[11px] text-muted-foreground font-normal">{format(d, "d MMM", { locale: es })}</div>
                    {cargaPorDia[i] > 0 && (
                      <div className="mt-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-primary/10 text-primary text-[10px] font-semibold">
                        {cargaPorDia[i]}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {empleadosVisibles.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-sm text-muted-foreground py-12">
                    No hay empleados activos en este departamento
                  </td>
                </tr>
              ) : empleadosVisibles.map((emp) => (
                <tr key={emp.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="sticky left-0 z-10 bg-card text-left px-3 py-2 align-top">
                    <div className="font-medium text-sm leading-tight">{emp.nombre} {emp.apellidos}</div>
                    <div className="text-[11px] text-muted-foreground leading-tight">{emp.cargo || "—"}</div>
                  </td>
                  {days.map((d, i) => {
                    const dStr = format(d, "yyyy-MM-dd");
                    const cellTurnos = turnosPorEmpleadoDia[`${emp.id}|${dStr}`] || [];
                    return (
                      <td key={i} className="px-1.5 py-1.5 align-top min-w-[110px]">
                        <div className="flex flex-col gap-1">
                          {cellTurnos.map((t) => {
                            const meta = tipoMeta[t.tipo] || tipoMeta.personalizado;
                            const Icon = meta.icon;
                            return (
                              <div
                                key={t.id}
                                className={`rounded-md border px-1.5 py-1 text-[11px] leading-tight ${meta.color}`}
                              >
                                <div className="flex items-center gap-1 font-medium">
                                  {Icon && <Icon className="h-3 w-3 shrink-0" />}
                                  {t.hora_inicio}–{t.hora_fin}
                                </div>
                                {t.minutos_descanso > 0 && (
                                  <div className="opacity-70">Descanso {t.minutos_descanso}m</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}