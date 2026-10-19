import { useEffect, useState } from "react";
import { db } from "@/api/db";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarClock, Search, Save } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { DEPARTAMENTOS, parseDateStr } from "@/lib/constants";
import { notifyError, notifySuccess } from "@/lib/notify";

const departamentos = ["Todos", ...DEPARTAMENTOS];

export default function Horarios() {
  const [empleados, setEmpleados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [depto, setDepto] = useState("Todos");
  const [edits, setEdits] = useState({});
  const [savingId, setSavingId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const query = { estado: "activo" };
      if (depto !== "Todos") query.departamento = depto;
      if (search.trim()) {
        query.$or = [
          { nombre: { $regex: search, $options: "i" } },
          { apellidos: { $regex: search, $options: "i" } },
        ];
      }
      const res = await db.entities.Empleado.filterAll(query, { sort: "apellidos" });
      setEmpleados(res.items || []);
      setEdits({});
    } catch (err) {
      notifyError(err, "No se pudieron cargar los empleados");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, depto]);

  const setEdit = (id, field, value) => {
    setEdits((e) => ({
      ...e,
      [id]: { ...(e[id] || {}), [field]: value },
    }));
  };

  const save = async (emp) => {
    const patch = edits[emp.id];
    if (!patch) return;
    const entrada = patch.horario_entrada ?? emp.horario_entrada;
    const salida = patch.horario_salida ?? emp.horario_salida;
    if (!entrada || !salida) {
      notifyError(new Error("Indica la hora de entrada y la de salida."), "Faltan datos");
      return;
    }
    setSavingId(emp.id);
    try {
      await db.entities.Empleado.update(emp.id, patch);
      notifySuccess("Horario guardado", `${emp.nombre} ${emp.apellidos}: ${entrada} - ${salida}`);
      const newEmp = { ...emp, ...patch };
      setEmpleados((list) => list.map((x) => (x.id === emp.id ? newEmp : x)));
      setEdits((e) => {
        const c = { ...e };
        delete c[emp.id];
        return c;
      });
    } catch (err) {
      notifyError(err, "No se pudo guardar el horario");
    } finally {
      setSavingId(null);
    }
  };

  const val = (emp, field) => (edits[emp.id] && edits[emp.id][field] !== undefined ? edits[emp.id][field] : emp[field]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Horarios</h1>
        <p className="text-sm text-muted-foreground">Consulta y ajusta los horarios de los empleados</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar empleado..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={depto} onValueChange={setDepto}>
          <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            {departamentos.map((d) => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
        </div>
      ) : empleados.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CalendarClock className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No hay empleados que mostrar</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {empleados.map((emp) => (
            <div key={emp.id} className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="mb-4">
                <p className="font-semibold">{emp.nombre} {emp.apellidos}</p>
                <p className="text-xs text-muted-foreground">{emp.departamento} · {emp.cargo}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Entrada</Label>
                  <Input
                    type="time"
                    value={val(emp, "horario_entrada")}
                    onChange={(e) => setEdit(emp.id, "horario_entrada", e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Salida</Label>
                  <Input
                    type="time"
                    value={val(emp, "horario_salida")}
                    onChange={(e) => setEdit(emp.id, "horario_salida", e.target.value)}
                  />
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Alta: {emp.fecha_alta ? format(parseDateStr(emp.fecha_alta), "dd MMM yyyy", { locale: es }) : "—"}
                </span>
                <Button
                  size="sm"
                  disabled={!edits[emp.id] || savingId === emp.id}
                  onClick={() => save(emp)}
                >
                  <Save className="h-3.5 w-3.5 mr-1" />
                  {savingId === emp.id ? "Guardando..." : "Guardar"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}