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
import { createClient } from "npm:@supabase/supabase-js@2";

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
  if (!secret || req.headers.get("x-notify-secret") !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("EMAIL_FROM");
  if (!resendKey || !from) {
    return Response.json({ error: "Faltan RESEND_API_KEY o EMAIL_FROM" }, { status: 500 });
  }

  const body = await req.json();
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
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let subject: string;
  let html: string;
  if (body.tipo === "resumen_ausencias") {
    const empleados: string[] = Array.isArray(body.empleados) ? body.empleados.map(String) : [];
    if (!empleados.length) return Response.json({ enviados: 0, fallos: [] });
    subject = `Ausencias del ${body.fecha}: ${empleados.length}`;
    html = renderResumen(String(body.fecha || "-"), empleados, appUrl);
  } else {
    const { empleado, fecha, estado, hora_entrada, notas } = body;
    const tipo = estado === "retraso" ? "Retraso" : "Ausencia injustificada";
    const vars = {
      tipo,
      empleado: empleado || "Empleado",
      fecha: fecha || "-",
      hora_entrada: hora_entrada || "-",
      notas: notas || "-",
    };
    html = renderEmail(vars, appUrl);
    subject = `${tipo}: ${vars.empleado} (${vars.fecha})`;
  }

  let enviados = 0;
  const fallos: string[] = [];
  for (const { email } of admins ?? []) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: email, subject, html }),
    });
    if (res.ok) enviados++;
    else fallos.push(`${email}: ${res.status}`);
  }

  return Response.json({ enviados, fallos });
});
