"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/Input";
import { AlertCircle } from "lucide-react";

export default function LoginPage() {
  const { needsSetup, loading, login, setup } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted">
        <div
          className="h-9 w-9 animate-spin rounded-full border-[3px] border-slate-200 border-t-brand-600"
          aria-label="Cargando"
        />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (needsSetup) {
        await setup(nombre, email, password);
      } else {
        await login(email, password);
      }
      window.location.assign("/dashboard");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Credenciales incorrectas";
      setError(msg || "Credenciales incorrectas");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-muted px-4 py-8">
      <div className="w-full max-w-[440px] rounded-card border border-slate-200/80 bg-white p-8 shadow-card">
        <div className="mb-4 flex justify-center overflow-hidden rounded-lg">
          <BrandLogo variant="login" priority />
        </div>

        <p className="text-center text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
          Sistema integral de gestión clínica odontológica
        </p>

        <p className="mt-3 mb-6 text-center text-sm leading-relaxed text-slate-600">
          {needsSetup
            ? "Crea tu cuenta administrador para comenzar."
            : "Accede con tu correo y contraseña al panel de M&D Odontología Especializada."}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5" autoComplete="off">
          {needsSetup && (
            <Input
              id="login-nombre"
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre completo*"
              required
              autoComplete="off"
            />
          )}

          <Input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Correo electrónico*"
            required
            autoComplete="off"
            autoFocus
          />

          <Input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña*"
            required
            autoComplete="new-password"
          />

          {!needsSetup && (
            <div className="-mt-1 text-right">
              <button
                type="button"
                className="text-sm text-brand-600 underline underline-offset-2 transition-smooth hover:text-brand-700"
                onClick={() =>
                  alert(
                    "Contacta al administrador del sistema para restablecer tu contraseña."
                  )
                }
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-danger-200 bg-danger-50 px-3.5 py-2.5 text-sm text-danger-600"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
          )}

          <Button
            id="login-submit"
            type="submit"
            loading={busy}
            className="mt-1 w-full py-2.5 text-[0.95rem] font-semibold"
          >
            {needsSetup ? "Crear cuenta" : "Iniciar sesión"}
          </Button>
        </form>
      </div>

      <footer className="mt-6 flex flex-col items-center gap-1 text-center text-help text-slate-400">
        <p>© 2026 M&D Odontología Especializada · Todos los derechos reservados.</p>
        <button
          type="button"
          className="text-brand-600 underline underline-offset-2 transition-smooth hover:text-brand-700"
          onClick={() =>
            alert(
              "M&D Odontología Especializada v1.0.0 — Sistema de Gestión Clínica Odontológica"
            )
          }
        >
          Acerca de
        </button>
      </footer>
    </div>
  );
}
