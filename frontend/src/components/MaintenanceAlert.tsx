"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";

interface MaintenanceStatus {
  maintenance_required: boolean;
  due_at?: string;
  title?: string | null;
  message?: string | null;
}

const SESSION_ACK_PREFIX = "nk_maint_ack:";

function ackKey(dueAt: string | undefined): string {
  return `${SESSION_ACK_PREFIX}${dueAt || "due"}`;
}

/**
 * Background 12-month preventive cycle alert.
 * No config/menu entry — only surfaces when maintenance is due.
 */
export function MaintenanceAlert() {
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<MaintenanceStatus | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setStatus(null);
      setOpen(false);
      return;
    }
    try {
      const s = await apiFetch<MaintenanceStatus>("/api/system/maintenance/status");
      setStatus(s);
      if (s.maintenance_required) {
        const dismissed =
          typeof window !== "undefined" &&
          sessionStorage.getItem(ackKey(s.due_at)) === "1";
        setOpen(!dismissed);
      } else {
        setOpen(false);
      }
    } catch {
      /* silent — never block clinic UI on status failure */
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    void load();
    const id = window.setInterval(() => void load(), 15 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [authLoading, load]);

  if (!open || !status?.maintenance_required) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(ackKey(status.due_at), "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="maint-title"
      aria-describedby="maint-desc"
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <button
          type="button"
          onClick={dismiss}
          className="absolute right-3 top-3 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Cerrar aviso"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
            <AlertTriangle className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 space-y-2 pr-6">
            <h2 id="maint-title" className="text-lg font-semibold text-slate-900">
              {status.title || "Mantenimiento del sistema requerido"}
            </h2>
            <p
              id="maint-desc"
              className="whitespace-pre-line text-sm leading-relaxed text-slate-600"
            >
              {status.message}
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <Button type="button" variant="primary" onClick={dismiss}>
            Entendido
          </Button>
        </div>
      </div>
    </div>
  );
}
