import { useEffect, useState } from "react";

// Código QR que abre el kiosco de la demo en el teléfono de quien la prueba.
export default function QrKiosco({ size = 132 }) {
  const [src, setSrc] = useState("");
  const url = `${window.location.origin}/kiosco`;

  useEffect(() => {
    let cancelado = false;
    // Se carga solo cuando se muestra, para no pesar en el resto de la app.
    import("qrcode")
      .then((QR) => QR.toDataURL(url, { width: size * 2, margin: 1 }))
      .then((data) => !cancelado && setSrc(data))
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [url, size]);

  return src ? (
    <img src={src} width={size} height={size} alt={`Código QR para abrir el kiosco: ${url}`} className="rounded-md border bg-white" />
  ) : (
    <div style={{ width: size, height: size }} className="rounded-md border bg-muted" />
  );
}
