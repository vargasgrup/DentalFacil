/**
 * WhatsApp helpers (texto / links).
 *
 * El envío de PDFs usa `@/lib/documentSender`.
 * wa.me / whatsapp:// NO permiten adjuntar archivos automáticamente.
 */

import { getToken } from "@/lib/api";

/** Límite seguro para query ?text= (evitar mensajes gigantes / base64). */
export const WA_TEXT_MAX = 700;

export function sanitizeWhatsAppText(mensaje: string, maxLen = WA_TEXT_MAX): string {
  let text = (mensaje || "").trim();
  // Bloquear fugas típicas de binario/base64 en el cuerpo del chat
  const compact = text.replace(/\s/g, "");
  if (
    text.length > 400 &&
    compact.length > 200 &&
    /^[A-Za-z0-9+/=]+$/.test(compact.slice(0, 500))
  ) {
    text = "Te compartimos un documento PDF. Adjúntalo en este chat con el clip 📎.";
  }
  if (text.length > maxLen) {
    text = `${text.slice(0, maxLen - 1)}…`;
  }
  return text;
}

export function normalizePeruPhone(telefono: string | undefined | null): string | null {
  if (!telefono) return null;
  let num = telefono.replace(/\D/g, "");
  if (!num) return null;
  if (!num.startsWith("51")) {
    num = "51" + num;
  }
  return num;
}

export function buildWhatsAppUrl(
  telefono: string | undefined | null,
  mensaje: string,
  opts?: { preferDeepLink?: boolean }
): string | null {
  const num = normalizePeruPhone(telefono);
  if (!num) return null;
  const text = sanitizeWhatsAppText(mensaje);
  const encoded = encodeURIComponent(text);
  if (opts?.preferDeepLink) {
    return `whatsapp://send?phone=${num}&text=${encoded}`;
  }
  return `https://wa.me/${num}?text=${encoded}`;
}

export function isValidPhone(telefono: string | undefined | null): boolean {
  if (!telefono) return false;
  const num = telefono.replace(/\D/g, "");
  return num.length >= 6;
}

/**
 * Abre WhatsApp (deep link primero, luego wa.me).
 * Solo texto — el PDF debe adjuntarse aparte o vía Cloud/Web Share.
 */
export function openWhatsAppChat(
  telefono: string | undefined | null,
  mensaje: string
): { success: boolean; error?: string } {
  const deep = buildWhatsAppUrl(telefono, mensaje, { preferDeepLink: true });
  const web = buildWhatsAppUrl(telefono, mensaje, { preferDeepLink: false });
  if (!deep && !web) {
    return { success: false, error: "El paciente no tiene teléfono válido" };
  }
  // Preferir deep link sin navegar fuera de la app (iframe oculto)
  if (deep) {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = deep;
    document.body.appendChild(iframe);
    window.setTimeout(() => {
      try {
        document.body.removeChild(iframe);
      } catch {
        /* ignore */
      }
    }, 1500);
  }
  window.setTimeout(() => {
    if (web) window.open(web, "_blank", "noopener,noreferrer");
  }, deep ? 700 : 0);
  return { success: true };
}

/**
 * @deprecated Prefer `documentSender.sendDocument`.
 */
export async function downloadAndOpenWhatsApp(
  url: string,
  telefono: string | undefined | null,
  mensaje: string,
  onSent?: () => Promise<void>,
  filenameHint?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const token = getToken();
    const resp = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!resp.ok) throw new Error("No se pudo descargar el documento");
    const blob = await resp.blob();

    const blobUrl = URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = blobUrl;
    a.download = filenameHint || "documento.pdf";
    window.document.body.appendChild(a);
    a.click();
    window.document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: "Error al descargar: " + msg };
  }

  const opened = openWhatsAppChat(telefono, sanitizeWhatsAppText(mensaje));
  if (!opened.success) return opened;

  if (onSent) {
    try {
      await onSent();
    } catch {
      /* ignore */
    }
  }
  return { success: true };
}

export async function openWhatsAppText(
  telefono: string | undefined | null,
  mensaje: string,
  onSent?: () => Promise<void>
): Promise<{ success: boolean; error?: string }> {
  const opened = openWhatsAppChat(telefono, sanitizeWhatsAppText(mensaje));
  if (!opened.success) return opened;
  if (onSent) {
    try {
      await onSent();
    } catch {
      /* ignore */
    }
  }
  return { success: true };
}
