import { useEffect, useState } from "react";
import { format, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarOff, Clock, Save, Trash2, UserX } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { rpc } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { parseDateStr, toDateStr } from "@/lib/constants";
import { notifyError, notifySuccess } from "@/lib/notify";
import { cn } from "@/lib/utils";

const DIAS = [
  { n: 1, corto: "L", largo: "Lunes" },
  { n: 2, corto: "M", largo: "Martes" },
  { n: 3, corto: "X", largo: "Miércoles" },
  { n: 4, corto: "J", largo: "Jueves" },
  { n: 5, corto: "V", largo: "Viernes" },
  { n: 6, corto: "S", largo: "Sábado" },
  { n: 7, corto: "D", largo: "Domingo" },
];

const ayerStr = () => toDateStr(subDays(new Date(), 1));

export default function Ajustes() {
  const [loading, setLoading] = useState(true);
  const [sinMigracion, setSinMigracion] = useState(false);
  const [cfg, setCfg] = useState(null);
  const [guardado, setGuardado] = useState(null);
  const [saving, setSaving] = useState(false);
  const [programada, setProgramada] = useState(null);
  const [feriados, setFeriados] = useState([]);
  const [nuevoFeriado, setNuevoFeriado] = useState({ fecha: "", nombre: "" });
  const [fechaAusencias, setFechaAusencias] = useState(ayerStr);
  const [marcando, setMarcando] = useState(false);
  const [programando, setProgramando] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [cfgRes, ferRes] = await Promise.all([
        supabase.from("configuracion").select("*").maybeSingle(),
        supabase.from("feriado").select("*").order("fecha"),
      ]);
      if (cfgRes.error?.code === "42P01" || cfgRes.error?.code === "PGRST205") {
        setSinMigracion(true);
        return;
      }
      if (cfgRes.error) throw cfgRes.error;
      if (ferRes.error) throw ferRes.error;
      setCfg(cfgRes.data);
      setGuardado(cfgRes.data);
      setFeriados(ferRes.data || []);
      rpc("ausencias_programadas").then(setProgramada).catch(() => setProgramada(false));
    } catch (err) {
      notifyError(err, "No se pudieron cargar los ajustes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const set = (k, v) => setCfg((c) => ({ ...c, [k]: v }));
  const toggleDia = (n) =>
    set("dias_laborales", cfg.dias_laborales.includes(n)
      ? cfg.dias_laborales.filter((d) => d !== n)
      : [...cfg.dias_laborales, n].sort());

  const cambios = cfg && guardado && JSON.stringify(cfg) !== JSON.stringify(guardado);

  const guardar = async () => {
    const tol = Number(cfg.tolerancia_minutos);
    const desc = Number(cfg.descanso_minutos);
    if (!Number.isInteger(tol) || tol < 0 || tol > 120) {
      notifyError(new Error("La tolerancia debe estar entre 0 y 120 minutos."), "Dato no válido");
      return;
    }
    if (!Number.isInteger(desc) || desc < 0 || desc > 240) {
      notifyError(new Error("El descanso debe estar entre 0 y 240 minutos."), "Dato no válido");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("configuracion")
        .update({
          tolerancia_minutos: tol,
          descanso_minutos: desc,
          dias_laborales: cfg.dias_laborales,
          marcar_ausencias: cfg.marcar_ausencias,
        })
        .eq("id", 1)
        .select()
        .single();
      if (error) throw error;
      setCfg(data);
      setGuardado(data);
      notifySuccess("Ajustes guardados");
    } catch (err) {
      notifyError(err, "No se pudieron guardar los ajustes");
    } finally {
      setSaving(false);
    }
  };

  const agregarFeriado = async (e) => {
    e.preventDefault();
    if (!nuevoFeriado.fecha || !nuevoFeriado.nombre.trim()) {
      notifyError(new Error("Indica la fecha y el nombre del feriado."), "Faltan datos");
      return;
    }
    const { error } = await supabase
      .from("feriado")
      .insert({ fecha: nuevoFeriado.fecha, nombre: nuevoFeriado.nombre.trim() });
    if (error) {
      notifyError(
        error.code === "23505" ? new Error("Ya hay un feriado en esa fecha.") : error,
        "No se pudo agregar el feriado"
      );
      return;
    }
    setNuevoFeriado({ fecha: "", nombre: "" });
    load();
  };

  const quitarFeriado = async (fecha) => {
    const { error } = await supabase.from("feriado").delete().eq("fecha", fecha);
    if (error) notifyError(error, "No se pudo quitar el feriado");
    else setFeriados((f) => f.filter((x) => x.fecha !== fecha));
  };

  const programar = async () => {
    setProgramando(true);
    try {
      const ok = await rpc("programar_tarea_ausencias");
      if (ok) {
        setProgramada(true);
        notifySuccess("Tarea diaria programada");
      } else {
        notifyError(
          new Error("Primero activa la extensión pg_cron en Supabase (Database → Extensions)."),
          "pg_cron no está activado"
        );
      }
    } catch (err) {
      notifyError(err, "No se pudo programar la tarea");
    } finally {
      setProgramando(false);
    }
  };

  const marcarAhora = async () => {
    setMarcando(true);
    try {
      const n = await rpc("marcar_ausencias", { p_fecha: fechaAusencias });
      notifySuccess(
        n ? `${n} ausencia(s) marcada(s)` : "No había ausencias que marcar",
        format(parseDateStr(fechaAusencias), "EEEE d 'de' MMMM", { locale: es })
      );
    } catch (err) {
      notifyError(err, "No se pudieron marcar las ausencias");
    } finally {
      setMarcando(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  if (sinMigracion || !cfg) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Ajustes</h1>
        <div className="rounded-xl border bg-card p-6 text-sm shadow-xs">
          Falta ejecutar la migración <code>20261021000000_reglas_asistencia.sql</code> en el SQL Editor de
          Supabase. Después recarga esta página.
        </div>
      </div>
    );
  }

  const proximos = feriados.filter((f) => f.fecha >= toDateStr(new Date()));
  const pasados = feriados.length - proximos.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ajustes</h1>
        <p className="text-sm text-muted-foreground">Reglas para calcular retrasos, horas y ausencias</p>
      </div>

      {/* Reglas */}
      <div className="rounded-xl border bg-card p-5 shadow-xs">
        <div className="mb-4 flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">Jornada</h2>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="tol">Tolerancia de llegada (minutos)</Label>
            <Input
              id="tol"
              type="number"
              min={0}
              max={120}
              value={cfg.tolerancia_minutos}
              onChange={(e) => set("tolerancia_minutos", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Con {Number(cfg.tolerancia_minutos) || 0} min, quien entra a las 09:00 cuenta como retraso desde las{" "}
              {`09:${String(Math.min(59, (Number(cfg.tolerancia_minutos) || 0) + 1)).padStart(2, "0")}`}.
              Se aplica al turno del día o, si no tiene, a su horario.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="desc">Descanso por defecto (minutos)</Label>
            <Input
              id="desc"
              type="number"
              min={0}
              max={240}
              value={cfg.descanso_minutos}
              onChange={(e) => set("descanso_minutos", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Se descuenta de las horas trabajadas en jornadas de más de 6 horas sin turno asignado. Con turno, se
              usa el descanso del turno.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-2">
          <Label>Días laborales</Label>
          <div className="flex flex-wrap gap-2">
            {DIAS.map((d) => (
              <button
                key={d.n}
                type="button"
                title={d.largo}
                aria-pressed={cfg.dias_laborales.includes(d.n)}
                onClick={() => toggleDia(d.n)}
                className={cn(
                  "h-10 w-10 rounded-lg border text-sm font-medium transition-colors",
                  cfg.dias_laborales.includes(d.n)
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-accent"
                )}
              >
                {d.corto}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Solo para empleados sin turnos asignados esa semana. Quien tiene turnos trabaja los días de sus turnos.
          </p>
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={guardar} disabled={!cambios || saving}>
            <Save className="mr-1 h-4 w-4" /> {saving ? "Guardando..." : "Guardar cambios"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Ausencias automáticas */}
        <div className="rounded-xl border bg-card p-5 shadow-xs">
          <div className="mb-4 flex items-center gap-2">
            <UserX className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">Ausencias automáticas</h2>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Marcar ausentes cada madrugada</p>
              <p className="text-xs text-muted-foreground">
                Marca "ausente" a quien debía trabajar el día anterior (turno asignado, o día laboral sin feriado)
                y no tiene ningún registro.
              </p>
            </div>
            <Switch
              checked={cfg.marcar_ausencias}
              onCheckedChange={(v) => set("marcar_ausencias", v)}
              aria-label="Marcar ausencias automáticamente"
            />
          </div>
          {cfg.marcar_ausencias !== guardado.marcar_ausencias && (
            <p className="mt-2 text-xs text-amber-600">Pulsa «Guardar cambios» arriba para aplicarlo.</p>
          )}
          {programada === false && (
            <div className="mt-3 space-y-2 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700">
              <p>
                La tarea diaria no está programada. Activa la extensión <strong>pg_cron</strong> en Supabase
                (Database → Extensions) y pulsa «Programar». Mientras tanto puedes marcarlas a mano aquí abajo.
              </p>
              <Button size="sm" variant="outline" onClick={programar} disabled={programando}>
                {programando ? "Programando..." : "Programar"}
              </Button>
            </div>
          )}
          {programada === true && (
            <p className="mt-3 text-xs text-emerald-600">✓ Tarea diaria programada (03:00–04:00, hora de Chile).</p>
          )}

          <div className="mt-5 border-t pt-4">
            <Label htmlFor="fecha-aus">Marcar ausencias de un día</Label>
            <div className="mt-2 flex gap-2">
              <Input
                id="fecha-aus"
                type="date"
                max={ayerStr()}
                value={fechaAusencias}
                onChange={(e) => setFechaAusencias(e.target.value)}
                className="w-44"
              />
              <Button variant="outline" onClick={marcarAhora} disabled={!fechaAusencias || marcando}>
                {marcando ? "Marcando..." : "Marcar"}
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Útil para días anteriores a activar la tarea. No toca a quien ya tiene un registro.
            </p>
          </div>
        </div>

        {/* Feriados */}
        <div className="rounded-xl border bg-card p-5 shadow-xs">
          <div className="mb-4 flex items-center gap-2">
            <CalendarOff className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">Feriados</h2>
          </div>
          <form onSubmit={agregarFeriado} className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="date"
              value={nuevoFeriado.fecha}
              onChange={(e) => setNuevoFeriado((f) => ({ ...f, fecha: e.target.value }))}
              className="sm:w-44"
              aria-label="Fecha del feriado"
            />
            <Input
              value={nuevoFeriado.nombre}
              onChange={(e) => setNuevoFeriado((f) => ({ ...f, nombre: e.target.value }))}
              placeholder="Ej.: Fiestas Patrias"
              aria-label="Nombre del feriado"
            />
            <Button type="submit" variant="outline">Agregar</Button>
          </form>
          {proximos.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No hay feriados próximos registrados.</p>
          ) : (
            <ul className="mt-4 divide-y">
              {proximos.map((f) => (
                <li key={f.fecha} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    <span className="inline-block w-32 text-muted-foreground">
                      {format(parseDateStr(f.fecha), "EEE d MMM yyyy", { locale: es })}
                    </span>
                    {f.nombre}
                  </span>
                  <Button variant="ghost" size="icon" onClick={() => quitarFeriado(f.fecha)} aria-label={`Quitar ${f.nombre}`}>
                    <Trash2 className="h-4 w-4 text-rose-500" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {pasados > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">{pasados} feriado(s) pasado(s) ocultos.</p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            En un feriado no se marcan ausencias a quien no tiene turno ese día.
          </p>
        </div>
      </div>
    </div>
  );
}
