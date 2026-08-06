"use client";

import { FormEvent, useCallback, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { BrandLogo } from "@/components/BrandLogo";
import { AboutVendorModal } from "@/components/auth/AboutVendorModal";
import { LoginField } from "@/components/auth/LoginField";
import { LoginPremiumShell } from "@/components/auth/LoginPremiumShell";
import { Button } from "@/components/ui/Button";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Lock,
  Mail,
  Upload,
  UserRound,
} from "lucide-react";
import { getApiBase } from "@/lib/api";
import { useClinicBrand } from "@/lib/clinicBrand";

type SetupMode = "new" | "restore";
type AuthView = "login" | "forgot" | "reset";

function AlertBox({
  tone,
  children,
}: {
  tone: "error" | "success";
  children: ReactNode;
}) {
  const styles =
    tone === "error"
      ? "border-danger-200 bg-danger-50 text-danger-700"
      : "border-success-200 bg-success-50 text-success-800";
  const Icon = tone === "error" ? AlertCircle : CheckCircle2;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm ${styles}`}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

function FormTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <header className="login-form-title text-center">
      <h1 className="font-bold leading-tight tracking-[-0.03em] text-slate-900">
        {title}
      </h1>
      {hint ? (
        <p className="mx-auto mt-2 max-w-[34ch] text-sm leading-relaxed text-slate-500 sm:max-w-none">
          {hint}
        </p>
      ) : null}
    </header>
  );
}

export default function LoginPage() {
  const { needsSetup, loading, login, setup, user, demoMode } = useAuth();
  const { displayName, refresh: refreshBrand } = useClinicBrand();

  const [view, setView] = useState<AuthView>("login");
  const [username, setUsername] = useState("");
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
  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("recuperar") === "1" || params.get("view") === "forgot") {
      setView("forgot");
    }
  }, []);

  // Ensure public clinic branding (logo + name) is loaded on the login screen.
  useEffect(() => {
    void refreshBrand();
  }, [refreshBrand]);

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
      <div className="flex min-h-screen items-center justify-center bg-[#eef2f6]">
        <div
          className="h-9 w-9 animate-spin rounded-full border-[3px] border-slate-200 border-t-[#55BBF9]"
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
      <div className="flex min-h-screen items-center justify-center bg-[#eef2f6]">
        <div
          className="h-9 w-9 animate-spin rounded-full border-[3px] border-slate-200 border-t-[#55BBF9]"
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
        await setup(nombre, username, password, email);
      } else {
        await login(username, password);
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
      const res = await fetch(`${getApiBase()}/api/auth/forgot-password`, {
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
      const res = await fetch(`${getApiBase()}/api/auth/reset-password`, {
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
      const res = await fetch(`${getApiBase()}/api/backup/restore-bootstrap`, {
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

  const formTitle =
    needsSetup && setupMode === "restore"
      ? "Restaurar instalación"
      : needsSetup
        ? "Crear cuenta administrador"
        : view === "forgot"
          ? "Recuperar acceso"
          : view === "reset"
            ? "Nueva contraseña"
            : "¡Inicia sesión en tu cuenta!";

  const formHint =
    needsSetup && setupMode === "restore"
      ? "Cargue un backup para migrar esta instalación desde otra PC."
      : needsSetup
        ? "Configure el primer administrador para comenzar."
        : view === "forgot"
          ? "Ingrese su correo para recibir un código de recuperación."
          : view === "reset"
            ? "Ingrese el código recibido y su nueva contraseña."
            : `Accede con tu usuario al panel de ${displayName}.`;

  const panelEyebrow = "Bienvenido a la clínica";
  const panelTitle =
    needsSetup
      ? "Configure su sistema odontológico"
      : "Inicia sesión para continuar";

  const primaryCtaClass =
    "login-cta mt-1 w-full rounded-[12px] border-0 py-3.5 text-[0.95rem] font-semibold text-white shadow-none focus:ring-[#55BBF9]";

  return (
    <>
      <LoginPremiumShell
        panelEyebrow={panelEyebrow}
        panelTitle={panelTitle}
        footer={
          <footer className="flex flex-col items-center gap-1.5 text-center text-[0.75rem] text-slate-500">
            <p>© {new Date().getFullYear()} N&amp;K Systemas S.A.C. · Todos los derechos reservados.</p>
            <button
              type="button"
              className="font-medium text-[#2B9FD9] underline-offset-2 transition-colors hover:text-[#1c66e8] hover:underline"
              onClick={() => setAboutOpen(true)}
            >
              Acerca de
            </button>
          </footer>
        }
      >
        <div className="login-premium__form mx-auto w-full max-w-[400px]">
          <div className="login-brand-wrap mb-5 flex justify-center">
            <BrandLogo
              variant="login"
              priority
              className="login-brand !h-auto !max-h-[5.25rem] !w-auto !max-w-[min(220px,70vw)] !rounded-lg object-contain"
            />
          </div>

          <FormTitle title={formTitle} hint={formHint} />

          {demoMode && view === "login" && !needsSetup && (
            <div
              role="status"
              className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-left text-xs leading-relaxed text-amber-950 sm:text-sm"
            >
              <span className="font-semibold">Versión DEMO.</span> Varios usuarios
              pueden ingresar con las mismas credenciales de Administrador. El
              cambio de usuario y contraseña del Admin está deshabilitado para no
              bloquear el acceso compartido.
            </div>
          )}

          {needsSetup && (
            <div className="mb-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSetupMode("new")}
                className={`rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors ${
                  setupMode === "new"
                    ? "border-[#55BBF9] bg-[#55BBF9]/10 text-slate-900"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                Instalación nueva
              </button>
              <button
                type="button"
                onClick={() => setSetupMode("restore")}
                className={`rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors ${
                  setupMode === "restore"
                    ? "border-[#55BBF9] bg-[#55BBF9]/10 text-slate-900"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                Restaurar backup
              </button>
            </div>
          )}

          {needsSetup && setupMode === "restore" ? (
            <form onSubmit={handleBootstrapRestore} className="flex flex-col gap-3.5">
              <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-[12px] border border-dashed border-slate-300 bg-slate-50/80 px-3 py-3.5 text-sm text-slate-700 transition-colors hover:border-[#55BBF9] hover:bg-[#55BBF9]/5">
                <Upload className="h-4 w-4 text-slate-500" />
                {restoreFile ? restoreFile.name : "Elegir archivo .zip de backup"}
                <input
                  type="file"
                  accept=".zip,application/zip"
                  className="sr-only"
                  onChange={(e) => setRestoreFile(e.target.files?.[0] || null)}
                />
              </label>
              <LoginField
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Escriba CONFIRMAR"
                required
                icon={<KeyRound className="h-4 w-4" strokeWidth={1.75} />}
              />
              {error ? <AlertBox tone="error">{error}</AlertBox> : null}
              {restoreOk ? <AlertBox tone="success">{restoreOk}</AlertBox> : null}
              <Button
                type="submit"
                loading={busy}
                disabled={!restoreFile || confirmText.trim().toUpperCase() !== "CONFIRMAR"}
                className="mt-1 w-full rounded-[12px] py-3.5 text-[0.95rem] font-semibold"
                variant="danger"
              >
                Restaurar e iniciar
              </Button>
            </form>
          ) : view === "forgot" ? (
            <form onSubmit={handleForgot} className="flex flex-col gap-3.5" autoComplete="off">
              <LoginField
                id="forgot-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Correo electrónico"
                required
                autoFocus
                autoComplete="email"
                error={Boolean(error)}
                icon={<Mail className="h-4 w-4" strokeWidth={1.75} />}
              />
              {error ? <AlertBox tone="error">{error}</AlertBox> : null}
              <Button type="submit" loading={busy} className={primaryCtaClass}>
                Enviar código de recuperación
              </Button>
              <button
                type="button"
                onClick={goLogin}
                className="inline-flex items-center justify-center gap-1 text-sm font-medium text-[#2B9FD9] hover:text-[#1c66e8]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Volver al inicio de sesión
              </button>
            </form>
          ) : view === "reset" ? (
            <form onSubmit={handleReset} className="flex flex-col gap-3.5" autoComplete="off">
              {info ? <AlertBox tone="success">{info}</AlertBox> : null}
              {inlineCode ? (
                <p className="rounded-xl border border-[#55BBF9]/40 bg-[#55BBF9]/10 px-3 py-2.5 text-center text-sm text-slate-800">
                  Código (modo local):{" "}
                  <strong className="tracking-widest">{inlineCode}</strong>
                </p>
              ) : null}
              <LoginField
                id="reset-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Correo electrónico"
                required
                autoComplete="email"
                icon={<Mail className="h-4 w-4" strokeWidth={1.75} />}
              />
              <LoginField
                id="reset-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="Código de 6 dígitos"
                required
                autoComplete="one-time-code"
                autoFocus
                icon={<KeyRound className="h-4 w-4" strokeWidth={1.75} />}
              />
              <LoginField
                id="reset-new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Nueva contraseña"
                required
                minLength={6}
                autoComplete="new-password"
                icon={<Lock className="h-4 w-4" strokeWidth={1.75} />}
              />
              <LoginField
                id="reset-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirmar contraseña"
                required
                minLength={6}
                autoComplete="new-password"
                icon={<Lock className="h-4 w-4" strokeWidth={1.75} />}
              />
              {error ? <AlertBox tone="error">{error}</AlertBox> : null}
              <Button type="submit" loading={busy} className={primaryCtaClass}>
                Guardar nueva contraseña
              </Button>
              <button
                type="button"
                onClick={goLogin}
                className="inline-flex items-center justify-center gap-1 text-sm font-medium text-[#2B9FD9] hover:text-[#1c66e8]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Volver al inicio de sesión
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3.5" autoComplete="off">
              {needsSetup && (
                <LoginField
                  id="login-nombre"
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Nombre visible"
                  required
                  autoComplete="off"
                  icon={<UserRound className="h-4 w-4" strokeWidth={1.75} />}
                />
              )}

              <LoginField
                id="login-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Usuario"
                required
                autoComplete="username"
                autoFocus
                error={Boolean(error)}
                icon={<UserRound className="h-4 w-4" strokeWidth={1.75} />}
              />

              {needsSetup && (
                <LoginField
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Correo de recuperación (opcional)"
                  autoComplete="email"
                  icon={<Mail className="h-4 w-4" strokeWidth={1.75} />}
                />
              )}

              <LoginField
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña"
                required
                autoComplete={needsSetup ? "new-password" : "current-password"}
                error={Boolean(error)}
                icon={<Lock className="h-4 w-4" strokeWidth={1.75} />}
              />

              {!needsSetup && (
                <div className="-mt-1 text-right">
                  <button
                    type="button"
                    className="text-sm font-medium text-[#2B9FD9] transition-colors hover:text-[#1c66e8]"
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

              {info ? <AlertBox tone="success">{info}</AlertBox> : null}
              {error ? <AlertBox tone="error">{error}</AlertBox> : null}

              <Button
                id="login-submit"
                type="submit"
                loading={busy}
                className={primaryCtaClass}
              >
                {needsSetup ? "Crear cuenta" : "Continuar"}
              </Button>
            </form>
          )}
        </div>
      </LoginPremiumShell>

      <AboutVendorModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </>
  );
}
