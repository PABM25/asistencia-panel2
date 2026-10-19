import { toast } from "@/components/ui/use-toast";

// Muestra un error de la base de datos (o cualquier otro) como aviso en pantalla.
export function notifyError(error, title = "No se pudo completar la acción") {
  console.error(error);
  toast({
    variant: "destructive",
    title,
    description: error?.message || "Error desconocido",
  });
}

export function notifySuccess(title, description) {
  toast({ title, description });
}
