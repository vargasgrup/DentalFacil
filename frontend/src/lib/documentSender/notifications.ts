/**
 * Notificaciones ligeras para DocumentSender (sin librería externa).
 * DocumentSendToast escucha el evento y muestra toasts.
 */

import type { NotificationType } from "./types";

export interface DocumentToastDetail {
  id: string;
  message: string;
  type: NotificationType;
  progress?: number;
  durationMs?: number;
}

const EVENT = "dentalfacil:document-toast";

export function showDocumentNotification(
  message: string,
  type: NotificationType = "info",
  opts?: { progress?: number; durationMs?: number; id?: string }
): string {
  const id = opts?.id || `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  if (typeof window === "undefined") return id;
  const detail: DocumentToastDetail = {
    id,
    message,
    type,
    progress: opts?.progress,
    durationMs: opts?.durationMs ?? (type === "progress" ? 0 : 4200),
  };
  window.dispatchEvent(new CustomEvent(EVENT, { detail }));
  return id;
}

export function dismissDocumentNotification(id: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(EVENT, {
      detail: { id, message: "", type: "info", durationMs: 0, dismiss: true } as DocumentToastDetail & {
        dismiss?: boolean;
      },
    })
  );
}

export function onDocumentNotification(
  handler: (detail: DocumentToastDetail & { dismiss?: boolean }) => void
): () => void {
  if (typeof window === "undefined") return () => undefined;
  const listener = (e: Event) => {
    handler((e as CustomEvent).detail);
  };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
