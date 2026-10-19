// Traduce los mensajes de error más habituales de Supabase Auth (vienen en inglés).
const MESSAGES = [
  ["invalid login credentials", "Email o contraseña incorrectos."],
  ["email not confirmed", "Debes confirmar tu email antes de entrar."],
  ["user already registered", "Ya existe una cuenta con ese email."],
  ["password should be at least", "La contraseña es demasiado corta (mínimo 6 caracteres)."],
  ["password should contain", "La contraseña no cumple los requisitos de seguridad."],
  ["should be different from the old password", "La nueva contraseña debe ser distinta de la anterior."],
  ["token has expired or is invalid", "El código no es válido o ha caducado."],
  ["rate limit", "Demasiados intentos. Espera unos minutos y vuelve a probar."],
  ["for security purposes, you can only request this after", "Por seguridad, espera unos segundos antes de volver a pedirlo."],
  ["provider is not enabled", "El acceso con Google no está activado. Usa email y contraseña."],
  ["unable to validate email address", "El email no es válido."],
  ["signups not allowed", "El registro de nuevas cuentas está desactivado."],
];

export function authErrorMessage(error, fallback = "Ha ocurrido un error. Inténtalo de nuevo.") {
  const raw = String(error?.message || "");
  const lower = raw.toLowerCase();
  const hit = MESSAGES.find(([needle]) => lower.includes(needle));
  return hit ? hit[1] : raw || fallback;
}
