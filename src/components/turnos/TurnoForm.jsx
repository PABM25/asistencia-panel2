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
  DialogFooter,
} from "@/components/ui/dialog";

const tipos = ["mañana", "tarde", "noche", "partido", "personalizado"];
const todayStr = () => new Date().toISOString().split("T")[0];

export default function TurnoForm({ open, onClose, onSaved, turno, empleados, defaultDepto }) {
  const [form, setForm] = useState({
    empleado_id: "",
    empleado_nombre: "",
    departamento: "",
    cargo: "",
    fecha: todayStr(),
    hora_inicio: "09:00",
    hora_fin: "17:00",
    tipo: "mañana",
    minutos_descanso: 30,
    notas: "",
  });
  const [saving, setSaving] = useState(false);

  const empleadosVisibles = defaultDepto
    ? empleados.filter((e) => e.departamento === defaultDepto)
    : empleados;

  useEffect(() => {
    if (turno) {
      setForm({
        empleado_id: turno.empleado_id || "",
        empleado_nombre: turno.empleado_nombre || "",
        departamento: turno.departamento || "",
        cargo: turno.cargo || "",
        fecha: turno.fecha || todayStr(),
        hora_inicio: turno.hora_inicio || "09:00",
        hora_fin: turno.hora_fin || "17:00",
        tipo: turno.tipo || "mañana",
        minutos_descanso: turno.minutos_descanso ?? 30,
        notas: turno.notas || "",
      });
    } else {
      setForm({
        empleado_id: "",
        empleado_nombre: "",
        departamento: defaultDepto || "",
        cargo: "",
        fecha: todayStr(),
        hora_inicio: "09:00",
        hora_fin: "17:00",
        tipo: "mañana",
        minutos_descanso: 30,
        notas: "",
      });
    }
  }, [turno, open, defaultDepto]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onEmpChange = (id) => {
    const e = empleados.find((x) => x.id === id);
    setForm((f) => ({
      ...f,
      empleado_id: id,
      empleado_nombre: e ? `${e.nombre} ${e.apellidos}` : "",
      departamento: e?.departamento || f.departamento,
      cargo: e?.cargo || "",
      hora_inicio: e && !turno ? (e.horario_entrada || "09:00") : f.hora_inicio,
      hora_fin: e && !turno ? (e.horario_salida || "17:00") : f.hora_fin,
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.empleado_id || !form.fecha || !form.hora_inicio || !form.hora_fin) return;
    setSaving(true);
    try {
      if (turno) {
        await db.entities.Turno.update(turno.id, form);
      } else {
        await db.entities.Turno.create(form);
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{turno ? "Editar turno" : "Asignar turno"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Empleado *</Label>
            <Select value={form.empleado_id} onValueChange={onEmpChange} disabled={!!turno}>
              <SelectTrigger><SelectValue placeholder="Selecciona..." /></SelectTrigger>
              <SelectContent>
                {empleadosVisibles.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nombre} {e.apellidos} — {e.cargo || "Sin cargo"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.departamento && (
              <p className="text-xs text-muted-foreground">
                Departamento: <span className="font-medium">{form.departamento}</span>
                {form.cargo && <> · Cargo: <span className="font-medium">{form.cargo}</span></>}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Fecha *</Label>
              <Input type="date" value={form.fecha} onChange={(e) => set("fecha", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Tipo de turno</Label>
              <Select value={form.tipo} onValueChange={(v) => set("tipo", v)}>
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
              <Input type="time" value={form.hora_inicio} onChange={(e) => set("hora_inicio", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Fin *</Label>
              <Input type="time" value={form.hora_fin} onChange={(e) => set("hora_fin", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Descanso (min)</Label>
              <Input
                type="number"
                min="0"
                value={form.minutos_descanso}
                onChange={(e) => set("minutos_descanso", Number(e.target.value))}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Notas</Label>
            <Input value={form.notas} onChange={(e) => set("notas", e.target.value)} placeholder="Observaciones..." />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}