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
import { Download, FileBarChart } from "lucide-react";
import { subDays } from "date-fns";
import { DEPARTAMENTOS, todayStr, toDateStr } from "@/lib/constants";
import { notifyError } from "@/lib/notify";
import { formatoHoras, horasRegistro } from "@/lib/horas";
import { supabase } from "@/api/supabaseClient";

const departamentos = ["Todos", ...DEPARTAMENTOS];

export default function Informes() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [desde, setDesde] = useState(() => toDateStr(subDays(new Date(), 30)));
  const [hasta, setHasta] = useState(todayStr);
  const [depto, setDepto] = useState("Todos");

  const load = async () => {
    if (!desde || !hasta) return;
    if (desde > hasta) {
      notifyError(new Error("La fecha «Desde» es posterior a «Hasta»."), "Rango no válido");
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rango = { fecha: { $gte: desde, $lte: hasta } };
      // Se cargan todas las páginas para que los totales no queden cortados.
      const [empRes, regRes, turnoRes, cfgRes] = await Promise.all([
        db.entities.Empleado.filterAll({}),
        db.entities.RegistroAsistencia.filterAll(rango, { sort: "-fecha" }),
        db.entities.Turno.filterAll(rango),
        supabase.from("configuracion").select("descanso_minutos").maybeSingle(),
      ]);
      const empleados = new Map(empRes.items.map((e) => [e.id, e]));
      const idsDepto = depto === "Todos"
        ? null
        : new Set(empRes.items.filter((e) => e.departamento === depto).map((e) => e.id));
      // Si aún no se ejecutó la migración de reglas, se usa 1 hora de descanso.
      const descanso = cfgRes.data?.descanso_minutos ?? 60;
      const turnosPorDia = new Map();
      for (const t of turnoRes.items) {
        const k = `${t.empleado_id}|${t.fecha}`;
        turnosPorDia.set(k, [...(turnosPorDia.get(k) || []), t]);
      }
      const regs = regRes.items || [];

      const byEmp = {};
      regs.forEach((r) => {
        if (idsDepto && !idsDepto.has(r.empleado_id)) return;
        if (!byEmp[r.empleado_id]) {
          byEmp[r.empleado_id] = {
            nombre: r.empleado_nombre,
            presente: 0,
            retraso: 0,
            ausente: 0,
            vacaciones: 0,
            permiso: 0,
            total: 0,
            minutos: 0,
            extra: 0,
            sinSalida: 0,
          };
        }
        const row = byEmp[r.empleado_id];
        if (row[r.estado] !== undefined) row[r.estado]++;
        row.total++;
        const h = horasRegistro(r, turnosPorDia.get(`${r.empleado_id}|${r.fecha}`), empleados.get(r.empleado_id), descanso);
        if (h) {
          row.minutos += h.trabajado;
          row.extra += h.extra;
        } else if (r.hora_entrada && !r.hora_salida) {
          row.sinSalida++;
        }
      });

      setRows(Object.values(byEmp).sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es")));
    } catch (err) {
      notifyError(err, "No se pudo generar el informe");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta, depto]);

  const exportCSV = () => {
    const header = ["Empleado", "Presente", "Retraso", "Ausente", "Vacaciones", "Permiso", "Total días", "Horas trabajadas", "Horas extra", "Días sin salida"];
    const lines = rows.map((r) =>
      [r.nombre, r.presente, r.retraso, r.ausente, r.vacaciones, r.permiso, r.total, formatoHoras(r.minutos), formatoHoras(r.extra), r.sinSalida]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `informe_asistencia_${desde}_${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totales = rows.reduce(
    (acc, r) => ({
      presente: acc.presente + r.presente,
      retraso: acc.retraso + r.retraso,
      ausente: acc.ausente + r.ausente,
      vacaciones: acc.vacaciones + r.vacaciones,
      permiso: acc.permiso + r.permiso,
      minutos: acc.minutos + r.minutos,
      extra: acc.extra + r.extra,
    }),
    { presente: 0, retraso: 0, ausente: 0, vacaciones: 0, permiso: 0, minutos: 0, extra: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Informes</h1>
          <p className="text-sm text-muted-foreground">Resumen de asistencia por empleado y exportación</p>
        </div>
        <Button onClick={exportCSV} disabled={rows.length === 0}>
          <Download className="h-4 w-4 mr-1" /> Exportar CSV
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="grid gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Desde</label>
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="sm:w-44" />
        </div>
        <div className="grid gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Hasta</label>
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="sm:w-44" />
        </div>
        <div className="grid gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Departamento</label>
          <Select value={depto} onValueChange={setDepto}>
            <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {departamentos.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Totales */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: "Presentes", value: totales.presente, color: "text-emerald-600" },
          { label: "Retrasos", value: totales.retraso, color: "text-amber-600" },
          { label: "Ausentes", value: totales.ausente, color: "text-rose-600" },
          { label: "Vacaciones", value: totales.vacaciones, color: "text-sky-600" },
          { label: "Permisos", value: totales.permiso, color: "text-violet-600" },
          { label: "Horas trabajadas", value: formatoHoras(totales.minutos), color: "" },
          { label: "Horas extra", value: formatoHoras(totales.extra), color: "text-orange-600" },
        ].map((t) => (
          <div key={t.label} className="rounded-xl border bg-card p-4 shadow-sm">
            <p className="text-xs text-muted-foreground">{t.label}</p>
            <p className={`text-2xl font-semibold ${t.color}`}>{t.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-8 w-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileBarChart className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Sin datos para el rango seleccionado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empleado</TableHead>
                  <TableHead className="text-center">Presente</TableHead>
                  <TableHead className="text-center">Retraso</TableHead>
                  <TableHead className="text-center">Ausente</TableHead>
                  <TableHead className="text-center">Vacaciones</TableHead>
                  <TableHead className="text-center">Permiso</TableHead>
                  <TableHead className="text-center">Días</TableHead>
                  <TableHead className="text-center" title="Horas entre entrada y salida, menos el descanso">Horas</TableHead>
                  <TableHead className="text-center" title="Horas por encima de la jornada esperada (turno u horario)">Extra</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{r.nombre}</TableCell>
                    <TableCell className="text-center text-emerald-600">{r.presente}</TableCell>
                    <TableCell className="text-center text-amber-600">{r.retraso}</TableCell>
                    <TableCell className="text-center text-rose-600">{r.ausente}</TableCell>
                    <TableCell className="text-center text-sky-600">{r.vacaciones}</TableCell>
                    <TableCell className="text-center text-violet-600">{r.permiso}</TableCell>
                    <TableCell className="text-center font-semibold">{r.total}</TableCell>
                    <TableCell className="text-center tabular-nums">
                      {formatoHoras(r.minutos)}
                      {r.sinSalida > 0 && (
                        <span
                          className="ml-1 text-xs text-amber-600"
                          title={`${r.sinSalida} día(s) con entrada pero sin salida: no suman horas`}
                        >
                          ({r.sinSalida} sin salida)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center tabular-nums text-orange-600">
                      {r.extra > 0 ? formatoHoras(r.extra) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}