import { useEffect, useState } from "react";
import { db, rpc } from "@/api/db";
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
import { DEPARTAMENTOS as departamentos, todayStr } from "@/lib/constants";
import { notifyError } from "@/lib/notify";
import { validarPin } from "@/lib/kiosco";

export default function EmpleadoForm({ open, onClose, onSaved, empleado }) {
  const [form, setForm] = useState({
    nombre: "",
    apellidos: "",
    email: "",
    telefono: "",
    departamento: "Ventas",
    cargo: "",
    fecha_alta: todayStr(),
    estado: "activo",
    horario_entrada: "09:00",
    horario_salida: "17:00",
  });
  const [saving, setSaving] = useState(false);
  // PIN del kiosco: se guarda aparte, cifrado, y nunca se vuelve a mostrar.
  const [pin, setPin] = useState("");
  const [quitarPin, setQuitarPin] = useState(false);
  const [desbloquear, setDesbloquear] = useState(false);

  useEffect(() => {
    if (empleado) {
      setForm({
        nombre: empleado.nombre || "",
        apellidos: empleado.apellidos || "",
        email: empleado.email || "",
        telefono: empleado.telefono || "",
        departamento: empleado.departamento || "Ventas",
        cargo: empleado.cargo || "",
        fecha_alta: empleado.fecha_alta || todayStr(),
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
        fecha_alta: todayStr(),
        estado: "activo",
        horario_entrada: "09:00",
        horario_salida: "17:00",
      });
    }
    setPin("");
    setQuitarPin(false);
    setDesbloquear(false);
  }, [empleado, open]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim() || !form.apellidos.trim()) {
      notifyError(new Error("El nombre y los apellidos son obligatorios."), "Faltan datos");
      return;
    }
    const problemaPin = pin ? validarPin(pin) : "";
    if (problemaPin) {
      notifyError(new Error(problemaPin), "PIN no válido");
      return;
    }
    setSaving(true);
    try {
      const guardado = empleado
        ? await db.entities.Empleado.update(empleado.id, form)
        : await db.entities.Empleado.create(form);
      if (pin || quitarPin) {
        try {
          await rpc("empleado_set_pin", { p_empleado_id: guardado.id, p_pin: quitarPin ? null : pin });
        } catch (err) {
          // El empleado ya quedó guardado; solo falló el PIN.
          notifyError(err, "Empleado guardado, pero no se pudo cambiar el PIN");
        }
      } else if (desbloquear) {
        try {
          await rpc("empleado_desbloquear_pin", { p_empleado_id: guardado.id });
        } catch (err) {
          notifyError(err, "Empleado guardado, pero no se pudo desbloquear el PIN");
        }
      }
      onSaved();
      onClose();
    } catch (err) {
      notifyError(err, "No se pudo guardar el empleado");
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
                  {/* Conserva un departamento antiguo que ya no esté en la lista. */}
                  {(departamentos.includes(form.departamento) || !form.departamento
                    ? departamentos
                    : [...departamentos, form.departamento]
                  ).map((d) => (
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
          <div className="grid gap-2 rounded-lg border bg-muted/30 p-3">
            <Label htmlFor="pin">PIN para el kiosco</Label>
            <Input
              id="pin"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={6}
              value={pin}
              disabled={quitarPin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder={empleado?.tiene_pin ? "Tiene PIN · escribe uno nuevo para cambiarlo" : "4 a 6 dígitos"}
            />
            <p className="text-xs text-muted-foreground">
              {empleado?.tiene_pin
                ? "Deja el campo vacío para mantener el PIN actual. Asignar uno nuevo también lo desbloquea."
                : "Sin PIN, el empleado no podrá marcar en el kiosco."}
            </p>
            {empleado?.tiene_pin && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={quitarPin}
                  onChange={(e) => { setQuitarPin(e.target.checked); setPin(""); }}
                />
                Quitar el PIN
              </label>
            )}
            {empleado?.tiene_pin && !quitarPin && !pin && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={desbloquear}
                  onChange={(e) => setDesbloquear(e.target.checked)}
                />
                Desbloquear el PIN (tras 5 intentos fallidos), sin cambiarlo
              </label>
            )}
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