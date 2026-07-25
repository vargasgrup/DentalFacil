"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/Input";
import { AlertCircle, CheckCircle2 } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "";

export default function RecuperarClavePage() {
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [valid, setValid] = useState<boolean | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = (params.get("token") || "").trim();
    setToken(t);
    if (!t) {
      setValid(false);
      setError("Enlace incompleto. Solicite un nuevo código desde el inicio de sesión.");
      return;
    }
    void (async () => {
      try {
        const res = await fetch(`${API}/api/auth/validate-reset`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: t }),
        });
        const body = await res.json();
        if (body.valid) {
          setValid(true);
          setEmail(body.email || "");
          setNombre(body.nombre || "");
        } else {
          setValid(false);
          setError("El enlace no es válido o ya expiró. Solicite uno nuevo.");
        }
      } catch {
        setValid(false);
        setError("No se pudo validar el enlace.");
      }
    })();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      setBusy(false);
      return;
    }
    try {
      const res = await fetch(`${API}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body.detail === "string" ? body.detail : "No se pudo restablecer la contraseña"
        );
      }
      setOk("Contraseña actualizada. Ya puede iniciar sesión.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al restablecer");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-muted px-4 py-8">
      <div className="w-full max-w-[440px] rounded-card border border-slate-200/80 bg-white p-8 shadow-card">
        <div className="mb-4 flex justify-center overflow-hidden rounded-lg">
          <BrandLogo variant="login" priority />
        </div>
        <h1 className="mb-1 text-center text-lg font-semibold text-slate-800">
          Restablecer contraseña
        </h1>
        <p className="mb-6 text-center text-sm text-slate-600">
          {nombre ? `Cuenta de ${nombre}` : "Defina una nueva contraseña para su cuenta."}
        </p>

        {ok ? (
          <div className="flex flex-col gap-4">
            <div
              role="status"
              className="flex items-start gap-2 rounded-lg border border-success-200 bg-success-50 px-3.5 py-2.5 text-sm text-success-800"
            >
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{ok}</span>
            </div>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white"
            >
              Ir a iniciar sesión
            </Link>
          </div>
        ) : valid === false ? (
          <div className="flex flex-col gap-4">
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-danger-200 bg-danger-50 px-3.5 py-2.5 text-sm text-danger-600"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
            <Link href="/?view=forgot" className="text-center text-sm text-brand-600 underline">
              Solicitar nuevo código
            </Link>
          </div>
        ) : valid === null ? (
          <div className="flex justify-center py-6">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-slate-200 border-t-brand-600" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            {email && (
              <Input label="Correo" value={email} readOnly className="bg-slate-50" />
            )}
            <Input
              type="password"
              label="Nueva contraseña"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              autoFocus
            />
            <Input
              type="password"
              label="Confirmar contraseña"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-danger-200 bg-danger-50 px-3.5 py-2.5 text-sm text-danger-600"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <Button type="submit" loading={busy} className="w-full py-2.5 font-semibold">
              Guardar contraseña
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
