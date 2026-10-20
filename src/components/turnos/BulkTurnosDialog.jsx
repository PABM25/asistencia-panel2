import { useEffect, useState } from "react";
import { db } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { DEPARTAMENTOS, todayStr } from "@/lib/constants";
import { notifyError } from "@/lib/notify";

const tipos = ["mañana", "tarde", "noche", "partido", "personalizado"];

export default function BulkTurnosDialog({ open, onClose, onSaved, empleados, defaultDepto }) {
  const [depto, setDepto] = useState(defaultDepto || "");
  const [fecha, setFecha] = useState(todayStr());
  const [horaInicio, setHoraInicio] = useState("09:00");
  const [horaFin, setHoraFin] = useState("17:00");
  const [tipo, setTipo] = useState("mañana");
  const [minutosDescanso, setMinutosDescanso] = useState(30);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (open) {
      setDepto(defaultDepto || "");
      setFecha(todayStr());
      setHoraInicio("09:00");
      setHoraFin("17:00");
      setTipo("mañana");
      setMinutosDescanso(30);
      setResult(null);
    }
  }, [open, defaultDepto]);

  const seleccionados = depto ? empleados.filter((e) => e.departamento === depto) : [];

  const submit = async (e) => {
    e.preventDefault();
    if (!depto || seleccionados.length === 0) return;
    if (!fecha || !horaInicio || !horaFin) {
      notifyError(new Error("Fecha, inicio y fin son obligatorios."), "Faltan datos");
      return;
    }
    setSaving(true);
    try {
      const records = seleccionados.map((emp) => ({
        empleado_id: emp.id,
        empleado_nombre: `${emp.nombre} ${emp.apellidos}`,
        departamento: emp.departamento,
        cargo: emp.cargo,
        fecha,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        tipo,
        minutos_descanso: minutosDescanso,
      }));
      // Quien ya tiene un turno que empieza a esa hora ese día se omite.
      const creados = await db.entities.Turno.bulkCreateIgnoringDuplicates(
        records,
        "empleado_id,fecha,hora_inicio"
      );
      setResult({ count: creados.length, omitidos: records.length - creados.length });
      onSaved();
    } catch (err) {
      notifyError(err, "No se pudieron asignar los turnos");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Asignar turnos por departamento</DialogTitle>
          <DialogDescription>
            Crea el mismo turno para todos los empleados activos del departamento seleccionado.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Departamento *</Label>
            <Select value={depto} onValueChange={setDepto}>
              <SelectTrigger><SelectValue placeholder="Selecciona..." /></SelectTrigger>
              <SelectContent>
                {DEPARTAMENTOS.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {depto && (
              <p className="text-xs text-muted-foreground">
                {seleccionados.length} empleado(s) en {depto}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Fecha *</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Tipo de turno</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {tipos.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-2">
              <Label>Inicio *</Label>
              <Input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Fin *</Label>
              <Input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Descanso (min)</Label>
              <Input
                type="number"
                min="0"
                value={minutosDescanso}
                onChange={(e) => setMinutosDescanso(Number(e.target.value))}
              />
            </div>
          </div>
          {result && (
            <p className="text-sm text-emerald-600 font-medium">
              ✓ {result.count} turno(s) asignado(s) correctamente.
              {result.omitidos > 0 && (
                <span className="block text-xs font-normal text-muted-foreground">
                  {result.omitidos} empleado(s) ya tenían ese turno y se omitieron.
                </span>
              )}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cerrar</Button>
            <Button type="submit" disabled={saving || !depto || seleccionados.length === 0}>
              {saving ? "Asignando..." : `Asignar a ${seleccionados.length || 0} empleado(s)`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}