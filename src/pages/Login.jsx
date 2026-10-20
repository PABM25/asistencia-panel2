import React, { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Mail, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import { safeReturnTo } from "@/lib/authReturnTo";
import { authErrorMessage } from "@/lib/authErrors";
import { useAuthSettings } from "@/lib/useAuthSettings";
import { DEMO, DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demo";
import QrKiosco from "@/components/QrKiosco";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const authSettings = useAuthSettings();
  // Ruta a la que volver tras iniciar sesión (solo rutas del mismo sitio).
  const returnTo = safeReturnTo();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { error: authErr } = await supabase.auth.signInWithPassword({ email, password });
      if (authErr) throw authErr;
      window.location.href = returnTo;
    } catch (err) {
      setError(authErrorMessage(err, "Email o contraseña incorrectos."));
    } finally {
      setLoading(false);
    }
  };

  const entrarDemo = async () => {
    setError("");
    setLoading(true);
    try {
      const { error: authErr } = await supabase.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
      if (authErr) throw authErr;
      window.location.href = "/";
    } catch (err) {
      setError(authErrorMessage(err, "No se pudo entrar a la demo."));
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    const { error: authErr } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + returnTo },
    });
    if (authErr) setError(authErrorMessage(authErr));
  };

  return (
    <AuthLayout
      icon={LogIn}
      title="Bienvenido/a"
      subtitle="Inicia sesión en tu cuenta"
      footer={
        authSettings.signup && (
        <>
          ¿No tienes cuenta?{" "}
          <Link
            to={"/register" + (returnTo !== "/" ? "?returnTo=" + encodeURIComponent(returnTo) : "")}
            className="text-primary font-medium hover:underline"
          >
            Crear cuenta
          </Link>
        </>
        )
      }
    >
      {DEMO && DEMO_EMAIL && (
        <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <p className="text-sm font-semibold">Prueba la demo</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Entra como administrador con <strong>{DEMO_EMAIL}</strong> / <strong>{DEMO_PASSWORD}</strong>. Puedes
            cambiar lo que quieras: los datos se reinician cada noche.
          </p>
          <Button className="mt-3 w-full" onClick={entrarDemo} disabled={loading}>
            Entrar a la demo
          </Button>
          <div className="mt-4 flex items-center gap-3 border-t pt-4">
            <QrKiosco size={88} />
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">Kiosco de fichaje:</strong> escanea el código con tu teléfono o
              abre{" "}
              <Link to="/kiosco" className="font-medium text-primary hover:underline">
                /kiosco
              </Link>
              . Los PIN de prueba aparecen en pantalla.
            </p>
          </div>
        </div>
      )}

      {authSettings.google && (
        <>
          <Button
            variant="outline"
            className="w-full h-12 text-sm font-medium mb-6"
            onClick={handleGoogle}
          >
            <GoogleIcon className="w-5 h-5 mr-2" />
            Continuar con Google
          </Button>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-3 text-muted-foreground">o</span>
            </div>
          </div>
        </>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="tu@correo.cl"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Contraseña</Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Entrando...
            </>
          ) : (
            "Iniciar sesión"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
