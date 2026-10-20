// Modo demo: se activa con VITE_DEMO=true en el hosting (ver docs/DEMO.md).
// Muestra las credenciales de la cuenta demo, abre el kiosco sin activarlo y
// enseña los PIN de prueba. No cambia nada en una instalación normal.
export const DEMO = import.meta.env.VITE_DEMO === "true";
export const DEMO_EMAIL = import.meta.env.VITE_DEMO_EMAIL || "";
export const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD || "";

// Token del kiosco público de la demo. Es público a propósito: solo existe en
// el proyecto de demo (supabase/demo/configurar_demo.sql).
export const DEMO_KIOSCO_TOKEN = "demo-publico-pulso-kiosco-no-usar-en-produccion";

// PIN de los empleados de prueba (supabase/datos_demo.sql).
export const PINES_DEMO = {
  "demo-01": "2580",
  "demo-02": "1470",
  "demo-03": "8024",
  "demo-04": "6203",
  "demo-05": "9148",
  "demo-06": "3691",
  "demo-07": "4826",
  "demo-08": "5917",
  "demo-09": "7395",
};
