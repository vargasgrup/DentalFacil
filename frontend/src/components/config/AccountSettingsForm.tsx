"use client";

import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/Input";

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
  onSubmit: (values: AccountFormValues) => Promise<void> | void;
}

export function AccountSettingsForm({
  initialNombre,
  initialEmail,
  busy = false,
  msg,
  err,
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
    const nextEmail = email.trim().toLowerCase();
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
    const emailChanged = nextEmail !== initialEmail.trim().toLowerCase();
    const pwdChanged = Boolean(newPassword || confirmPassword);

    if (!nombreChanged && !emailChanged && !pwdChanged) {
      setLocalErr("No hay cambios que guardar.");
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
    <Card>
      <div className="mb-1 flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
          <KeyRound className="h-4 w-4" aria-hidden />
        </span>
        <div>
          <h2 className="text-section-title text-slate-700">Mi cuenta</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Actualice su nombre, correo de acceso o contraseña. Siempre confirme con la
            contraseña actual.
          </p>
        </div>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="mt-5 space-y-4">
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
            disabled={busy}
          />        </div>

        <div className="rounded-xl border border-slate-200 bg-surface-subtle/50 p-3 sm:p-4">
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
            />
            <Input
              label="Nueva contraseña"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              disabled={busy}
              hint="Opcional — déjela vacía para no cambiarla"
            />
            <Input
              label="Confirmar nueva"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              disabled={busy}
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
    </Card>
  );
}
