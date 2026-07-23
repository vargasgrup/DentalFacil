"use client";

import type { ReactNode } from "react";
import { MessageCircle, Check, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useDocumentSender } from "@/hooks/useDocumentSender";
import { isValidPhone } from "@/lib/whatsapp";
import { apiFetch } from "@/lib/api";
import type { DocumentType, SendDocumentResult } from "@/lib/documentSender";

export interface ShareDocumentButtonProps {
  documentType?: DocumentType;
  /** URL del backend que genera el PDF (en RAM en el servidor). */
  downloadUrl: string;
  fileName?: string;
  message?: string;
  phoneNumber?: string | null;
  metadata?: Record<string, unknown>;
  /** Marca el documento como enviado en backend tras éxito. */
  markSentUrl?: string;
  children?: ReactNode;
  onSuccess?: (result: SendDocumentResult) => void;
  onError?: (error: string) => void;
  className?: string;
  disabled?: boolean;
  compact?: boolean;
  /** Si true, oculta el botón cuando no hay teléfono. */
  requirePhone?: boolean;
}

/**
 * Botón reutilizable — flujo nativo:
 * Cloud API (/share) → reintentos (/send-document) → Web Share (selector SO).
 */
export function ShareDocumentButton({
  documentType = "documento",
  downloadUrl,
  fileName,
  message = "",
  phoneNumber,
  metadata,
  markSentUrl,
  children,
  onSuccess,
  onError,
  className,
  disabled,
  compact = false,
  requirePhone = true,
}: ShareDocumentButtonProps) {
  const { sendDocument, isSending, lastResult } = useDocumentSender();
  const hasPhone = isValidPhone(phoneNumber);
  const sent = Boolean(lastResult?.success);

  if (requirePhone && phoneNumber !== undefined && !hasPhone) {
    return compact ? (
      <span
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400"
        title="Completa el teléfono del paciente para enviar por WhatsApp"
      >
        <PhoneOff className="h-4 w-4" />
      </span>
    ) : (
      <span className="text-xs text-slate-400">Sin teléfono</span>
    );
  }

  const handleClick = async () => {
    const result = await sendDocument({
      downloadUrl,
      documentType,
      fileName,
      message,
      phoneNumber,
      metadata,
      onMarkedSent: markSentUrl
        ? async () => {
            await apiFetch(markSentUrl, { method: "POST" });
          }
        : undefined,
    });
    if (result.success) onSuccess?.(result);
    else onError?.(result.error || "Error al enviar");
  };

  return (
    <Button
      type="button"
      variant="primary"
      className={`share-document-btn ${className || ""} ${compact ? "text-xs px-2" : "text-xs"}`}
      disabled={disabled || isSending || (sent && lastResult?.cloud_api_sent)}
      loading={isSending}
      onClick={() => void handleClick()}
      icon={
        sent && !isSending ? (
          <Check className="h-3.5 w-3.5" />
        ) : !isSending ? (
          <MessageCircle className="h-3.5 w-3.5" />
        ) : undefined
      }
      aria-label="Enviar documento por WhatsApp"
      title="Enviar por WhatsApp (Cloud API → reintento → compartir)"
    >
      {children ?? (compact ? null : sent ? "Enviado" : "WhatsApp")}
    </Button>
  );
}
