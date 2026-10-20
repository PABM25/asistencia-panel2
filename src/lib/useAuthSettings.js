import { useEffect, useState } from "react";
import { supabaseAnonKey, supabaseUrl } from "@/api/supabaseClient";

// Consulta la configuración pública de Supabase Auth para mostrar solo las
// opciones que están activadas:
//   google: acceso con Google activado
//   signup: se permite crear cuentas nuevas
// Mientras carga (o si falla) se asume lo más restrictivo, salvo el registro,
// que se asume permitido para no bloquear al primer administrador.
export function useAuthSettings() {
  const [settings, setSettings] = useState({ google: false, signup: true, loaded: false });

  useEffect(() => {
    const url = supabaseUrl;
    const key = supabaseAnonKey;
    if (!url || !key) return;
    let cancelled = false;
    fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
      .then((res) => (res.ok ? res.json() : null))
      .then((s) => {
        if (cancelled || !s) return;
        setSettings({ google: !!s.external?.google, signup: !s.disable_signup, loaded: true });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return settings;
}
