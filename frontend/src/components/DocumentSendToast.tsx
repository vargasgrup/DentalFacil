"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, Info, X, Loader2 } from "lucide-react";
import {
  onDocumentNotification,
  type DocumentToastDetail,
} from "@/lib/documentSender/notifications";

type ToastItem = DocumentToastDetail & { dismiss?: boolean };

const ICONS = {
  success: CheckCircle2,
  error: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
  progress: Loader2,
} as const;

const STYLES: Record<string, string> = {
  success: "border-success-200 bg-success-50 text-success-800",
  error: "border-danger-200 bg-danger-50 text-danger-700",
  warning: "border-warning-200 bg-warning-50 text-warning-800",
  info: "border-slate-200 bg-white text-slate-700",
  progress: "border-brand-200 bg-white text-slate-700",
};

export function DocumentSendToast() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    return onDocumentNotification((detail) => {
      if ((detail as ToastItem).dismiss) {
        setItems((prev) => prev.filter((t) => t.id !== detail.id));
        return;
      }
      setItems((prev) => {
        const without = prev.filter((t) => t.id !== detail.id);
        return [...without, detail].slice(-4);
      });
      if (detail.type !== "progress" && (detail.durationMs ?? 4200) > 0) {
        window.setTimeout(() => {
          setItems((prev) => prev.filter((t) => t.id !== detail.id));
        }, detail.durationMs ?? 4200);
      }
    });
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-[min(100vw-2rem,22rem)] flex-col gap-2"
      aria-live="polite"
      role="status"
    >
      {items.map((item) => {
        const Icon = ICONS[item.type] || Info;
        return (
          <div
            key={item.id}
            className={`pointer-events-auto share-toast rounded-xl border px-3 py-2.5 shadow-lg ${STYLES[item.type] || STYLES.info}`}
          >
            <div className="flex items-start gap-2">
              <Icon
                className={`mt-0.5 h-4 w-4 shrink-0 ${
                  item.type === "progress" ? "animate-spin text-brand-600" : ""
                }`}
              />
              <p className="flex-1 text-sm leading-snug">{item.message}</p>
              <button
                type="button"
                className="rounded p-0.5 text-current/60 hover:bg-black/5"
                aria-label="Cerrar notificación"
                onClick={() => setItems((prev) => prev.filter((t) => t.id !== item.id))}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {typeof item.progress === "number" && (
              <div className="share-progress mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200/80">
                <div
                  className="share-progress-fill h-full rounded-full bg-brand-600 transition-all duration-300"
                  style={{ width: `${Math.max(0, Math.min(100, item.progress))}%` }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
