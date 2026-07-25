"use client";

/**
 * Hidden vendor ops page — not linked from Sidebar, Config, or any product nav.
 * Only vendor staff with the fixed access key can reset the 12-month cycle.
 * Path is intentionally non-discoverable for clinic users.
 */

import { FormEvent, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/Button";

interface ResetResult {
  maintenance_required: boolean;
  due_at?: string;
  cycle_started_at?: string;
}

export default function VendorMaintenanceOpsPage() {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState<ResetResult | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setOk(null);
    try {
      const result = await apiFetch<ResetResult>("/api/system/maintenance/reset", {
        method: "POST",
        body: JSON.stringify({ access_key: key }),
        skipAuth: true,
      });
      setOk(result);
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
          Servicio técnico
        </p>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">
          Ciclo de mantenimiento
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Acceso exclusivo del proveedor. Renueva el periodo preventivo de 12 meses tras
          completar el mantenimiento del sistema. La única clave válida es la del equipo
          técnico (no hay claves alternativas ni variables de entorno).
        </p>

        <form onSubmit={onSubmit} className="mt-5 space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Clave de mantenimiento
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
          {error && (
            <p role="alert" className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
              {error}
            </p>
          )}
          {ok && (
            <p role="status" className="rounded-lg border border-success-200 bg-success-50 px-3 py-2 text-sm text-success-800">
              Ciclo renovado. Próximo vencimiento:{" "}
              {ok.due_at
                ? new Date(ok.due_at).toLocaleString("es-PE", {
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
      </div>
    </div>
  );
}
