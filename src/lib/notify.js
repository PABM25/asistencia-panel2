import { toast } from "@/components/ui/use-toast";
import { dbErrorMessage } from "@/api/db";

// Muestra un error de la base de datos (o cualquier otro) como aviso en pantalla.
// Los errores de Supabase traen `code`: su mensaje original no se muestra
// (puede revelar detalles internos), solo la versión de dbErrorMessage.
export function notifyError(error, title = "No se pudo completar la acción") {
  console.error(error);
  toast({
    variant: "destructive",
    title,
    description: error?.code ? dbErrorMessage(error) : error?.message || "Error desconocido",
  });
}

export function notifySuccess(title, description) {
  toast({ title, description });
}
