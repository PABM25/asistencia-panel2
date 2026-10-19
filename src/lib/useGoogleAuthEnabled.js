import { useEffect, useState } from "react";

// Consulta a Supabase si el acceso con Google está activado, para no mostrar
// un botón que lleva a la página de error "provider is not enabled".
export function useGoogleAuthEnabled() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    let cancelled = false;
    fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
      .then((res) => (res.ok ? res.json() : null))
      .then((settings) => {
        if (!cancelled) setEnabled(!!settings?.external?.google);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return enabled;
}
