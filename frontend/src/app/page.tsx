"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/Input";
import { AlertCircle, ArrowLeft, CheckCircle2, Upload } from "lucide-react";

type SetupMode = "new" | "restore";
type AuthView = "login" | "forgot" | "reset";

const API = process.env.NEXT_PUBLIC_API_URL || "";

export default function LoginPage() {
  const { needsSetup, loading, login, setup, user } = useAuth();

  const [view, setView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [setupMode, setSetupMode] = useState<SetupMode>("new");
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [restoreOk, setRestoreOk] = useState("");

  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inlineCode, setInlineCode] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("recuperar") === "1" || params.get("view") === "forgot") {
      setView("forgot");
    }
  }, []);

  const goLogin = useCallback(() => {
    setView("login");
    setError("");
    setInfo("");
    setResetCode("");
    setNewPassword("");
    setConfirmPassword("");
    setInlineCode(null);
  }, []);

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

  if (user) {
    if (typeof window !== "undefined") {
      window.location.assign("/dashboard");
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted">
        <div
          className="h-9 w-9 animate-spin rounded-full border-[3px] border-slate-200 border-t-brand-600"
          aria-label="Entrando"
        />
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
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

  const handleForgot = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    setInlineCode(null);
    try {
      const res = await fetch(`${API}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body.detail === "string" ? body.detail : "No se pudo procesar la solicitud"
        );
      }
      setInfo(body.message || "Solicitud enviada.");
      if (typeof body.reset_code === "string" && body.reset_code) {
        setInlineCode(body.reset_code);
        setResetCode(body.reset_code);
      }
      setView("reset");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al solicitar recuperación");
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async (e: FormEvent) => {
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
          email: email.trim(),
          code: resetCode.trim(),
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = body.detail;
        const msg =
          typeof detail === "string"
            ? detail
            : Array.isArray(detail)
              ? detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join(". ")
              : "No se pudo restablecer la contraseña";
        throw new Error(msg);
      }
      setInfo("Contraseña actualizada. Ya puede iniciar sesión.");
      setPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setResetCode("");
      setView("login");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al restablecer");
    } finally {
      setBusy(false);
    }
  };

  const handleBootstrapRestore = async (e: FormEvent) => {
    e.preventDefault();
    if (!restoreFile || confirmText.trim().toUpperCase() !== "CONFIRMAR") return;
    setBusy(true);
    setError("");
    setRestoreOk("");
    try {
      const fd = new FormData();
      fd.append("file", restoreFile);
      fd.append("confirm_token", "CONFIRMAR");
      const res = await fetch(`${API}/api/backup/restore-bootstrap`, {
        method: "POST",
        body: fd,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body.detail === "string" ? body.detail : "No se pudo restaurar el backup"
        );
      }
      setRestoreOk(
        "Restauración completada. Inicie sesión con un usuario incluido en el backup."
      );
      setSetupMode("new");
      window.setTimeout(() => window.location.reload(), 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al restaurar");
    } finally {
      setBusy(false);
    }
  };

  const subtitle =
    needsSetup && setupMode === "restore"
      ? "Cargue un backup para migrar esta instalación desde otra PC."
      : needsSetup
        ? "Crea tu cuenta administrador para comenzar."
        : view === "forgot"
          ? "Ingrese su correo para recibir un código de recuperación."
          : view === "reset"
            ? "Ingrese el código recibido y su nueva contraseña."
            : "Accede con tu correo y contraseña al panel de M&D Odontología Especializada.";

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
          {subtitle}
        </p>

        {needsSetup && (
          <div className="mb-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSetupMode("new")}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                setupMode === "new"
                  ? "border-brand-600 bg-brand-50 text-brand-800"
                  : "border-slate-300 bg-white text-slate-600"
              }`}
            >
              Instalación nueva
            </button>
            <button
              type="button"
              onClick={() => setSetupMode("restore")}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                setupMode === "restore"
                  ? "border-brand-600 bg-brand-50 text-brand-800"
                  : "border-slate-300 bg-white text-slate-600"
              }`}
            >
              Restaurar backup
            </button>
          </div>
        )}

        {needsSetup && setupMode === "restore" ? (
          <form onSubmit={handleBootstrapRestore} className="flex flex-col gap-3.5">
            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm">
              <Upload className="h-4 w-4" />
              {restoreFile ? restoreFile.name : "Elegir archivo .zip de backup"}
              <input
                type="file"
                accept=".zip,application/zip"
                className="sr-only"
                onChange={(e) => setRestoreFile(e.target.files?.[0] || null)}
              />
            </label>
            <Input
              label="Escriba CONFIRMAR"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              required
            />
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-danger-200 bg-danger-50 px-3.5 py-2.5 text-sm text-danger-600"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{error}</span>
              </div>
            )}
            {restoreOk && (
              <p
                role="status"
                className="rounded-lg border border-success-200 bg-success-50 px-3 py-2 text-sm text-success-800"
              >
                {restoreOk}
              </p>
            )}
            <Button
              type="submit"
              loading={busy}
              disabled={!restoreFile || confirmText.trim().toUpperCase() !== "CONFIRMAR"}
              className="mt-1 w-full py-2.5 text-[0.95rem] font-semibold"
              variant="danger"
            >
              Restaurar e iniciar
            </Button>
          </form>
        ) : view === "forgot" ? (
          <form onSubmit={handleForgot} className="flex flex-col gap-3.5" autoComplete="off">
            <Input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Correo electrónico*"
              required
              autoFocus
              autoComplete="email"
            />
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
              type="submit"
              loading={busy}
              className="mt-1 w-full py-2.5 text-[0.95rem] font-semibold"
            >
              Enviar código de recuperación
            </Button>
            <button
              type="button"
              onClick={goLogin}
              className="inline-flex items-center justify-center gap-1 text-sm text-brand-600 underline underline-offset-2"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Volver al inicio de sesión
            </button>
          </form>
        ) : view === "reset" ? (
          <form onSubmit={handleReset} className="flex flex-col gap-3.5" autoComplete="off">
            {info && (
              <div
                role="status"
                className="flex items-start gap-2 rounded-lg border border-success-200 bg-success-50 px-3.5 py-2.5 text-sm text-success-800"
              >
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{info}</span>
              </div>
            )}
            {inlineCode && (
              <p className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-center text-sm text-brand-900">
                Código (modo local): <strong className="tracking-widest">{inlineCode}</strong>
              </p>
            )}
            <Input
              id="reset-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Correo electrónico*"
              required
              autoComplete="email"
            />
            <Input
              id="reset-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={resetCode}
              onChange={(e) => setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="Código de 6 dígitos*"
              required
              autoComplete="one-time-code"
              autoFocus
            />
            <Input
              id="reset-new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Nueva contraseña*"
              required
              minLength={6}
              autoComplete="new-password"
            />
            <Input
              id="reset-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirmar contraseña*"
              required
              minLength={6}
              autoComplete="new-password"
            />
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
              type="submit"
              loading={busy}
              className="mt-1 w-full py-2.5 text-[0.95rem] font-semibold"
            >
              Guardar nueva contraseña
            </Button>
            <button
              type="button"
              onClick={goLogin}
              className="inline-flex items-center justify-center gap-1 text-sm text-brand-600 underline underline-offset-2"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Volver al inicio de sesión
            </button>
          </form>
        ) : (
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
                  onClick={() => {
                    setError("");
                    setInfo("");
                    setView("forgot");
                  }}
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            )}

            {info && (
              <div
                role="status"
                className="flex items-start gap-2 rounded-lg border border-success-200 bg-success-50 px-3.5 py-2.5 text-sm text-success-800"
              >
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{info}</span>
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
        )}
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
