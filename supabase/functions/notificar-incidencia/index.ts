// Envía un email a todos los administradores cuando se registra un retraso o
// una ausencia. La invoca el trigger `aviso_incidencia` de la base de datos.
//
// Secretos necesarios (supabase secrets set ...):
//   NOTIFY_SECRET   valor compartido con el trigger (cabecera x-notify-secret)
//   RESEND_API_KEY  clave de https://resend.com
//   EMAIL_FROM      remitente verificado en Resend, p. ej. "Asistenta Pro <avisos@tudominio.cl>"
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
<tr><td style="background:#111;padding:20px 36px;color:#fff;font-size:18px;font-weight:700">Asistenta Pro</td></tr>
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
<tr><td style="background:#f6f7f9;padding:20px 36px;color:#6b7280;font-size:12px">Aviso automático de Asistenta Pro.</td></tr>
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

  const { empleado, fecha, estado, hora_entrada, notas } = await req.json();
  const tipo = estado === "retraso" ? "Retraso" : "Ausencia injustificada";

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

  const vars = {
    tipo,
    empleado: empleado || "Empleado",
    fecha: fecha || "-",
    hora_entrada: hora_entrada || "-",
    notas: notas || "-",
  };
  const html = renderEmail(vars, (Deno.env.get("APP_URL") || "").replace(/\/$/, ""));
  const subject = `${tipo}: ${vars.empleado} (${vars.fecha})`;

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
