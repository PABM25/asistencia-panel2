// Validación del parámetro ?returnTo= de las pantallas de acceso. Está en un
// solo lugar a propósito: es sensible para la seguridad.

// Devuelve una ruta segura del mismo sitio, o "/" si no lo es.
//
// Comprobar que el origen sea el mismo no basta: valores como /.//malo.com o
// /\malo.com pasan esa prueba, pero al asignarlos a location.href se
// convierten en //malo.com y llevan a otro sitio (redirección abierta). Por eso
// la ruta debe empezar con una sola barra y no contener barras invertidas.
export function safeReturnTo() {
  const raw = new URLSearchParams(window.location.search).get("returnTo");
  if (!raw) return "/";
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return "/";
    // Nunca se arrastran tokens ni códigos de acceso a la URL de la app.
    for (const p of ["access_token", "refresh_token", "code", "token_hash"]) {
      url.searchParams.delete(p);
    }
    const path = url.pathname + url.search;
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return "/";
    return path;
  } catch {
    return "/";
  }
}
