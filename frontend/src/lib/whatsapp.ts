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
    text = "Te compartimos un documento PDF.";
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
  // Quitar 00 internacional
  if (num.startsWith("00")) num = num.slice(2);
  // Celulares PE a veces guardados como 09xxxxxxxx
  if (num.length === 10 && num.startsWith("09")) num = num.slice(1);
  if (!num.startsWith("51")) {
    // 9 dígitos (móvil PE) u 8–9 locales → prefijo país
    if (num.length >= 8 && num.length <= 9) {
      num = "51" + num;
    }
  }
  // Debe quedar al menos país + abonado razonable
  if (num.length < 11) return null;
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
  if (normalizePeruPhone(telefono)) return true;
  const num = telefono.replace(/\D/g, "");
  return num.length >= 9;
}

/**
 * Abre WhatsApp (deep link primero, luego wa.me).
 * Solo texto — el PDF debe adjuntarse aparte o vía Cloud/Web Share.
 */
export function openWhatsAppChat(
  telefono: string | undefined | null,
  mensaje: string,
  opts?: { deepLinkOnly?: boolean }
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
    // También intentar location-style deep link (WebView2 / algunos desktop)
    try {
      const a = document.createElement("a");
      a.href = deep;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      /* ignore */
    }
  }
  if (!opts?.deepLinkOnly) {
    window.setTimeout(() => {
      if (web) window.open(web, "_blank", "noopener,noreferrer");
    }, deep ? 700 : 0);
  }
  return { success: true };
}

/**
 * @deprecated Removed — use `documentSender.sendDocument` for PDFs.
 * Opening wa.me for PDF documents is forbidden by product rules.
 */
export async function downloadAndOpenWhatsApp(
  _url: string,
  _telefono: string | undefined | null,
  _mensaje: string,
  _onSent?: () => Promise<void>,
  _filenameHint?: string
): Promise<{ success: boolean; error?: string }> {
  return {
    success: false,
    error:
      "Este método está deshabilitado. Usa el envío nativo de documentos (Cloud API / Web Share).",
  };
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
