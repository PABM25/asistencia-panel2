// Envía un email a todos los administradores:
//   * por cada retraso o ausencia registrada a mano o en el kiosco (trigger
//     `aviso_incidencia`), o
//   * con el resumen diario de ausencias automáticas (cuerpo con
//     tipo = "resumen_ausencias", lo envía _enviar_resumen_ausencias).
//
// Secretos necesarios (supabase secrets set ...):
//   NOTIFY_SECRET   valor compartido con el trigger (cabecera x-notify-secret)
//   RESEND_API_KEY  clave de https://resend.com
//   EMAIL_FROM      remitente verificado en Resend, p. ej. "Pulso <avisos@tudominio.cl>"
//   APP_URL         URL pública de la app, p. ej. https://asistencia.tudominio.cl
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase automáticamente.
import { createHash, timingSafeEqual } from "node:crypto";
import { createClient } from "npm:@supabase/supabase-js@2";

// Límites para el cuerpo de la petición: la llaman solo los triggers de la
// base, así que algo más grande es un error o un abuso.
const MAX_BODY_BYTES = 64 * 1024;
const MAX_EMPLEADOS = 500;
const MAX_TEXTO = 300;

// Compara el secreto en tiempo constante (los hash igualan el largo), para
// que el tiempo de respuesta no revele cuántos caracteres coinciden.
function secretoValido(recibido: string | null, esperado: string) {
  if (!recibido) return false;
  const a = createHash("sha256").update(recibido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}

// Texto acotado y sin saltos de línea (el asunto del email es una cabecera).
const texto = (v: unknown, def = "-") =>
  v === null || v === undefined || v === ""
    ? def
    : String(v).replace(/[\r\n]+/g, " ").slice(0, MAX_TEXTO);

const fechaValida = (v: unknown) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "-";

const escapeHtml = (v: unknown) =>
  String(v ?? "-").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );

function renderEmail(vars: Record<string, string>, appUrl: string) {
  const v = Object.fromEntries(Object.entries(vars).map(([k, x]) => [k, escapeHtml(x)]));
  const boton = appUrl
    ? `<tr><td style="padding:0 36px 40px"><a href="${escapeHtml(appUrl)}/asistencia" style="display:inline-block;background:#000;color:#fff;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:4px">Ver asistencia</a></td></tr>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;color:#000">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff">
<tr><td style="background:#111;padding:20px 36px;color:#fff;font-size:18px;font-weight:700">Pulso</td></tr>
<tr><td style="padding:40px 36px 8px">
  <div style="font-size:26px;font-weight:700;line-height:1.2">${v.tipo} registrado</div>
  <div style="color:#6b7280;padding-top:8px;font-size:15px">Se ha registrado una incidencia de asistencia que requiere tu atención.</div>
</td></tr>
<tr><td style="padding:24px 36px"><div style="border:1px solid #e5e7eb;border-radius:4px;padding:16px;font-size:15px;line-height:1.6">
  <strong>Empleado:</strong> ${v.empleado}<br>
  <strong>Fecha:</strong> ${v.fecha}<br>
  <strong>Hora de entrada:</strong> ${v.hora_entrada}<br>
  <strong>Notas:</strong> ${v.notas}
</div></td></tr>
${boton}
<tr><td style="background:#f6f7f9;padding:20px 36px;color:#6b7280;font-size:12px">Aviso automático de Pulso.</td></tr>
</table></body></html>`;
}

function renderResumen(fecha: string, empleados: string[], appUrl: string) {
  const items = empleados.map((e) => `<li style="padding:2px 0">${escapeHtml(e)}</li>`).join("");
  const boton = appUrl
    ? `<tr><td style="padding:0 36px 40px"><a href="${escapeHtml(appUrl)}/asistencia" style="display:inline-block;background:#000;color:#fff;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:4px">Ver asistencia</a></td></tr>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;color:#000">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff">
<tr><td style="background:#111;padding:20px 36px;color:#fff;font-size:18px;font-weight:700">Pulso</td></tr>
<tr><td style="padding:40px 36px 8px">
  <div style="font-size:26px;font-weight:700;line-height:1.2">${empleados.length} ausencia(s) el ${escapeHtml(fecha)}</div>
  <div style="color:#6b7280;padding-top:8px;font-size:15px">Debían trabajar y no registraron ningún fichaje. Se marcaron como ausentes automáticamente.</div>
</td></tr>
<tr><td style="padding:24px 36px"><ul style="margin:0;padding-left:20px;font-size:15px;line-height:1.6">${items}</ul></td></tr>
${boton}
<tr><td style="background:#f6f7f9;padding:20px 36px;color:#6b7280;font-size:12px">Resumen automático de Pulso.</td></tr>
</table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const secret = Deno.env.get("NOTIFY_SECRET");
  if (!secret || !secretoValido(req.headers.get("x-notify-secret"), secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("EMAIL_FROM");
  if (!resendKey || !from) {
    // El detalle va al log de la función, no a la respuesta.
    console.error("Faltan los secretos RESEND_API_KEY o EMAIL_FROM");
    return Response.json({ error: "Configuración incompleta" }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) {
      return Response.json({ error: "Payload too large" }, { status: 413 });
    }
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("no es un objeto");
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  const appUrl = (Deno.env.get("APP_URL") || "").replace(/\/$/, "");

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: admins, error } = await admin
    .from("profiles")
    .select("email")
    .eq("role", "admin")
    .not("email", "is", null);
  if (error) {
    console.error("No se pudo leer la lista de administradores:", error);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }

  let subject: string;
  let html: string;
  if (body.tipo === "resumen_ausencias") {
    const empleados = Array.isArray(body.empleados)
      ? body.empleados.slice(0, MAX_EMPLEADOS).map((e) => texto(e))
      : [];
    if (!empleados.length) return Response.json({ enviados: 0, fallos: 0 });
    const fecha = fechaValida(body.fecha);
    subject = `Ausencias del ${fecha}: ${empleados.length}`;
    html = renderResumen(fecha, empleados, appUrl);
  } else {
    // Lista blanca: solo hay dos tipos de incidencia.
    if (body.estado !== "retraso" && body.estado !== "ausente") {
      return Response.json({ error: "Bad request" }, { status: 400 });
    }
    const tipo = body.estado === "retraso" ? "Retraso" : "Ausencia injustificada";
    const vars = {
      tipo,
      empleado: texto(body.empleado, "Empleado"),
      fecha: fechaValida(body.fecha),
      hora_entrada: texto(body.hora_entrada),
      notas: texto(body.notas),
    };
    html = renderEmail(vars, appUrl);
    subject = `${tipo}: ${vars.empleado} (${vars.fecha})`;
  }

  let enviados = 0;
  let fallos = 0;
  for (const { email } of admins ?? []) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: email, subject, html }),
      });
      if (res.ok) enviados++;
      else {
        fallos++;
        console.error(`Resend respondió ${res.status} para un destinatario`);
      }
    } catch (e) {
      fallos++;
      console.error("No se pudo contactar con Resend:", e);
    }
  }

  // Solo totales: la respuesta queda guardada en net._http_response y no debe
  // incluir los emails de los administradores.
  return Response.json({ enviados, fallos });
});
