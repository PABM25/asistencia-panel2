import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Loader2, AlertTriangle } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { authErrorMessage } from "@/lib/authErrors";

export default function ResetPassword() {
  // Supabase vuelve aquí desde el email con un código que el cliente canjea
  // automáticamente por una sesión de recuperación.
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      setHasSession(ok);
      setChecking(false);
    };
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (session && event === "SIGNED_IN")) finish(true);
    });

    // Enlace con token_hash (plantilla de email del README): funciona aunque
    // se abra en otro navegador o dispositivo, a diferencia del enlace con
    // ?code=, que solo sirve en el navegador donde se pidió el cambio.
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get("token_hash");
    if (tokenHash) {
      window.history.replaceState(null, "", window.location.pathname);
      supabase.auth
        .verifyOtp({ token_hash: tokenHash, type: params.get("type") || "recovery" })
        .then(({ error }) => finish(!error));
      return () => sub.subscription.unsubscribe();
    }

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) finish(true);
      // Da tiempo a que se canjee el código del enlace antes de rendirse.
      else setTimeout(() => supabase.auth.getSession().then(({ data: d }) => finish(!!d.session)), 1500);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }
    setLoading(true);
    try {
      const { error: authErr } = await supabase.auth.updateUser({ password: newPassword });
      if (authErr) throw authErr;
      await supabase.auth.signOut();
      window.location.href = "/login";
    } catch (err) {
      setError(authErrorMessage(err, "No se pudo cambiar la contraseña."));
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!hasSession) {
    return (
      <AuthLayout
        icon={AlertTriangle}
        title="Enlace no válido"
        subtitle="El enlace para restablecer la contraseña no es válido o ha caducado"
        footer={
          <Link to="/forgot-password" className="text-primary font-medium hover:underline">
            Solicitar un nuevo enlace
          </Link>
        }
      >
        <p className="text-sm text-foreground text-center">
          El enlace parece incompleto o ya se usó. Solicita un nuevo email para restablecer la contraseña.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={Lock}
      title="Nueva contraseña"
      subtitle="Escribe tu nueva contraseña"
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">Nueva contraseña</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              autoFocus
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Repite la contraseña</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Guardando...
            </>
          ) : (
            "Cambiar contraseña"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
