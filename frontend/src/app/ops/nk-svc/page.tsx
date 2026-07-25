"use client";

/**
 * Hidden vendor ops page — not linked from Sidebar, Config, or any product nav.
 * - Renew 12-month preventive maintenance cycle
 * - Rescue locked ADMIN password (break-glass) without clinic login
 * Same fixed provider key for both actions.
 */

import { FormEvent, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/Input";

type Tab = "maintenance" | "rescue";

interface ResetResult {
  maintenance_required: boolean;
  due_at?: string;
  cycle_started_at?: string;
}

interface AdminRow {
  id: string;
  nombre: string;
  email: string;
  activo: boolean;
}

interface RescueResult {
  ok: boolean;
  email: string;
  nombre: string;
  reactivated: boolean;
  message: string;
}

export default function VendorOpsPage() {
  const [tab, setTab] = useState<Tab>("maintenance");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [okMaint, setOkMaint] = useState<ResetResult | null>(null);
  const [okRescue, setOkRescue] = useState<RescueResult | null>(null);

  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [adminEmail, setAdminEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmToken, setConfirmToken] = useState("");

  const clearAlerts = () => {
    setError("");
    setOkMaint(null);
    setOkRescue(null);
  };

  const onRenew = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    clearAlerts();
    try {
      const result = await apiFetch<ResetResult>("/api/system/maintenance/reset", {
        method: "POST",
        body: JSON.stringify({ access_key: key }),
        skipAuth: true,
      });
      setOkMaint(result);
      setKey("");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "No se pudo renovar el ciclo"
      );
    } finally {
      setBusy(false);
    }
  };

  const onListAdmins = async () => {
    setBusy(true);
    clearAlerts();
    try {
      const result = await apiFetch<{ admins: AdminRow[] }>("/api/system/vendor/list-admins", {
        method: "POST",
        body: JSON.stringify({ access_key: key }),
        skipAuth: true,
      });
      setAdmins(result.admins || []);
      if (result.admins?.length === 1) {
        setAdminEmail(result.admins[0].email);
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "No se pudo listar administradores"
      );
    } finally {
      setBusy(false);
    }
  };

  const onRescue = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    clearAlerts();
    try {
      const result = await apiFetch<RescueResult>("/api/system/vendor/rescue-admin-password", {
        method: "POST",
        body: JSON.stringify({
          access_key: key,
          admin_email: adminEmail.trim(),
          new_password: newPassword,
          confirm_password: confirmPassword,
          confirm_token: confirmToken,
        }),
        skipAuth: true,
      });
      setOkRescue(result);
      setNewPassword("");
      setConfirmPassword("");
      setConfirmToken("");
      setKey("");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "No se pudo rescatar la contraseña"
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
          Servicio técnico · N&K
        </p>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">Operaciones de proveedor</h1>
        <p className="mt-2 text-sm text-slate-600">
          Acceso exclusivo del proveedor. No está en el menú de la clínica. Usa la misma clave
          técnica fija del equipo de soporte.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setTab("maintenance");
              clearAlerts();
            }}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
              tab === "maintenance"
                ? "border-brand-600 bg-brand-50 text-brand-800"
                : "border-slate-300 bg-white text-slate-600"
            }`}
          >
            Ciclo mantenimiento
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("rescue");
              clearAlerts();
            }}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
              tab === "rescue"
                ? "border-brand-600 bg-brand-50 text-brand-800"
                : "border-slate-300 bg-white text-slate-600"
            }`}
          >
            Rescate ADMIN
          </button>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700"
          >
            {error}
          </p>
        )}

        {tab === "maintenance" ? (
          <form onSubmit={onRenew} className="mt-5 space-y-3">
            <p className="text-sm text-slate-600">
              Renueva el periodo preventivo de 12 meses tras completar el mantenimiento del
              sistema.
            </p>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Clave de proveedor
              </span>
              <input
                type="password"
                autoComplete="off"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                required
                minLength={8}
              />
            </label>
            {okMaint && (
              <p
                role="status"
                className="rounded-lg border border-success-200 bg-success-50 px-3 py-2 text-sm text-success-800"
              >
                Ciclo renovado. Próximo vencimiento:{" "}
                {okMaint.due_at
                  ? new Date(okMaint.due_at).toLocaleString("es-PE", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    })
                  : "—"}
              </p>
            )}
            <Button type="submit" loading={busy} className="w-full">
              Renovar ciclo (12 meses)
            </Button>
          </form>
        ) : (
          <form onSubmit={onRescue} className="mt-5 space-y-3">
            <p className="text-sm text-slate-600">
              Restablece la contraseña de un ADMIN bloqueado <strong>sin iniciar sesión</strong>.
              Pensado para escritorio local cuando el único administrador olvidó su clave y no hay
              correo configurado.
            </p>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Clave de proveedor
              </span>
              <input
                type="password"
                autoComplete="off"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                required
                minLength={8}
              />
            </label>
            <Button
              type="button"
              variant="secondary"
              loading={busy}
              className="w-full"
              onClick={() => void onListAdmins()}
              disabled={key.trim().length < 8}
            >
              Listar cuentas ADMIN
            </Button>
            {admins.length > 0 && (
              <ul className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm">
                {admins.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      className="w-full rounded px-2 py-1.5 text-left hover:bg-white"
                      onClick={() => setAdminEmail(a.email)}
                    >
                      <span className="font-medium text-slate-800">{a.nombre}</span>
                      <span className="text-slate-500"> · {a.email}</span>
                      {!a.activo && (
                        <span className="ml-1 text-xs text-warning-700">(inactivo)</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Input
              label="Correo del ADMIN"
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              required
              autoComplete="off"
            />
            <Input
              label="Nueva contraseña"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
            <Input
              label="Confirmar contraseña"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
            <Input
              label='Escriba RESCATAR para confirmar'
              value={confirmToken}
              onChange={(e) => setConfirmToken(e.target.value)}
              required
              autoComplete="off"
            />
            {okRescue && (
              <p
                role="status"
                className="rounded-lg border border-success-200 bg-success-50 px-3 py-2 text-sm text-success-800"
              >
                {okRescue.message}
                {okRescue.reactivated ? " (cuenta reactivada)." : ""}
              </p>
            )}
            <Button
              type="submit"
              loading={busy}
              variant="danger"
              className="w-full"
              disabled={confirmToken.trim().toUpperCase() !== "RESCATAR"}
            >
              Restablecer contraseña ADMIN
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
