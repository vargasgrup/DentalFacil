/**
 * WhatsApp helpers (texto / links / apertura Desktop + Web).
 *
 * El envío de PDFs orquesta `@/lib/documentSender`.
 * Los esquemas whatsapp:// y web.whatsapp.com NO adjuntan archivos solos:
 * el PDF se descarga desde Blob (RAM) o se comparte vía Web Share.
 */

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

export type WhatsAppOpenTarget = "desktop" | "web" | "wa_me";

export function buildWhatsAppUrl(
  telefono: string | undefined | null,
  mensaje: string,
  opts?: { preferDeepLink?: boolean; preferWebApp?: boolean }
): string | null {
  const num = normalizePeruPhone(telefono);
  if (!num) return null;
  const text = sanitizeWhatsAppText(mensaje);
  const encoded = encodeURIComponent(text);
  if (opts?.preferDeepLink) {
    return `whatsapp://send?phone=${num}&text=${encoded}`;
  }
  if (opts?.preferWebApp) {
    // WhatsApp Web (Chrome / Edge / Firefox / etc.)
    return `https://web.whatsapp.com/send?phone=${num}&text=${encoded}`;
  }
  return `https://wa.me/${num}?text=${encoded}`;
}

export function isValidPhone(telefono: string | undefined | null): boolean {
  if (!telefono) return false;
  if (normalizePeruPhone(telefono)) return true;
  const num = telefono.replace(/\D/g, "");
  return num.length >= 9;
}

function fireProtocolLink(href: string): void {
  try {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = href;
    document.body.appendChild(iframe);
    window.setTimeout(() => {
      try {
        document.body.removeChild(iframe);
      } catch {
        /* ignore */
      }
    }, 1500);
  } catch {
    /* ignore */
  }
  try {
    const a = document.createElement("a");
    a.href = href;
    a.rel = "noopener noreferrer";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch {
    /* ignore */
  }
}

/**
 * Abre WhatsApp Desktop (protocolo) y/o WhatsApp Web con el chat del paciente.
 * Solo texto — el PDF se adjunta vía Web Share o descarga desde Blob.
 */
export function openWhatsAppChat(
  telefono: string | undefined | null,
  mensaje: string,
  opts?: {
    deepLinkOnly?: boolean;
    /** Abre Desktop + Web (recomendado para documentos sin Cloud API). */
    desktopAndWeb?: boolean;
  }
): { success: boolean; error?: string; opened: WhatsAppOpenTarget[] } {
  const deep = buildWhatsAppUrl(telefono, mensaje, { preferDeepLink: true });
  const webApp = buildWhatsAppUrl(telefono, mensaje, { preferWebApp: true });
  const waMe = buildWhatsAppUrl(telefono, mensaje, { preferDeepLink: false });
  if (!deep && !webApp && !waMe) {
    return { success: false, error: "El paciente no tiene teléfono válido", opened: [] };
  }

  const opened: WhatsAppOpenTarget[] = [];

  // 1) App de escritorio instalada (whatsapp://)
  if (deep) {
    fireProtocolLink(deep);
    opened.push("desktop");
  }

  if (opts?.deepLinkOnly) {
    return { success: opened.length > 0, opened };
  }

  // 2) WhatsApp Web / wa.me — funciona en Chrome, Edge, Firefox, etc.
  const openWeb = () => {
    if (opts?.desktopAndWeb && webApp) {
      window.open(webApp, "_blank", "noopener,noreferrer");
      opened.push("web");
      return;
    }
    if (webApp) {
      window.open(webApp, "_blank", "noopener,noreferrer");
      opened.push("web");
      return;
    }
    if (waMe) {
      window.open(waMe, "_blank", "noopener,noreferrer");
      opened.push("wa_me");
    }
  };

  // Si ya disparamos Desktop, dar un instante al OS; si no, abrir Web al tiro.
  if (deep && (opts?.desktopAndWeb || !opts?.deepLinkOnly)) {
    window.setTimeout(openWeb, opts?.desktopAndWeb ? 450 : 700);
  } else {
    openWeb();
  }

  return { success: true, opened };
}

/** Descarga un Blob PDF en el cliente (sin persistir en el servidor). */
export function downloadPdfBlob(blob: Blob, fileName: string): void {
  // Fire-and-forget wrapper so legacy callers keep working; desktop uses multi-strategy save.
  void import("./downloadBlob").then(({ downloadPdfBlobAsync }) =>
    downloadPdfBlobAsync(blob, fileName)
  );
}

/** Prefer this async API when you need success/failure feedback. */
export async function downloadPdfBlobAsync(
  blob: Blob,
  fileName: string
): Promise<{ ok: boolean; error?: string }> {
  const { downloadPdfBlobAsync: save } = await import("./downloadBlob");
  const res = await save(blob, fileName);
  return res.ok
    ? { ok: true }
    : { ok: false, error: "error" in res ? res.error : "Error al descargar" };
}

/** Intenta copiar el PDF al portapapeles desde un Blob (sigue en RAM; sin Guardar como). */
export async function tryCopyPdfToClipboard(
  blob: Blob,
  fileName = "documento.pdf"
): Promise<boolean> {
  try {
    if (!navigator.clipboard || typeof ClipboardItem === "undefined") return false;
    const pdf =
      blob.type === "application/pdf" ? blob : new Blob([blob], { type: "application/pdf" });
    const name = fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`;
    const file = new File([pdf], name, { type: "application/pdf" });

    const tryWrite = async (item: Record<string, Blob | Promise<Blob>>) => {
      await navigator.clipboard.write([new ClipboardItem(item)]);
    };

    // Variantes: algunos Chromium exigen Promise<Blob> o File tipado.
    try {
      await tryWrite({ "application/pdf": file });
      return true;
    } catch {
      /* continue */
    }
    try {
      await tryWrite({ "application/pdf": Promise.resolve(pdf) });
      return true;
    } catch {
      /* continue */
    }
    await tryWrite({ "application/pdf": pdf });
    return true;
  } catch {
    return false;
  }
}

/**
 * @deprecated Use `documentSender.sendDocument` for PDFs.
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
    error: "Este método está deshabilitado. Usa el envío nativo de documentos.",
  };
}

export async function openWhatsAppText(
  telefono: string | undefined | null,
  mensaje: string,
  onSent?: () => Promise<void>
): Promise<{ success: boolean; error?: string }> {
  const opened = openWhatsAppChat(telefono, sanitizeWhatsAppText(mensaje), {
    desktopAndWeb: true,
  });
  if (!opened.success) return { success: false, error: opened.error };
  if (onSent) {
    try {
      await onSent();
    } catch {
      /* ignore */
    }
  }
  return { success: true };
}
