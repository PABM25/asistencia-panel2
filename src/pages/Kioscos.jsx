import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ExternalLink, KeyRound, TabletSmartphone, Trash2 } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { db, rpc } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { clearKioscoToken, getKioscoToken, setKioscoToken } from "@/lib/kiosco";
import { notifyError } from "@/lib/notify";

export default function Kioscos() {
  const [kioscos, setKioscos] = useState([]);
  const [sinPin, setSinPin] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nombre, setNombre] = useState("Kiosco entrada");
  const [confirmarActivar, setConfirmarActivar] = useState(false);
  const [activando, setActivando] = useState(false);
  const [aRevocar, setARevocar] = useState(null);
  // ninguno | activo | revocado (el token guardado ya no sirve)
  const [esteDispositivo, setEsteDispositivo] = useState(getKioscoToken() ? "comprobando" : "ninguno");

  const load = async () => {
    setLoading(true);
    try {
      const [{ data, error }, emps] = await Promise.all([
        supabase
          .from("kiosco")
          .select("id, nombre, activo, ultimo_uso, created_date")
          .order("created_date", { ascending: false }),
        db.entities.Empleado.filterAll({ estado: "activo", tiene_pin: false }, { sort: "nombre" }),
      ]);
      if (error) throw error;
      setKioscos(data || []);
      setSinPin(emps.items);
    } catch (err) {
      notifyError(err, "No se pudieron cargar los kioscos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const token = getKioscoToken();
    if (!token) return;
    supabase.rpc("kiosco_empleados", { p_token: token }).then(({ error }) => {
      if (error?.message?.includes("kiosco_no_autorizado")) {
        clearKioscoToken();
        setEsteDispositivo("revocado");
      } else {
        setEsteDispositivo("activo");
      }
    });
  }, []);

  const activar = async () => {
    setActivando(true);
    try {
      const token = await rpc("kiosco_crear", { p_nombre: nombre });
      if (!setKioscoToken(token)) {
        throw new Error("Este navegador no permite guardar datos (¿modo incógnito?). Usa una ventana normal.");
      }
      // El kiosco funciona sin sesión: se cierra la del admin para que nadie
      // pueda entrar al panel desde la tablet.
      await supabase.auth.signOut();
      window.location.href = "/kiosco";
    } catch (err) {
      notifyError(err, "No se pudo activar el kiosco");
      setActivando(false);
      setConfirmarActivar(false);
    }
  };

  const revocar = async () => {
    const k = aRevocar;
    setARevocar(null);
    try {
      const q = k.activo
        ? supabase.from("kiosco").update({ activo: false }).eq("id", k.id)
        : supabase.from("kiosco").delete().eq("id", k.id);
      const { error } = await q;
      if (error) throw error;
      load();
    } catch (err) {
      notifyError(err, k.activo ? "No se pudo revocar el kiosco" : "No se pudo eliminar el kiosco");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Kiosco</h1>
        <p className="text-sm text-muted-foreground">
          Dispositivos donde los empleados marcan su entrada y salida con su PIN
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Activar este dispositivo */}
        <div className="rounded-xl border bg-card p-5 shadow-xs">
          <div className="mb-4 flex items-center gap-2">
            <TabletSmartphone className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">Este dispositivo</h2>
          </div>
          {esteDispositivo === "activo" || esteDispositivo === "comprobando" ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Este navegador ya está activado como kiosco.
              </p>
              <Button asChild variant="outline">
                <Link to="/kiosco">
                  <ExternalLink className="mr-1 h-4 w-4" /> Abrir kiosco
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {esteDispositivo === "revocado" && (
                <p className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700">
                  Este dispositivo estaba activado, pero su kiosco fue revocado. Puedes activarlo de nuevo.
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Abre esta página en la tablet o computador de la entrada y actívalo. Al hacerlo
                se cerrará tu sesión en ese dispositivo y quedará mostrando la pantalla de fichaje.
              </p>
              <div className="grid gap-2">
                <Label htmlFor="nombre-kiosco">Nombre del dispositivo</Label>
                <Input
                  id="nombre-kiosco"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej.: Tablet recepción"
                />
              </div>
              <Button onClick={() => setConfirmarActivar(true)} disabled={!nombre.trim()}>
                Activar este dispositivo como kiosco
              </Button>
            </div>
          )}
        </div>

        {/* Empleados sin PIN */}
        <div className="rounded-xl border bg-card p-5 shadow-xs">
          <div className="mb-4 flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">PIN de los empleados</h2>
          </div>
          {loading ? null : sinPin.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todos los empleados activos tienen PIN. ✓</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {sinPin.length} empleado(s) activo(s) sin PIN no podrán fichar en el kiosco:
              </p>
              <p className="text-sm">
                {sinPin.slice(0, 8).map((e) => `${e.nombre} ${e.apellidos}`).join(", ")}
                {sinPin.length > 8 && ` y ${sinPin.length - 8} más`}
              </p>
              <p className="text-xs text-muted-foreground">
                Asígnalo en <Link to="/empleados" className="text-primary hover:underline">Empleados</Link> → editar.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Lista de kioscos */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          </div>
        ) : kioscos.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Aún no hay dispositivos activados.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dispositivo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="hidden sm:table-cell">Último uso</TableHead>
                  <TableHead className="hidden md:table-cell">Activado</TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {kioscos.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell className="font-medium">{k.nombre}</TableCell>
                    <TableCell>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          k.activo ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {k.activo ? "Activo" : "Revocado"}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {k.ultimo_uso ? format(new Date(k.ultimo_uso), "dd MMM yyyy HH:mm", { locale: es }) : "—"}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {format(new Date(k.created_date), "dd MMM yyyy", { locale: es })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setARevocar(k)} className="text-rose-600">
                        {k.activo ? "Revocar" : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <AlertDialog open={confirmarActivar} onOpenChange={(o) => !o && !activando && setConfirmarActivar(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Activar este dispositivo como kiosco?</AlertDialogTitle>
            <AlertDialogDescription>
              Se cerrará tu sesión de administrador en este navegador y se abrirá la pantalla de fichaje.
              Para volver al panel tendrás que iniciar sesión de nuevo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={activando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                activar();
              }}
              disabled={activando}
            >
              {activando ? "Activando..." : "Activar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!aRevocar} onOpenChange={(o) => !o && setARevocar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {aRevocar?.activo ? "¿Revocar el kiosco?" : "¿Eliminar el kiosco?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {aRevocar?.activo
                ? `"${aRevocar?.nombre}" dejará de funcionar de inmediato. Para volver a usar ese dispositivo habrá que activarlo de nuevo.`
                : `Se borrará "${aRevocar?.nombre}" de la lista.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={revocar} className="bg-rose-500 hover:bg-rose-600">
              {aRevocar?.activo ? "Revocar" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
