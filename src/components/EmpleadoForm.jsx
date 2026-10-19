import { useEffect, useState } from "react";
import { db } from "@/api/db";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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

const departamentos = ["Ventas", "Tecnología", "Recursos Humanos", "Finanzas", "Operaciones", "Marketing"];

export default function EmpleadoForm({ open, onClose, onSaved, empleado }) {
  const [form, setForm] = useState({
    nombre: "",
    apellidos: "",
    email: "",
    telefono: "",
    departamento: "Ventas",
    cargo: "",
    fecha_alta: new Date().toISOString().split("T")[0],
    estado: "activo",
    horario_entrada: "09:00",
    horario_salida: "17:00",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (empleado) {
      setForm({
        nombre: empleado.nombre || "",
        apellidos: empleado.apellidos || "",
        email: empleado.email || "",
        telefono: empleado.telefono || "",
        departamento: empleado.departamento || "Ventas",
        cargo: empleado.cargo || "",
        fecha_alta: empleado.fecha_alta || new Date().toISOString().split("T")[0],
        estado: empleado.estado || "activo",
        horario_entrada: empleado.horario_entrada || "09:00",
        horario_salida: empleado.horario_salida || "17:00",
      });
    } else {
      setForm({
        nombre: "",
        apellidos: "",
        email: "",
        telefono: "",
        departamento: "Ventas",
        cargo: "",
        fecha_alta: new Date().toISOString().split("T")[0],
        estado: "activo",
        horario_entrada: "09:00",
        horario_salida: "17:00",
      });
    }
  }, [empleado, open]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.nombre || !form.apellidos) return;
    setSaving(true);
    try {
      if (empleado) {
        await db.entities.Empleado.update(empleado.id, form);
      } else {
        await db.entities.Empleado.create(form);
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{empleado ? "Editar empleado" : "Nuevo empleado"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Nombre *</Label>
              <Input value={form.nombre} onChange={(e) => set("nombre", e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label>Apellidos *</Label>
              <Input value={form.apellidos} onChange={(e) => set("apellidos", e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Teléfono</Label>
              <Input value={form.telefono} onChange={(e) => set("telefono", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Departamento</Label>
              <Select value={form.departamento} onValueChange={(v) => set("departamento", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {departamentos.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Cargo</Label>
              <Input value={form.cargo} onChange={(e) => set("cargo", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label>Fecha de alta</Label>
              <Input type="date" value={form.fecha_alta} onChange={(e) => set("fecha_alta", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Entrada</Label>
              <Input type="time" value={form.horario_entrada} onChange={(e) => set("horario_entrada", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Salida</Label>
              <Input type="time" value={form.horario_salida} onChange={(e) => set("horario_salida", e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Estado</Label>
            <Select value={form.estado} onValueChange={(v) => set("estado", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="activo">Activo</SelectItem>
                <SelectItem value="inactivo">Inactivo</SelectItem>
              </SelectContent>
            </Select>
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