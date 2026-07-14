"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Download,
  MessageCircle,
  Check,
  PhoneOff,
  Eye,
  Printer,
  X,
} from "lucide-react";
import { Button } from "./ui/Button";
import { downloadAndOpenWhatsApp, isValidPhone } from "@/lib/whatsapp";
import { apiFetch, getToken } from "@/lib/api";
import {
  getSavedPrintFormat,
  printPdfBlob,
  resetPrintFormatPrefsIfNeeded,
  savePrintFormat,
  type PrintFormatHint,
} from "@/lib/printPdf";

type PrintFormat = PrintFormatHint;

interface DocumentActionsProps {
  /** Document type for display label */
  label: string;
  /** Backend URL to download the PDF (without format query param, or with other params) */
  downloadUrl: string;
  /** Patient's phone for WhatsApp */
  telefono?: string | null;
  /** Pre-written WhatsApp message */
  mensaje: string;
  /** Optional callback URL to mark the document as sent via WhatsApp */
  markSentUrl?: string;
  /** Whether to show format selector (default true) */
  showFormat?: boolean;
  /** Compact mode: icon buttons for tables */
  compact?: boolean;
  /** Hide WhatsApp (e.g. reports / cierre) */
  hideWhatsApp?: boolean;
  /** Hide Previsualizar */
  hidePreview?: boolean;
  /** Hide Descargar */
  hideDownload?: boolean;
  /** Run before preview/print/download (e.g. save form) */
  onBeforeFetch?: () => Promise<void>;
  /** Preferred format when no localStorage preference */
  defaultFormat?: PrintFormat;
  /** Lock to a single format (official Caja ticket = 80mm) */
  forceFormat?: PrintFormat;
  /** Open preview modal automatically on mount */
  autoOpenPreview?: boolean;
  /** Trigger print automatically on mount */
  autoPrint?: boolean;
  /** Trigger WhatsApp send automatically on mount */
  autoWhatsApp?: boolean;
}

const FORMAT_LABELS: Record<PrintFormat, string> = {
  "80mm": "Ticket",
  A5: "A5",
  A4: "A4",
};

function withFormat(url: string, format: PrintFormat): string {
  const sep = url.includes("?") ? "&" : "?";
  if (/[?&]fmt=/.test(url)) {
    return url.replace(/([?&]fmt=)[^&]*/, `$1${format}`);
  }
  return `${url}${sep}fmt=${format}`;
}

async function fetchPdfBlob(url: string): Promise<{ blob: Blob; filename: string }> {
  const token = getToken();
  const resp = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!resp.ok) throw new Error("Error al obtener el documento");
  const blob = await resp.blob();
  const filename =
    resp.headers.get("Content-Disposition")?.split('filename="')[1]?.replace('"', "") ||
    "documento.pdf";
  return { blob, filename };
}

function asPdfBlob(blob: Blob): Blob {
  return blob.type === "application/pdf"
    ? blob
    : new Blob([blob], { type: "application/pdf" });
}

/**
 * Acciones de documento: formato, previsualizar, imprimir, descargar, WhatsApp.
 * La impresión NO usa el visor PDF del navegador (evita escala/márgenes incorrectos).
 */
