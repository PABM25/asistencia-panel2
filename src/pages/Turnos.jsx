import { useEffect, useState } from "react";
import { db } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CalendarClock, Plus, Pencil, Trash2, Sun, Moon, Sunset, Users, List, CalendarRange } from "lucide-react";
import { format, startOfWeek, addDays } from "date-fns";
import { es } from "date-fns/locale";
import TurnoForm from "@/components/turnos/TurnoForm";
import BulkTurnosDialog from "@/components/turnos/BulkTurnosDialog";
import WeeklyCalendar from "@/components/turnos/WeeklyCalendar";
import { DEPARTAMENTOS, todayStr, toDateStr, parseDateStr } from "@/lib/constants";
import { notifyError } from "@/lib/notify";

const tipos = ["mañana", "tarde", "noche", "partido", "personalizado"];

const tipoMeta = {
  mañana: { icon: Sun, color: "text-amber-600 bg-amber-500/10" },
  tarde: { icon: Sunset, color: "text-orange-600 bg-orange-500/10" },
  noche: { icon: Moon, color: "text-indigo-600 bg-indigo-500/10" },
  partido: { color: "text-violet-600 bg-violet-500/10" },
  personalizado: { color: "text-muted-foreground bg-muted" },
};

const deptos = DEPARTAMENTOS;

export default function Turnos() {
  const [empleados, setEmpleados] = useState([]);
  const [turnos, setTurnos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterFecha, setFilterFecha] = useState(todayStr());
  const [filterDepto, setFilterDepto] = useState("Todos");
  const [filterEmp, setFilterEmp] = useState("Todos");
  const [view, setView] = useState("lista");
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [formOpen, setFormOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  const loadEmpleados = async () => {
    try {
      const res = await db.entities.Empleado.filterAll({ estado: "activo" }, { sort: "apellidos" });
      setEmpleados(res.items || []);
    } catch (err) {
      notifyError(err, "No se pudieron cargar los empleados");
    }
  };

  const loadTurnos = async () => {
    setLoading(true);
    try {
      const query = {};
      if (view === "lista") {
        if (filterFecha) query.fecha = filterFecha;
        if (filterEmp !== "Todos") query.empleado_id = filterEmp;
      } else {
        query.fecha = { $gte: toDateStr(weekStart), $lte: toDateStr(addDays(weekStart, 6)) };
      }
      if (filterDepto !== "Todos") query.departamento = filterDepto;
      const res = await db.entities.Turno.filterAll(query, { sort: "hora_inicio" });
      setTurnos(res.items || []);
    } catch (err) {
      notifyError(err, "No se pudieron cargar los turnos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmpleados();
  }, []);

  useEffect(() => {
    loadTurnos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterFecha, filterDepto, filterEmp, view, weekStart]);

  const onDelete = async () => {
    try {
      await db.entities.Turno.delete(toDelete.id);
      loadTurnos();
    } catch (err) {
      notifyError(err, "No se pudo eliminar el turno");
    } finally {
      setToDelete(null);
    }
  };

  const empleadosFiltrados = filterDepto === "Todos"
    ? empleados
    : empleados.filter((e) => e.departamento === filterDepto);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Turnos</h1>
          <p className="text-sm text-muted-foreground">Asigna horarios específicos a cada empleado según su departamento y cargo</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
            <Button
              variant={view === "lista" ? "default" : "ghost"}
              size="sm"
              onClick={() => setView("lista")}
              className={view === "lista" ? "" : "text-muted-foreground"}
            >
              <List className="h-4 w-4 mr-1" /> Lista
            </Button>
            <Button
              variant={view === "calendario" ? "default" : "ghost"}
              size="sm"
              onClick={() => setView("calendario")}
              className={view === "calendario" ? "" : "text-muted-foreground"}
            >
              <CalendarRange className="h-4 w-4 mr-1" /> Semana
            </Button>
          </div>
          <Button variant="outline" onClick={() => setBulkOpen(true)}>
            <Users className="h-4 w-4 mr-1" /> <span className="hidden sm:inline">Por departamento</span>
          </Button>
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> <span className="hidden sm:inline">Asignar turno</span>
          </Button>
        </div>
      </div>

      {view === "lista" && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="grid gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Fecha</label>
            <Input type="date" value={filterFecha} onChange={(e) => setFilterFecha(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Departamento</label>
            <Select value={filterDepto} onValueChange={setFilterDepto}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Todos">Todos</SelectItem>
                {deptos.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Empleado</label>
            <Select value={filterEmp} onValueChange={setFilterEmp}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Todos">Todos</SelectItem>
                {empleadosFiltrados.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.nombre} {e.apellidos}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {view === "lista" ? (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <div className="h-8 w-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
            </div>
          ) : turnos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CalendarClock className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No hay turnos asignados para estos filtros</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empleado</TableHead>
                    <TableHead className="hidden md:table-cell">Cargo</TableHead>
                    <TableHead className="hidden lg:table-cell">Departamento</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Horario</TableHead>
                    <TableHead className="hidden md:table-cell">Descanso</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {turnos.map((t) => {
                    const meta = tipoMeta[t.tipo] || tipoMeta.personalizado;
                    const Icon = meta.icon;
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.empleado_nombre}</TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">{t.cargo || "—"}</TableCell>
                        <TableCell className="hidden lg:table-cell text-muted-foreground">{t.departamento || "—"}</TableCell>
                        <TableCell>{format(parseDateStr(t.fecha), "dd MMM yyyy", { locale: es })}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${meta.color}`}>
                            {Icon && <Icon className="h-3 w-3" />}
                            {t.tipo}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{t.hora_inicio} - {t.hora_fin}</TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">
                          {t.minutos_descanso ? `${t.minutos_descanso} min` : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => { setEditing(t); setFormOpen(true); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setToDelete(t)}>
                              <Trash2 className="h-4 w-4 text-rose-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      ) : (
        <div>
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <div className="h-8 w-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
            </div>
          ) : (
            <WeeklyCalendar
              turnos={turnos}
              empleados={empleados}
              weekStart={weekStart}
              onWeekChange={setWeekStart}
              deptoFilter={filterDepto}
              onDeptoChange={setFilterDepto}
            />
          )}
        </div>
      )}

      <TurnoForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={loadTurnos}
        turno={editing}
        empleados={empleados}
        defaultDepto={filterDepto !== "Todos" ? filterDepto : ""}
      />

      <BulkTurnosDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onSaved={loadTurnos}
        empleados={empleados}
        defaultDepto={filterDepto !== "Todos" ? filterDepto : ""}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar turno?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el turno de {toDelete?.empleado_nombre} del{" "}
              {toDelete && format(parseDateStr(toDelete.fecha), "dd 'de' MMMM", { locale: es })}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} className="bg-rose-500 hover:bg-rose-600">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}