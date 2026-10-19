import { useEffect, useState } from "react";
import { db } from "@/api/db";
import StatCard from "@/components/StatCard";
import { Users, UserCheck, UserX, Clock } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { format, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { estadoBadge, todayStr, toDateStr, parseDateStr } from "@/lib/constants";
import { notifyError } from "@/lib/notify";

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, presentes: 0, retrasos: 0, ausentes: 0, sinFichar: 0 });
  const [chartData, setChartData] = useState([]);
  const [recientes, setRecientes] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const today = todayStr();

        const [empRes, regRes] = await Promise.all([
          db.entities.Empleado.filterAll({ estado: "activo" }),
          db.entities.RegistroAsistencia.filterAll({ fecha: today }),
        ]);
        const activos = empRes.items;
        const registrosHoy = regRes.items;
        const conRegistro = new Set(registrosHoy.map((r) => r.empleado_id));
        const porEstado = (estado) => registrosHoy.filter((r) => r.estado === estado).length;

        setStats({
          total: activos.length,
          presentes: porEstado("presente"),
          retrasos: porEstado("retraso"),
          ausentes: porEstado("ausente"),
          // Empleados activos sin ningún registro hoy (ni fichaje, ni vacaciones, ni permiso).
          sinFichar: activos.filter((e) => !conRegistro.has(e.id)).length,
        });

        // Últimos 7 días, con fechas locales.
        const days = [];
        for (let i = 6; i >= 0; i--) {
          days.push(toDateStr(subDays(new Date(), i)));
        }
        const counts = await Promise.all(
          days.map((d) =>
            db.entities.RegistroAsistencia.count({
              fecha: d,
              estado: { $in: ["presente", "retraso"] },
            })
          )
        );
        setChartData(
          days.map((d, i) => ({
            fecha: format(parseDateStr(d), "EEE d", { locale: es }),
            presentes: counts[i],
          }))
        );

        setRecientes(
          [...registrosHoy]
            .sort((a, b) => (b.updated_date || "").localeCompare(a.updated_date || ""))
            .slice(0, 6)
        );
      } catch (err) {
        notifyError(err, "No se pudo cargar el resumen");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Resumen de asistencia · {format(new Date(), "EEEE d 'de' MMMM, yyyy", { locale: es })}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Empleados activos" value={stats.total} icon={Users} tone="blue" />
        <StatCard label="Presentes hoy" value={stats.presentes} icon={UserCheck} tone="green" />
        <StatCard label="Retrasos hoy" value={stats.retrasos} icon={Clock} tone="amber" />
        <StatCard
          label="Ausentes / sin fichar"
          value={stats.ausentes + stats.sinFichar}
          icon={UserX}
          tone="red"
          hint={`${stats.ausentes} ausente(s) registrados · ${stats.sinFichar} sin fichar`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border bg-card p-6 shadow-sm">
          <h2 className="text-base font-semibold mb-4">Asistencia últimos 7 días</h2>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData} margin={{ left: -20, right: 10, top: 5 }}>
              <defs>
                <linearGradient id="colorPres" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
              <XAxis dataKey="fecha" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
              <Area
                type="monotone"
                dataKey="presentes"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#colorPres)"
                name="Presentes"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h2 className="text-base font-semibold mb-4">Actividad reciente</h2>
          {recientes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Sin registros hoy</p>
          ) : (
            <div className="space-y-3">
              {recientes.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.empleado_nombre || "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.hora_entrada || "—"} {r.hora_salida ? `→ ${r.hora_salida}` : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                      estadoBadge[r.estado] || ""
                    }`}
                  >
                    {r.estado}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}