export function DocumentActions({
  label,
  downloadUrl,
  telefono,
  mensaje,
  markSentUrl,
  showFormat = true,
  compact = false,
  hideWhatsApp = false,
  hidePreview = false,
  hideDownload = false,
  onBeforeFetch,
  defaultFormat = "A5",
  forceFormat,
  autoOpenPreview = false,
  autoPrint = false,
  autoWhatsApp = false,
}: DocumentActionsProps) {
  const [format, setFormat] = useState<PrintFormat>(forceFormat || defaultFormat);
  const [busy, setBusy] = useState<"preview" | "print" | "download" | "wa" | null>(null);
  const [sent, setSent] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [formatReady, setFormatReady] = useState(false);

  useEffect(() => {
    resetPrintFormatPrefsIfNeeded();
    if (forceFormat) {
      setFormat(forceFormat);
      setFormatReady(true);
      return;
    }
    setFormat(getSavedPrintFormat(defaultFormat));
    setFormatReady(true);
  }, [defaultFormat, forceFormat]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const onFormatChange = (f: PrintFormat) => {
    if (forceFormat) return;
    setFormat(f);
    savePrintFormat(f);
  };

  const fullUrl = withFormat(downloadUrl, format);
  const hasPhone = isValidPhone(telefono);

  const closePreview = useCallback(() => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPreviewBlob(null);
    setPreviewError(null);
  }, []);

  const prepareFetch = async () => {
    if (onBeforeFetch) await onBeforeFetch();
  };

  const openPreviewFromUrl = useCallback(async (url: string) => {
    setBusy("preview");
    setPreviewError(null);
    try {
      if (onBeforeFetch) await onBeforeFetch();
      const { blob } = await fetchPdfBlob(url);
      const pdfBlob = asPdfBlob(blob);
      const objectUrl = URL.createObjectURL(pdfBlob);
      setPreviewBlob(pdfBlob);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return objectUrl;
      });
    } catch {
      setPreviewError("No se pudo cargar la previsualización");
      alert("Error al previsualizar el documento");
    } finally {
      setBusy(null);
    }
  }, [onBeforeFetch]);

  const handlePreview = async () => {
    await openPreviewFromUrl(fullUrl);
  };

  const handlePrint = async (fromPreview?: boolean) => {
    setBusy("print");
    try {
      let blob: Blob;
      if (fromPreview && previewBlob) {
        blob = previewBlob;
      } else {
        await prepareFetch();
        const fetched = await fetchPdfBlob(fullUrl);
        blob = asPdfBlob(fetched.blob);
      }
      await printPdfBlob(blob, { title: label, formatHint: format });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al imprimir el documento";
      alert(msg);
    } finally {
      setBusy(null);
    }
  };

  const handleDownload = async () => {
    setBusy("download");
    try {
      await prepareFetch();
      const { blob, filename } = await fetchPdfBlob(fullUrl);
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      alert("Error al descargar el documento");
    } finally {
      setBusy(null);
    }
  };

  const handleWhatsApp = async () => {
    setBusy("wa");
    setShowHint(true);
    try {
      await prepareFetch();
    } catch {
      setBusy(null);
      return;
    }
    const result = await downloadAndOpenWhatsApp(
      fullUrl,
      telefono,
      mensaje,
      markSentUrl
        ? async () => {
            await apiFetch(markSentUrl, { method: "POST" });
          }
        : undefined
    );
    if (result.success) {
      setSent(true);
    } else {
      alert(result.error || "Error al enviar");
    }
    setBusy(null);
  };

  useEffect(() => {
    if (!formatReady) return;
    if (autoOpenPreview) {
      void openPreviewFromUrl(withFormat(downloadUrl, format));
      return;
    }
    if (autoPrint) {
      void handlePrint();
      return;
    }
    if (autoWhatsApp) {
      void handleWhatsApp();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenPreview, autoPrint, autoWhatsApp, formatReady, downloadUrl]);

  const btnClass = compact ? "text-xs px-2" : "text-xs";

  return (
    <>
      <div className={`flex flex-wrap items-center gap-2 ${compact ? "justify-end" : ""}`}>
        {showFormat && (
          forceFormat ? (
            <span
              className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700"
              title="Formato oficial de caja: ticket térmico 80mm"
            >
              {FORMAT_LABELS[forceFormat]} 80mm
            </span>
          ) : compact ? (
            <select
              value={format}
              onChange={(e) => onFormatChange(e.target.value as PrintFormat)}
              className="rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-600"
              title="Formato de impresión"
              aria-label="Formato"
            >
              <option value="80mm">Ticket</option>
              <option value="A5">A5</option>
              <option value="A4">A4</option>
            </select>
          ) : (
            <div className="flex rounded-lg bg-slate-100 p-0.5" role="group" aria-label="Formato">
              {(["80mm", "A5", "A4"] as PrintFormat[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => onFormatChange(f)}
                  className={`rounded px-2 py-1 text-xs transition-smooth ${
                    format === f ? "bg-white font-medium shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                  title={
                    f === "80mm"
                      ? "Ticket / tiquetera térmica"
                      : f === "A5"
                        ? "Media página"
                        : "Página completa"
                  }
                >
                  {FORMAT_LABELS[f]}
                </button>
              ))}
            </div>
          )
        )}

        {!hidePreview && (
          <Button
            variant="secondary"
            onClick={() => void handlePreview()}
            loading={busy === "preview"}
            icon={busy !== "preview" ? <Eye className="h-3.5 w-3.5" /> : undefined}
            className={btnClass}
            title={`Previsualizar ${label}`}
          >
            {compact ? "Ver" : "Previsualizar"}
          </Button>
        )}

        <Button
          variant="secondary"
          onClick={() => void handlePrint(false)}
          loading={busy === "print"}
          icon={busy !== "print" ? <Printer className="h-3.5 w-3.5" /> : undefined}
          className={btnClass}
          title={`Imprimir ${label}`}
        >
          {compact ? null : "Imprimir"}
        </Button>

        {!hideDownload && (
          <Button
            variant="secondary"
            onClick={() => void handleDownload()}
            loading={busy === "download"}
            icon={busy !== "download" ? <Download className="h-3.5 w-3.5" /> : undefined}
            className={btnClass}
            title={`Descargar ${label}`}
          >
            {compact ? null : "Descargar"}
          </Button>
        )}

        {!hideWhatsApp &&
          (hasPhone ? (
            <Button
              variant="primary"
              onClick={() => void handleWhatsApp()}
              disabled={sent}
              loading={busy === "wa"}
              icon={
                sent ? (
                  <Check className="h-3.5 w-3.5" />
                ) : busy !== "wa" ? (
                  <MessageCircle className="h-3.5 w-3.5" />
                ) : undefined
              }
              className={btnClass}
              title="Enviar por WhatsApp"
            >
              {compact ? null : sent ? "Enviado" : "WhatsApp"}
            </Button>
          ) : compact ? (
            <span
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400"
              title="Completa el teléfono del paciente para enviar por WhatsApp"
            >
              <PhoneOff className="h-4 w-4" />
            </span>
          ) : telefono !== undefined ? (
            <span className="text-xs text-slate-400" title="El paciente no tiene teléfono registrado">
              Sin teléfono
            </span>
          ) : null)}

        {showHint && sent && !compact && (
          <span className="text-xs text-success-600">
            PDF descargado. Adjúntalo en el chat de WhatsApp que se abrió y envíalo.
          </span>
        )}
        {!hasPhone && !compact && !hideWhatsApp && telefono !== undefined && (
          <span className="text-xs text-warning-600">
            Completa el teléfono del paciente para enviar por WhatsApp
          </span>
        )}
      </div>

      {(previewUrl || previewError) && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3 sm:p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) closePreview();
          }}
        >
          <div
            role="dialog"
            aria-label={`Previsualización: ${label}`}
            className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{label}</h3>
                <p className="text-xs text-slate-500">
                  Formato: {FORMAT_LABELS[format]} · Vista previa (la impresión usa tamaño real del PDF)
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  className="text-xs"
                  icon={<Printer className="h-3.5 w-3.5" />}
                  onClick={() => void handlePrint(true)}
                  loading={busy === "print"}
                >
                  Imprimir
                </Button>
                {!hideDownload && (
                  <Button
                    variant="secondary"
                    className="text-xs"
                    icon={<Download className="h-3.5 w-3.5" />}
                    onClick={() => void handleDownload()}
                    loading={busy === "download"}
                  >
                    Descargar
                  </Button>
                )}
                <button
                  type="button"
                  onClick={closePreview}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                  aria-label="Cerrar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 bg-slate-100">
              {previewError ? (
                <p className="p-6 text-center text-sm text-red-600">{previewError}</p>
              ) : previewUrl ? (
                <iframe
                  title={`Vista previa ${label}`}
                  src={`${previewUrl}#view=FitH`}
                  className="h-full w-full border-0"
                />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
