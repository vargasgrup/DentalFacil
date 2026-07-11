/**
 * WhatsApp helper utilities.
 *
 * IMPORTANT DESIGN DECISION:
 * This system does NOT use the official WhatsApp Business API.
 * All sending is done via wa.me links that open the user's own WhatsApp
 * (Web or app). WhatsApp does not allow automatic file attachment via link,
 * so the flow compensates with minimal friction:
 *  1. Download the PDF automatically (browser native download)
 *  2. Open wa.me link with pre-written message
 *  3. User manually attaches the downloaded file in the chat (cannot be automated)
 */

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
 * Downloads a PDF from the backend API and opens WhatsApp chat in one action.
 * @param url The backend document download URL
 * @param telefono Patient's phone
 * @param mensaje Pre-written WhatsApp message
 * @param onSent Callback to mark the document as sent via API
 */
export async function downloadAndOpenWhatsApp(
  url: string,
  telefono: string | undefined | null,
  mensaje: string,
  onSent?: () => Promise<void>,
  filenameHint?: string
): Promise<{ success: boolean; error?: string }> {
  // Step A: Download the PDF
  try {
    const token = localStorage.getItem("access_token");
    const resp = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!resp.ok) throw new Error("No se pudo descargar el documento");
    const blob = await resp.blob();

    // Trigger browser download
    const blobUrl = URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = blobUrl;
    a.download = filenameHint || "documento.pdf";
    window.document.body.appendChild(a);
    a.click();
    window.document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch (err: any) {
    return { success: false, error: "Error al descargar: " + err.message };
  }

  // Step B: Open WhatsApp chat
  const waUrl = buildWhatsAppUrl(telefono, mensaje);
  if (!waUrl) {
    return { success: false, error: "El paciente no tiene teléfono válido" };
  }
  window.open(waUrl, "_blank");

  // Step C: Mark as sent in the backend (user clicked the button)
  if (onSent) {
    try {
      await onSent();
    } catch { /* ignore tracking errors */ }
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
    } catch { /* ignore */ }
  }
  return { success: true };
}
