import { useEffect, useState } from "react";
import { db, rpc } from "@/api/db";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Clock, LogIn, LogOut, Pencil, Search } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ESTADOS_ASISTENCIA as estados, estadoBadge, todayStr, parseDateStr } from "@/lib/constants";
import { notifyError, notifySuccess } from "@/lib/notify";
import { mensajeFichaje } from "@/lib/kiosco";

const POR_PAGINA = 100;

export default function Asistencia() {
  const [empleados, setEmpleados] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hayMas, setHayMas] = useState(false);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [filterFecha, setFilterFecha] = useState(todayStr());
  const [filterEstado, setFilterEstado] = useState("Todos");
  const [search, setSearch] = useState("");

  // Fichaje rápido
  const [ficharEmp, setFicharEmp] = useState("");
  const [fichando, setFichando] = useState(false);

  // Registro abierto en el diálogo de edición
  const [editReg, setEditReg] = useState(null);

  const loadEmpleados = async () => {
    try {
      const res = await db.entities.Empleado.filterAll({ estado: "activo" }, { sort: "apellidos" });
      setEmpleados(res.items || []);
    } catch (err) {
      notifyError(err, "No se pudieron cargar los empleados");
    }
  };

  const consulta = () => {
    const query = {};
    if (filterFecha) query.fecha = filterFecha;
    if (filterEstado !== "Todos") query.estado = filterEstado;
    if (search.trim()) query.empleado_nombre = { $regex: search, $options: "i" };
    return query;
  };

  const loadRegistros = async () => {
    setLoading(true);
    try {
      const res = await db.entities.RegistroAsistencia.filter(consulta(), {
        sort: "-created_date",
        limit: POR_PAGINA,
      });
      setRegistros(res.items || []);
      setHayMas(res.items.length === POR_PAGINA);
    } catch (err) {
      notifyError(err, "No se pudieron cargar los registros");
    } finally {
      setLoading(false);
    }
  };

  const cargarMas = async () => {
    setCargandoMas(true);
    try {
      const res = await db.entities.RegistroAsistencia.filter(consulta(), {
        sort: "-created_date",
        limit: POR_PAGINA,
        skip: registros.length,
      });
      setRegistros((prev) => [...prev, ...res.items]);
      setHayMas(res.items.length === POR_PAGINA);
    } catch (err) {
      notifyError(err, "No se pudieron cargar más registros");
    } finally {
      setCargandoMas(false);
    }
  };

  useEffect(() => {
    loadEmpleados();
  }, []);

  useEffect(() => {
    const t = setTimeout(loadRegistros, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterFecha, filterEstado, search]);

  // La hora y las reglas (retraso, fichaje repetido) las aplica el servidor,
  // igual que en el kiosco. Ver admin_fichar en supabase/migrations.
  const fichar = async (tipo) => {
    if (!ficharEmp) return;
    setFichando(true);
    try {
      const m = mensajeFichaje(await rpc("admin_fichar", { p_empleado_id: ficharEmp, p_tipo: tipo }));
      if (!m.ok) {
        notifyError(new Error(m.detalle), m.titulo);
        return;
      }
      notifySuccess(m.titulo, m.detalle);
      setFicharEmp("");
      loadRegistros();
    } catch (err) {
      notifyError(err, "No se pudo registrar el fichaje");
    } finally {
      setFichando(false);
    }
  };

  // Los errores se propagan al diálogo, que los muestra y se mantiene abierto.
  const saveEdit = async (data) => {
    if (editReg.id) {
      await db.entities.RegistroAsistencia.update(editReg.id, data);
    } else {
      await db.entities.RegistroAsistencia.create({
        ...data,
        registrado_por: "admin",
      });
    }
    setEditReg(null);
    loadRegistros();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Asistencia</h1>
        <p className="text-sm text-muted-foreground">Registro de entradas y salidas</p>
      </div>

      {/* Fichaje rápido */}
      <div className="rounded-3xl bg-muted p-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">Fichaje rápido</h2>
          <span className="ml-auto text-sm text-muted-foreground">
            {format(new Date(), "HH:mm")} · {format(new Date(), "EEE d MMM", { locale: es })}
          </span>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <Select value={ficharEmp} onValueChange={setFicharEmp}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Selecciona un empleado..." />
            </SelectTrigger>
            <SelectContent>
              {empleados.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.nombre} {e.apellidos}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => fichar("entrada")} disabled={!ficharEmp || fichando} variant="default">
            <LogIn className="h-4 w-4 mr-1" /> Marcar entrada
          </Button>
          <Button onClick={() => fichar("salida")} disabled={!ficharEmp || fichando} variant="outline">
            <LogOut className="h-4 w-4 mr-1" /> Marcar salida
          </Button>
        </div>
      </div>

      {/* Filtros */}
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
        <Input
          type="date"
          value={filterFecha}
          onChange={(e) => setFilterFecha(e.target.value)}
          className="sm:w-44"
        />
        <Select value={filterEstado} onValueChange={setFilterEstado}>
          <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Todos">Todos los estados</SelectItem>
            {estados.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => setEditReg({})}>+ Registro manual</Button>
      </div>

      {/* Registros */}
      <div className="rounded-3xl border bg-card overflow-hidden">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-8 w-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
          </div>
        ) : registros.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Clock className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Sin registros para los filtros seleccionados</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empleado</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Entrada</TableHead>
                  <TableHead>Salida</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="hidden md:table-cell">Origen</TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {registros.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.empleado_nombre}</TableCell>
                    <TableCell>{format(parseDateStr(r.fecha), "dd MMM yyyy", { locale: es })}</TableCell>
                    <TableCell>{r.hora_entrada || "—"}</TableCell>
                    <TableCell>{r.hora_salida || "—"}</TableCell>
                    <TableCell>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${estadoBadge[r.estado] || ""}`}>
                        {r.estado}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground capitalize">
                      {r.registrado_por}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => setEditReg(r)} aria-label={`Editar registro de ${r.empleado_nombre}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {hayMas && (
              <div className="flex justify-center border-t p-3">
                <Button variant="outline" size="sm" onClick={cargarMas} disabled={cargandoMas}>
                  {cargandoMas ? "Cargando..." : `Cargar ${POR_PAGINA} más`}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {editReg && (
        <RegistroDialog
          registro={editReg}
          empleados={empleados}
          onClose={() => setEditReg(null)}
          onSave={saveEdit}
        />
      )}
    </div>
  );
}

