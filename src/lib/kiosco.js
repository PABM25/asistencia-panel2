import { DEMO, DEMO_KIOSCO_TOKEN } from "@/lib/demo";

// Token del dispositivo kiosco. Lo entrega kiosco_crear() al activar el
// dispositivo desde el panel y se guarda solo en este navegador. En la demo,
// si no hay uno, se usa el del kiosco público.
const KEY = "asistencia.kioscoToken";

export function getKioscoToken() {
  let token = "";
  try {
    token = localStorage.getItem(KEY) || "";
  } catch {
    // Sin acceso al almacenamiento.
  }
  return token || (DEMO ? DEMO_KIOSCO_TOKEN : "");
}

export function setKioscoToken(token) {
  try {
    localStorage.setItem(KEY, token);
    return true;
  } catch {
    return false;
  }
}

export function clearKioscoToken() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Sin acceso al almacenamiento: no hay nada que borrar.
  }
}

// Mismas reglas que empleado_set_pin() en la base de datos. Devuelve el
// problema encontrado o "" si el PIN es válido.
export function validarPin(pin) {
  if (!/^[0-9]{4,6}$/.test(pin)) return "El PIN debe tener entre 4 y 6 dígitos.";
  if (/^(.)\1+$/.test(pin) || "0123456789".includes(pin) || "9876543210".includes(pin)) {
    return "El PIN es demasiado fácil de adivinar (evita 1111, 1234, 4321...).";
  }
  return "";
}

// "45 minuto(s)" o, desde una hora, "2 hora(s)" (el bloqueo del PIN llega a 24 h).
function duracion(minutos) {
  const m = Number(minutos) || 0;
  return m >= 60 ? `${Math.ceil(m / 60)} hora(s)` : `${m} minuto(s)`;
}

// Convierte la respuesta de kiosco_fichar() / admin_fichar() en un mensaje.
export function mensajeFichaje(r) {
  if (r?.ok) {
    const accion = r.tipo === "entrada" ? "Entrada" : "Salida";
    const retraso = r.tipo === "entrada" && r.estado === "retraso" ? " · con retraso" : "";
    const noche = r.turno_noche ? " · cierra el turno de anoche" : "";
    return { ok: true, titulo: `${accion} registrada`, detalle: `${r.nombre} · ${r.hora}${retraso}${noche}` };
  }
  const textos = {
    ya_fichado: `${r?.nombre || "El empleado"} ya marcó la ${r?.tipo} hoy a las ${r?.hora}.`,
    pin_incorrecto:
      r?.intentos_restantes > 0
        ? `PIN incorrecto. Te quedan ${r.intentos_restantes} intento(s).`
        : "PIN incorrecto.",
    bloqueado: `Demasiados intentos fallidos. Espera ${duracion(r?.minutos)} o pide a un administrador que desbloquee tu PIN.`,
    sin_pin: "No tienes PIN asignado. Pide a un administrador que te asigne uno.",
    empleado_no_encontrado: "Empleado no encontrado o inactivo.",
    kiosco_no_autorizado: "Este dispositivo ya no está autorizado como kiosco.",
    tipo_invalido: "Operación no válida.",
  };
  return { ok: false, titulo: "No se pudo registrar", detalle: textos[r?.error] || "Error desconocido." };
}
