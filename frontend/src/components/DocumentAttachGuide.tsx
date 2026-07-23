"use client";

import { useEffect, useState } from "react";
import { Download, MessageCircle, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { documentSender } from "@/lib/documentSender";
import type { AttachGuidePayload } from "@/lib/documentSender/types";

const EVENT = "dentalfacil:attach-guide";

/**
 * Modal de asistencia cuando wa.me no puede adjuntar el PDF automáticamente.
 * Se abre al caer en el fallback download_fallback.
 */
export function DocumentAttachGuide() {
  const [guide, setGuide] = useState<AttachGuidePayload | null>(null);

  useEffect(() => {
    const onGuide = (e: Event) => {
      const detail = (e as CustomEvent<AttachGuidePayload>).detail;
      if (detail?.pdfObjectUrl && detail?.fileName) {
        setGuide(detail);
      }
    };
    window.addEventListener(EVENT, onGuide);
    return () => window.removeEventListener(EVENT, onGuide);
  }, []);

  if (!guide) return null;

  const close = () => setGuide(null);

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/45 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-labelledby="attach-guide-title"
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <Paperclip className="h-4 w-4" />
            </span>
            <div>
              <h2 id="attach-guide-title" className="text-sm font-semibold text-slate-900">
                Adjuntar PDF en WhatsApp
              </h2>
              <p className="text-xs text-slate-500">
                WhatsApp Desktop/Web no adjunta archivos solos
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ol className="mb-4 space-y-2 text-sm text-slate-700">
          <li className="flex gap-2">
            <span className="font-semibold text-brand-700">1.</span>
            El archivo <strong className="font-medium">{guide.fileName}</strong> ya se
            descargó (carpeta Descargas).
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-brand-700">2.</span>
            En el chat abierto, toca el clip 📎.
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-brand-700">3.</span>
            Elige Documento → selecciona el PDF → Enviar.
          </li>
        </ol>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            className="text-xs"
            icon={<Download className="h-3.5 w-3.5" />}
            onClick={() => {
              const a = document.createElement("a");
              a.href = guide.pdfObjectUrl;
              a.download = guide.fileName;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            }}
          >
            Volver a descargar
          </Button>
          <Button
            type="button"
            variant="primary"
            className="text-xs"
            icon={<MessageCircle className="h-3.5 w-3.5" />}
            onClick={() => documentSender.reopenAttachAssist(guide)}
          >
            Abrir chat otra vez
          </Button>
          <Button type="button" variant="secondary" className="text-xs" onClick={close}>
            Listo
          </Button>
        </div>
      </div>
    </div>
  );
}