function RegistroDialog({ registro, empleados, onClose, onSave }) {
  const [form, setForm] = useState({
    empleado_id: registro.empleado_id || "",
    empleado_nombre: registro.empleado_nombre || "",
    fecha: registro.fecha || todayStr(),
    hora_entrada: registro.hora_entrada || "",
    hora_salida: registro.hora_salida || "",
    estado: registro.estado || "presente",
    notas: registro.notas || "",
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onEmpChange = (id) => {
    const e = empleados.find((x) => x.id === id);
    set("empleado_id", id);
    set("empleado_nombre", e ? `${e.nombre} ${e.apellidos}` : "");
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.empleado_id) {
      notifyError(new Error("Selecciona un empleado."), "Faltan datos");
      return;
    }
    if (!form.fecha) {
      notifyError(new Error("Indica la fecha del registro."), "Faltan datos");
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
    } catch (err) {
      notifyError(err, "No se pudo guardar el registro");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{registro.id ? "Editar registro" : "Nuevo registro"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Empleado *</Label>
            <Select value={form.empleado_id} onValueChange={onEmpChange} disabled={!!registro.id}>
              <SelectTrigger><SelectValue placeholder="Selecciona..." /></SelectTrigger>
              <SelectContent>
                {empleados.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.nombre} {e.apellidos}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-2">
              <Label>Fecha</Label>
              <Input type="date" value={form.fecha} onChange={(e) => set("fecha", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Entrada</Label>
              <Input type="time" value={form.hora_entrada} onChange={(e) => set("hora_entrada", e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Salida</Label>
              <Input type="time" value={form.hora_salida} onChange={(e) => set("hora_salida", e.target.value)} />
            </div>
          </div>
          {form.hora_entrada && form.hora_salida && form.hora_salida < form.hora_entrada && (
            <p className="-mt-2 text-xs text-muted-foreground">
              La salida es anterior a la entrada: se toma como turno de noche (sale al día siguiente).
            </p>
          )}
          <div className="grid gap-2">
            <Label>Estado</Label>
            <Select value={form.estado} onValueChange={(v) => set("estado", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {estados.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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