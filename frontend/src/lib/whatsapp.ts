/**
 * WhatsApp helpers (texto / links).
 *
 * El envío de documentos PDF usa el Sistema Universal:
 * `@/lib/documentSender` → Cloud API (backend) → Web Share → descarga + wa.me.
 *
 * Estas utilidades solo construyen URLs wa.me y validan teléfonos.
 * WhatsApp no permite adjuntar archivos automáticamente vía link.
 */

import { getToken } from "@/lib/api";

export function buildWhatsAppUrl(telefono: string | undefined | null, mensaje: string): string | null {
  if (!telefono) return null;
  let num = telefono.replace(/\D/g, "");
  if (!num) return null;
  // Ensure Peru country code (51) if not present
  if (!num.startsWith("51")) {
    num = "51" + num;
  }
  return `https://wa.me/${num}?text=${encodeURIComponent(mensaje)}`;
}

export function isValidPhone(telefono: string | undefined | null): boolean {
  if (!telefono) return false;
  const num = telefono.replace(/\D/g, "");
  return num.length >= 6;
}

/**
 * @deprecated Prefer `documentSender.sendDocument` / ShareDocumentButton.
 * Kept for text-only flows and legacy callers.
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

  const waUrl = buildWhatsAppUrl(telefono, mensaje);
  if (!waUrl) {
    return { success: false, error: "El paciente no tiene teléfono válido" };
  }
  window.open(waUrl, "_blank");

  if (onSent) {
    try {
      await onSent();
    } catch {
      /* ignore tracking errors */
    }
  }

  return { success: true };
}

/**
 * Opens WhatsApp with a text-only message (for reminders, no file download).
 */
export async function openWhatsAppText(
  telefono: string | undefined | null,
  mensaje: string,
  onSent?: () => Promise<void>,
): Promise<{ success: boolean; error?: string }> {
  const waUrl = buildWhatsAppUrl(telefono, mensaje);
  if (!waUrl) {
    return { success: false, error: "El paciente no tiene teléfono válido" };
  }
  window.open(waUrl, "_blank");
  if (onSent) {
    try {
      await onSent();
    } catch {
      /* ignore */
    }
  }
  return { success: true };
}
