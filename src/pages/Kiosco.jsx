import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft,
  CheckCircle2,
  Delete,
  Fingerprint,
  LogIn,
  LogOut,
  Search,
  TabletSmartphone,
  XCircle,
} from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { clearKioscoToken, getKioscoToken, mensajeFichaje } from "@/lib/kiosco";
import { cn } from "@/lib/utils";

const RESULTADO_MS = 4000; // tiempo que se muestra el resultado
const INACTIVIDAD_MS = 30000; // vuelve al inicio si nadie toca la pantalla
const RECARGA_MS = 10 * 60 * 1000; // refresca la lista de empleados
const PIN_MAX = 6;

const normalizar = (s) =>
  (s || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

function useReloj() {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 5000);
    return () => clearInterval(t);
  }, []);
  return ahora;
}

export default function Kiosco() {
  const [token] = useState(getKioscoToken);
  const [estado, setEstado] = useState(token ? "cargando" : "sin_token"); // cargando | listo | sin_token | error
  const [empleados, setEmpleados] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [seleccionado, setSeleccionado] = useState(null);
  const [pin, setPin] = useState("");
  const [errorPin, setErrorPin] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const ahora = useReloj();

  const noAutorizado = useCallback(() => {
    clearKioscoToken();
    setEstado("sin_token");
  }, []);

  const cargar = useCallback(async () => {
    if (!token) return;
    const { data, error } = await supabase.rpc("kiosco_empleados", { p_token: token });
    if (error) {
      if (error.message?.includes("kiosco_no_autorizado")) noAutorizado();
      // Un fallo de red puntual no debe bloquear un kiosco que ya funcionaba.
      else setEstado((prev) => (prev === "listo" ? prev : "error"));
      return;
    }
    setEmpleados(data || []);
    setEstado("listo");
  }, [token, noAutorizado]);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, RECARGA_MS);
    return () => clearInterval(t);
  }, [cargar]);

  const reiniciar = useCallback(() => {
    setSeleccionado(null);
    setPin("");
    setErrorPin("");
    setBusqueda("");
    setResultado(null);
  }, []);

  // Tras mostrar el resultado, vuelve a la lista.
  useEffect(() => {
    if (!resultado) return;
    const t = setTimeout(reiniciar, RESULTADO_MS);
    return () => clearTimeout(t);
  }, [resultado, reiniciar]);

  // Si alguien deja la pantalla del PIN a medias, se limpia sola.
  useEffect(() => {
    if (!seleccionado || resultado) return;
    const t = setTimeout(reiniciar, INACTIVIDAD_MS);
    return () => clearTimeout(t);
  }, [seleccionado, resultado, pin, reiniciar]);

  const pulsar = useCallback((d) => {
    setErrorPin("");
    setPin((p) => (p.length < PIN_MAX ? p + d : p));
  }, []);
  const borrar = useCallback(() => setPin((p) => p.slice(0, -1)), []);

  // Teclado físico en la pantalla del PIN.
  useEffect(() => {
    if (!seleccionado || resultado) return;
    const onKey = (e) => {
      if (/^[0-9]$/.test(e.key)) pulsar(e.key);
      else if (e.key === "Backspace") borrar();
      else if (e.key === "Escape") reiniciar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [seleccionado, resultado, pulsar, borrar, reiniciar]);

  const fichar = async (tipo) => {
    if (enviando || pin.length < 4) return;
    setEnviando(true);
    try {
      const { data, error } = await supabase.rpc("kiosco_fichar", {
        p_token: token,
        p_empleado_id: seleccionado.id,
        p_pin: pin,
        p_tipo: tipo,
      });
      if (error) {
        setResultado({ ok: false, titulo: "No se pudo registrar", detalle: "Revisa la conexión a internet e inténtalo de nuevo." });
        return;
      }
      if (data?.error === "kiosco_no_autorizado") {
        noAutorizado();
        return;
      }
      const m = mensajeFichaje(data);
      if (data?.error === "pin_incorrecto") {
        setPin("");
        setErrorPin(m.detalle);
        return;
      }
      setResultado(m);
    } finally {
      setEnviando(false);
    }
  };

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return q ? empleados.filter((e) => normalizar(e.nombre).includes(q)) : empleados;
  }, [empleados, busqueda]);

  if (estado === "sin_token") {
    return (
      <Pantalla>
        <div className="mx-auto max-w-md rounded-2xl border bg-card p-8 text-center shadow-xs">
          <TabletSmartphone className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Este dispositivo no está activado como kiosco</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Un administrador debe iniciar sesión en este dispositivo y activarlo desde
            <strong> Panel → Kiosco</strong>.
          </p>
          <Link
            to="/login"
            className="mt-6 inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Iniciar sesión como administrador
          </Link>
        </div>
      </Pantalla>
    );
  }

  if (estado === "cargando") {
    return (
      <Pantalla>
        <div className="flex h-64 items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
        </div>
      </Pantalla>
    );
  }

  if (estado === "error") {
    return (
      <Pantalla>
        <div className="mx-auto max-w-md rounded-2xl border bg-card p-8 text-center shadow-xs">
          <XCircle className="mx-auto mb-4 h-12 w-12 text-rose-500" />
          <h1 className="text-xl font-semibold">Sin conexión</h1>
          <p className="mt-3 text-sm text-muted-foreground">No se pudo cargar la lista de empleados.</p>
          <button
            onClick={() => { setEstado("cargando"); cargar(); }}
            className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Reintentar
          </button>
        </div>
      </Pantalla>
    );
  }

  return (
    <Pantalla ahora={ahora}>
      {resultado ? (
        <div
          className={cn(
            "mx-auto flex max-w-xl flex-col items-center rounded-3xl border p-10 text-center shadow-xs",
            resultado.ok ? "border-emerald-500/30 bg-emerald-500/10" : "border-rose-500/30 bg-rose-500/10"
          )}
          onClick={reiniciar}
        >
          {resultado.ok ? (
            <CheckCircle2 className="mb-4 h-20 w-20 text-emerald-600" />
          ) : (
            <XCircle className="mb-4 h-20 w-20 text-rose-600" />
          )}
          <h2 className="text-3xl font-semibold">{resultado.titulo}</h2>
          <p className="mt-3 text-lg text-muted-foreground">{resultado.detalle}</p>
        </div>
      ) : seleccionado ? (
        <div className="mx-auto max-w-sm">
          <button
            onClick={reiniciar}
            className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> No soy yo
          </button>
          <div className="rounded-3xl border bg-card p-6 shadow-xs">
            <p className="text-center text-sm text-muted-foreground">Hola,</p>
            <h2 className="text-center text-2xl font-semibold">{seleccionado.nombre}</h2>
            <p className="mt-4 text-center text-sm text-muted-foreground">Escribe tu PIN</p>
            <div className="my-4 flex justify-center gap-3" aria-label={`PIN: ${pin.length} dígitos`}>
              {Array.from({ length: PIN_MAX }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-4 w-4 rounded-full border-2",
                    i < pin.length ? "border-primary bg-primary" : "border-muted-foreground/30",
                    i >= 4 && i >= pin.length && "opacity-40"
                  )}
                />
              ))}
            </div>
            <p className={cn("min-h-5 text-center text-sm", errorPin ? "text-rose-600" : "text-transparent")} role="alert">
              {errorPin || "·"}
            </p>
            <div className="mt-3 grid grid-cols-3 gap-3">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <Tecla key={d} onClick={() => pulsar(d)}>{d}</Tecla>
              ))}
              <span />
              <Tecla onClick={() => pulsar("0")}>0</Tecla>
              <Tecla onClick={borrar} aria-label="Borrar">
                <Delete className="h-6 w-6" />
              </Tecla>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                onClick={() => fichar("entrada")}
                disabled={pin.length < 4 || enviando}
                className="flex h-16 items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-lg font-semibold text-white disabled:opacity-40"
              >
                <LogIn className="h-5 w-5" /> Entrada
              </button>
              <button
                onClick={() => fichar("salida")}
                disabled={pin.length < 4 || enviando}
                className="flex h-16 items-center justify-center gap-2 rounded-2xl bg-slate-800 text-lg font-semibold text-white disabled:opacity-40"
              >
                <LogOut className="h-5 w-5" /> Salida
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-4xl">
          <div className="relative mb-5">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Busca tu nombre..."
              className="h-14 w-full rounded-2xl border bg-card pl-12 pr-4 text-lg shadow-xs outline-hidden focus:ring-2 focus:ring-primary"
            />
          </div>
          {filtrados.length === 0 ? (
            <p className="py-16 text-center text-muted-foreground">No hay empleados con ese nombre.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtrados.map((e) => (
                <button
                  key={e.id}
                  disabled={!e.tiene_pin}
                  onClick={() => setSeleccionado(e)}
                  className="flex min-h-16 flex-col items-start justify-center rounded-2xl border bg-card px-5 py-3 text-left shadow-xs transition-colors hover:border-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="text-lg font-medium">{e.nombre}</span>
                  <span className="text-xs text-muted-foreground">
                    {e.tiene_pin ? e.departamento || " " : "Sin PIN · pide uno a un administrador"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Pantalla>
  );
}

function Pantalla({ ahora, children }) {
  return (
    <div className="min-h-screen bg-muted/30 px-4 py-6 sm:px-8">
      <header className="mx-auto mb-8 flex max-w-4xl items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Fingerprint className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold">AsistenciaPro</span>
        </div>
        {ahora && (
          <div className="text-right">
            <div className="text-3xl font-semibold tabular-nums">{format(ahora, "HH:mm")}</div>
            <div className="text-sm text-muted-foreground first-letter:uppercase">
              {format(ahora, "EEEE d 'de' MMMM", { locale: es })}
            </div>
          </div>
        )}
      </header>
      <main>{children}</main>
    </div>
  );
}

function Tecla({ className, ...props }) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-16 items-center justify-center rounded-2xl border bg-background text-2xl font-medium shadow-xs active:bg-accent",
        className
      )}
      {...props}
    />
  );
}
