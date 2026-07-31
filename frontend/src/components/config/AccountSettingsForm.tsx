"use client";

import { useEffect, useState } from "react";
import { KeyRound, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/Input";
import { ConfigSection } from "@/components/config/ConfigSection";

export interface AccountFormValues {
  nombre: string;
  email: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface AccountSettingsFormProps {
  initialNombre: string;
  initialEmail: string;
  busy?: boolean;
  msg: string;
  err: string;
  /** DEMO: lock Admin login email + password (shared credentials). */
  lockCredentials?: boolean;
  onSubmit: (values: AccountFormValues) => Promise<void> | void;
}

export function AccountSettingsForm({
  initialNombre,
  initialEmail,
  busy = false,
  msg,
  err,
  lockCredentials = false,
  onSubmit,
}: AccountSettingsFormProps) {
  const [nombre, setNombre] = useState(initialNombre);
  const [email, setEmail] = useState(initialEmail);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localErr, setLocalErr] = useState("");

  useEffect(() => {
    setNombre(initialNombre);
    setEmail(initialEmail);
  }, [initialNombre, initialEmail]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalErr("");

    const nextNombre = nombre.trim();
    const nextEmail = lockCredentials
      ? initialEmail.trim().toLowerCase()
      : email.trim().toLowerCase();
    if (nextNombre.length < 2) {
      setLocalErr("El nombre de usuario debe tener al menos 2 caracteres.");
      return;
    }
    if (!nextEmail || !nextEmail.includes("@")) {
      setLocalErr("Indique un correo válido (es su usuario de acceso).");
      return;
    }
    if (!currentPassword) {
      setLocalErr("Confirme con su contraseña actual para guardar cambios.");
      return;
    }

    const nombreChanged = nextNombre !== initialNombre.trim();
    const emailChanged =
      !lockCredentials && nextEmail !== initialEmail.trim().toLowerCase();
    const pwdChanged = !lockCredentials && Boolean(newPassword || confirmPassword);

    if (!nombreChanged && !emailChanged && !pwdChanged) {
      setLocalErr(
        lockCredentials
          ? "En DEMO solo puede actualizar el nombre visible (correo y clave están protegidos)."
          : "No hay cambios que guardar."
      );
      return;
    }
    if (pwdChanged) {
      if (newPassword.length < 6) {
        setLocalErr("La nueva contraseña debe tener al menos 6 caracteres.");
        return;
      }
      if (newPassword !== confirmPassword) {
        setLocalErr("Las contraseñas nuevas no coinciden.");
        return;
      }
    }

    await onSubmit({
      nombre: nextNombre,
      email: nextEmail,
      currentPassword,
      newPassword: pwdChanged ? newPassword : "",
      confirmPassword: pwdChanged ? confirmPassword : "",
    });
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  return (
    <ConfigSection
      title="Mi cuenta"
      icon={<KeyRound className="h-4 w-4" aria-hidden />}
      description={
        lockCredentials
          ? "Versión DEMO: puede actualizar su nombre visible. Correo y contraseña del Administrador están protegidos."
          : "Actualice su nombre, correo de acceso o contraseña. Siempre confirme con la contraseña actual."
      }
    >
      {lockCredentials && (
        <div
          role="status"
          className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-950"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
          <p className="leading-relaxed">
            <span className="font-semibold">Versión DEMO.</span> El correo y la
            contraseña del Administrador no se pueden cambiar porque varios usuarios
            ingresan con las mismas credenciales. El resto del sistema sí es
            usable de extremo a extremo.
          </p>
        </div>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Nombre de usuario"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            autoComplete="name"
            required
            disabled={busy}
          />
          <Input
            label="Correo (usuario de acceso)"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
            disabled={busy || lockCredentials}
            hint={lockCredentials ? "Protegido en versión DEMO" : undefined}
          />
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 sm:p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Seguridad
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input
              label="Contraseña actual"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
              disabled={busy}
              hint={
                lockCredentials
                  ? "Solo para confirmar cambios de nombre"
                  : undefined
              }
            />
            <Input
              label="Nueva contraseña"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              disabled={busy || lockCredentials}
              hint={
                lockCredentials
                  ? "Deshabilitado en versión DEMO"
                  : "Opcional — déjela vacía para no cambiarla"
              }
            />
            <Input
              label="Confirmar nueva"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              disabled={busy || lockCredentials}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={busy} disabled={busy}>
            Guardar cambios
          </Button>
          {(localErr || err) && (
            <p className="text-sm text-danger-600" role="alert">
              {localErr || err}
            </p>
          )}
          {!localErr && !err && msg && (
            <p className="text-sm text-success-700" role="status">
              {msg}
            </p>
          )}
        </div>
      </form>
    </ConfigSection>
  );
}
