import { useEffect, useState } from "react";
import { db } from "@/api/db";
import EmpleadoForm from "@/components/EmpleadoForm";
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
import { Plus, Search, Pencil, Trash2, Users } from "lucide-react";
import { DEPARTAMENTOS } from "@/lib/constants";
import { notifyError } from "@/lib/notify";

const departamentos = ["Todos", ...DEPARTAMENTOS];

export default function Empleados() {
  const [empleados, setEmpleados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [depto, setDepto] = useState("Todos");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const query = {};
      if (depto !== "Todos") query.departamento = depto;
      if (search.trim()) {
        query.$or = [
          { nombre: { $regex: search, $options: "i" } },
          { apellidos: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ];
      }
      const res = await db.entities.Empleado.filterAll(query, { sort: "apellidos" });
      setEmpleados(res.items || []);
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

  // Alternativa recomendada a borrar: conserva todo y lo saca del kiosco,
  // de los turnos y de las ausencias automáticas.
  const desactivar = async () => {
    try {
      await db.entities.Empleado.update(toDelete.id, { estado: "inactivo" });
      load();
    } catch (err) {
      notifyError(err, "No se pudo desactivar el empleado");
    } finally {
      setToDelete(null);
    }
  };

  const confirmDelete = async () => {
    try {
      await db.entities.Empleado.delete(toDelete.id);
      load();
    } catch (err) {
      notifyError(err, "No se pudo eliminar el empleado");
    } finally {
      setToDelete(null);
    }
  };

  const fullName = (e) => `${e.nombre} ${e.apellidos}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Empleados</h1>
          <p className="text-sm text-muted-foreground">Gestiona el directorio de empleados</p>
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Nuevo empleado
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o email..."
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

      <div className="rounded-xl border bg-card shadow-xs overflow-hidden">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-8 w-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
          </div>
        ) : empleados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No hay empleados que mostrar</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empleado</TableHead>
                  <TableHead className="hidden md:table-cell">Departamento</TableHead>
                  <TableHead className="hidden lg:table-cell">Cargo</TableHead>
                  <TableHead className="hidden sm:table-cell">Horario</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {empleados.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <div className="font-medium">
                        {fullName(e)}
                        {e.estado === "activo" && !e.tiene_pin && (
                          <span className="ml-2 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                            Sin PIN
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">{e.email}</div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{e.departamento}</TableCell>
                    <TableCell className="hidden lg:table-cell">{e.cargo}</TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                      {e.horario_entrada} - {e.horario_salida}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          e.estado === "activo"
                            ? "bg-emerald-500/10 text-emerald-600"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {e.estado === "activo" ? "Activo" : "Inactivo"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => { setEditing(e); setFormOpen(true); }}
                          aria-label={`Editar a ${fullName(e)}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setToDelete(e)}
                          aria-label={`Eliminar a ${fullName(e)}`}
                        >
                          <Trash2 className="h-4 w-4 text-rose-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <EmpleadoForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={load}
        empleado={editing}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar empleado?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente a {toDelete && fullName(toDelete)} y sus turnos futuros. Sus
              registros de asistencia pasados se conservan. Esta acción no se puede deshacer.
              {toDelete?.estado === "activo" && (
                <span className="mt-2 block">
                  Si ya no trabaja aquí, es mejor <strong>desactivarlo</strong>: conserva su ficha y su historial,
                  y deja de aparecer en el kiosco y en las ausencias automáticas.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {toDelete?.estado === "activo" && (
              <AlertDialogAction onClick={desactivar} className="bg-primary">
                Desactivar
              </AlertDialogAction>
            )}
            <AlertDialogAction onClick={confirmDelete} className="bg-rose-500 hover:bg-rose-600">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}