"use client";

import { useEffect, useState } from "react";
import { Shield, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { apiFetch, clearRefreshToken, clearToken, getRefreshToken } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  LOCAL_STORAGE_UI_KEYS,
  clearLocalUiData,
  clearOfflineOps,
  countOfflineOps,
} from "@/lib/offlineQueue";
import { useConnection } from "@/lib/connectionStatus";
import { formatDateTime } from "@/lib/datetime";
import { useOfflineSync } from "@/lib/offlineSync";

/**
 * Privacidad y sesión local (Fase 5 / Bloque D).
 * Gap backend documentado: no hay listado de dispositivos remotos ni ARCO.
 */
export function PrivacySessionPanel() {
  const { user, logout } = useAuth();
  const { status, lastOkAt } = useConnection();
  const { pending, syncing, syncNow } = useOfflineSync();
  const [queueCount, setQueueCount] = useState(0);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void countOfflineOps().then(setQueueCount);
  }, [pending]);

  const logoutAll = async () => {
    setBusy(true);
    setMsg("");
    try {
      await apiFetch("/api/auth/logout-all", { method: "POST", body: "{}" });
      clearToken();
      clearRefreshToken();
      logout();
      setMsg("Sesiones invalidadas. Inicie sesión de nuevo.");
      if (typeof window !== "undefined") window.location.href = "/";
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudo cerrar todas las sesiones");
    } finally {
      setBusy(false);
    }
  };

  const clearLocal = async () => {
    setBusy(true);
    try {
      clearLocalUiData();
      await clearOfflineOps();
      setQueueCount(0);
      setMsg(
        "Preferencias de UI y cola offline locales borradas en este equipo. Recargue la página."
      );
    } catch {
      setMsg("No se pudo limpiar todos los datos locales.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card sm:p-5">
        <div className="mb-3 flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800">
              Privacidad y sesión
            </h3>
            <p className="mt-0.5 text-help text-slate-500">
              Controles locales de este equipo. El sistema aún no implementa
              endpoints ARCO de Ley 29733 (gap documentado).
            </p>
          </div>
        </div>

        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="rounded-lg bg-surface-subtle px-3 py-2">
            <dt className="text-help text-slate-500">Usuario</dt>
            <dd className="font-medium text-slate-800">
              {user?.nombre} ({user?.username})
            </dd>
          </div>
          <div className="rounded-lg bg-surface-subtle px-3 py-2">
            <dt className="text-help text-slate-500">Rol</dt>
            <dd className="font-medium text-slate-800">{user?.rol || "—"}</dd>
          </div>
          <div className="rounded-lg bg-surface-subtle px-3 py-2">
            <dt className="text-help text-slate-500">Servidor</dt>
            <dd className="font-medium text-slate-800">
              {status === "online"
                ? "En línea"
                : status === "checking"
                  ? "Comprobando…"
                  : "Sin conexión"}
            </dd>
          </div>
          <div className="rounded-lg bg-surface-subtle px-3 py-2">
            <dt className="text-help text-slate-500">Última conexión OK</dt>
            <dd className="font-medium text-slate-800">
              {lastOkAt
                ? formatDateTime(lastOkAt)
                : "—"}
            </dd>
          </div>
          <div className="rounded-lg bg-surface-subtle px-3 py-2 sm:col-span-2">
            <dt className="text-help text-slate-500">Navegador / agente</dt>
            <dd className="break-all text-xs text-slate-700">
              {typeof navigator !== "undefined" ? navigator.userAgent : "—"}
            </dd>
          </div>
        </dl>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="danger"
            loading={busy}
            onClick={() => void logoutAll()}
          >
            Cerrar sesión en todos los dispositivos
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              clearToken();
              clearRefreshToken();
              logout();
              if (typeof window !== "undefined") window.location.href = "/";
            }}
          >
            Cerrar solo este equipo
          </Button>
        </div>
        {!getRefreshToken() && (
          <p className="mt-2 text-help text-slate-400">
            No hay refresh token guardado en este equipo.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card sm:p-5">
        <h3 className="text-sm font-semibold text-slate-800">
          Datos guardados en este equipo
        </h3>
        <p className="mt-1 text-help text-slate-500">
          Preferencias de UI, atajos, frecuencia de tratamientos y cola offline
          (pacientes/evolución). Los movimientos de <strong>Caja no se
          almacenan offline</strong> por integridad financiera.
        </p>
        <ul className="mt-2 list-inside list-disc text-xs text-slate-600">
          {LOCAL_STORAGE_UI_KEYS.map((k) => (
            <li key={k}>
              <code>{k}</code>
            </li>
          ))}
          <li>
            IndexedDB <code>nk-ds-offline</code> · cola: {queueCount} pendiente
            {queueCount === 1 ? "" : "s"}
          </li>
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            loading={syncing}
            disabled={queueCount === 0}
            onClick={() => void syncNow()}
          >
            Sincronizar cola ahora
          </Button>
          <Button
            type="button"
            variant="ghost"
            loading={busy}
            icon={<Trash2 className="h-4 w-4" />}
            onClick={() => void clearLocal()}
          >
            Limpiar datos locales de UI
          </Button>
        </div>
      </div>

      {msg && (
        <p className="rounded-lg border border-slate-200 bg-surface-subtle px-3 py-2 text-sm text-slate-700">
          {msg}
        </p>
      )}

      <p className="text-help text-slate-400">
        Gap backend: listado de sesiones activas por dispositivo y ejercicio
        ARCO (acceso/rectificación/cancelación/oposición) pendiente de diseño
        formal.
      </p>
    </div>
  );
}
