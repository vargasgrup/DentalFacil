/**
 * Universal client-side file download / save.
 *
 * Desktop WebView2 + pywebview routinely ignore `<a download href=blob:>`
 * (no Downloads UI), so the clinic shell needs a multi-strategy saver.
 *
 * Order:
 * 1. Chromium File System Access (`showSaveFilePicker`) — native Save dialog
 * 2. pywebview JS API `save_file` — native Save dialog on Server desktop host
 * 3. Legacy Edge `msSaveOrOpenBlob`
 * 4. `<a download>` (browsers / Client LAN)
 * 5. Open blob URL in a new browsing context (user can Save As)
 */

import { isClinicDesktopHost } from "./desktopViewport";

export type SaveBlobResult =
  | { ok: true; method: string; path?: string; cancelled?: boolean }
  | { ok: false; method: string; error: string };

function safeFileName(name: string, fallback = "documento"): string {
  const raw = (name || fallback).trim() || fallback;
  return raw
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 180);
}

function ensureMime(blob: Blob, fileName: string): Blob {
  if (blob.type && blob.type !== "application/octet-stream") return blob;
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) {
    return new Blob([blob], { type: "application/pdf" });
  }
  if (lower.endsWith(".csv")) {
    return new Blob([blob], { type: "text/csv;charset=utf-8" });
  }
  if (lower.endsWith(".zip")) {
    return new Blob([blob], { type: "application/zip" });
  }
  if (/\.(png|jpe?g|gif|webp|bmp|tif{1,2})$/i.test(lower)) {
    return blob;
  }
  return blob;
}

function guessAcceptTypes(fileName: string):
  | { description: string; accept: Record<string, string[]> }[]
  | undefined {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) {
    return [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }];
  }
  if (lower.endsWith(".csv")) {
    return [{ description: "CSV", accept: { "text/csv": [".csv"] } }];
  }
  if (lower.endsWith(".zip")) {
    return [{ description: "ZIP", accept: { "application/zip": [".zip"] } }];
  }
  if (/\.(png|jpe?g|gif|webp)$/i.test(lower)) {
    return [
      {
        description: "Imagen",
        accept: { "image/*": [".png", ".jpg", ".jpeg", ".gif", ".webp"] },
      },
    ];
  }
  return undefined;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode.apply(null, Array.from(slice));
  }
  return btoa(binary);
}

type PyApi = {
  save_file?: (
    filename: string,
    content_b64: string
  ) => Promise<{ ok?: boolean; cancelled?: boolean; path?: string; error?: string } | boolean>;
};

function getPywebviewApi(): PyApi | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    pywebview?: { api?: PyApi };
  };
  return w.pywebview?.api ?? null;
}

async function waitForPywebviewApi(timeoutMs = 2500): Promise<PyApi | null> {
  const existing = getPywebviewApi();
  if (existing?.save_file) return existing;
  if (typeof window === "undefined") return null;
  if (!isClinicDesktopHost() && !(window as Window & { pywebview?: unknown }).pywebview) {
    return null;
  }
  return new Promise((resolve) => {
    const start = Date.now();
    const done = (api: PyApi | null) => {
      window.removeEventListener("pywebviewready", onReady);
      resolve(api);
    };
    const onReady = () => {
      const api = getPywebviewApi();
      if (api?.save_file) done(api);
    };
    window.addEventListener("pywebviewready", onReady);
    const tick = () => {
      const api = getPywebviewApi();
      if (api?.save_file) {
        done(api);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        done(null);
        return;
      }
      window.setTimeout(tick, 80);
    };
    tick();
  });
}

async function saveWithFilePicker(blob: Blob, fileName: string): Promise<SaveBlobResult | null> {
  const w = window as Window & {
    showSaveFilePicker?: (opts: {
      suggestedName?: string;
      types?: { description: string; accept: Record<string, string[]> }[];
    }) => Promise<{
      createWritable: () => Promise<{
        write: (data: Blob) => Promise<void>;
        close: () => Promise<void>;
      }>;
    }>;
  };
  if (typeof w.showSaveFilePicker !== "function") return null;
  try {
    const handle = await w.showSaveFilePicker({
      suggestedName: fileName,
      types: guessAcceptTypes(fileName),
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return { ok: true, method: "showSaveFilePicker" };
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    if (name === "AbortError") {
      return { ok: true, method: "showSaveFilePicker", cancelled: true };
    }
    // Permission / unsupported — fall through
    return null;
  }
}

async function saveWithPywebview(blob: Blob, fileName: string): Promise<SaveBlobResult | null> {
  const api = await waitForPywebviewApi();
  if (!api?.save_file) return null;
  try {
    const b64 = await blobToBase64(blob);
    const res = await api.save_file(fileName, b64);
    if (res === true) return { ok: true, method: "pywebview" };
    if (res && typeof res === "object") {
      if (res.cancelled) {
        return { ok: true, method: "pywebview", cancelled: true };
      }
      if (res.ok) {
        return { ok: true, method: "pywebview", path: res.path };
      }
      return {
        ok: false,
        method: "pywebview",
        error: res.error || "No se pudo guardar el archivo en el escritorio.",
      };
    }
    return { ok: false, method: "pywebview", error: "Respuesta inválida del host de escritorio." };
  } catch (err) {
    return {
      ok: false,
      method: "pywebview",
      error: err instanceof Error ? err.message : "Error al guardar vía escritorio.",
    };
  }
}

function saveWithMsBlob(blob: Blob, fileName: string): boolean {
  const nav = navigator as Navigator & {
    msSaveOrOpenBlob?: (blob: Blob, defaultName?: string) => boolean;
  };
  if (typeof nav.msSaveOrOpenBlob !== "function") return false;
  try {
    nav.msSaveOrOpenBlob(blob, fileName);
    return true;
  } catch {
    return false;
  }
}

function saveWithAnchor(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // WebView may start the download async — do not revoke immediately
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

function openBlobFallback(blob: Blob, fileName: string): boolean {
  try {
    const url = URL.createObjectURL(blob);
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
    if (opened) return true;
    // Popup blocked: navigate same tab iframe approach
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = url;
    document.body.appendChild(iframe);
    window.setTimeout(() => {
      try {
        document.body.removeChild(iframe);
      } catch {
        /* ignore */
      }
      URL.revokeObjectURL(url);
    }, 120_000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Save any Blob to the user's machine (PDF, CSV, images, zip…).
 * Prefer this helper everywhere instead of raw `<a download>`.
 */
export async function downloadBlob(
  blob: Blob,
  fileName: string,
  options?: { preferOpen?: boolean }
): Promise<SaveBlobResult> {
  const name = safeFileName(fileName);
  const data = ensureMime(blob, name);

  if (options?.preferOpen) {
    if (openBlobFallback(data, name)) {
      return { ok: true, method: "open" };
    }
  }

  // Desktop shell: pywebview native Save is the reliable path (blob downloads no-op).
  if (isClinicDesktopHost() || getPywebviewApi()?.save_file) {
    const desk = await saveWithPywebview(data, name);
    if (desk) return desk;
  }

  // Chromium File System Access (user gesture required)
  const picker = await saveWithFilePicker(data, name);
  if (picker) return picker;

  // Browser / Client without shell API
  if (!isClinicDesktopHost()) {
    const desk2 = await saveWithPywebview(data, name);
    if (desk2) return desk2;
  }

  // 3) Legacy Edge
  if (saveWithMsBlob(data, name)) {
    return { ok: true, method: "msSaveOrOpenBlob" };
  }

  // 4) Classic anchor — browsers / some clients
  try {
    saveWithAnchor(data, name);
    // On pure desktop WebView, this often no-ops; open as last resort when desktop
    if (isClinicDesktopHost()) {
      const opened = openBlobFallback(data, name);
      if (opened) {
        return { ok: true, method: "anchor+open" };
      }
    }
    return { ok: true, method: "anchor" };
  } catch (err) {
    if (openBlobFallback(data, name)) {
      return { ok: true, method: "open" };
    }
    return {
      ok: false,
      method: "none",
      error: err instanceof Error ? err.message : "No se pudo descargar el archivo.",
    };
  }
}

/** PDF convenience wrapper (keeps previous call-site ergonomics). */
export async function downloadPdfBlobAsync(
  blob: Blob,
  fileName: string
): Promise<SaveBlobResult> {
  const name = fileName.toLowerCase().endsWith(".pdf") ? fileName : `${fileName}.pdf`;
  return downloadBlob(blob, name);
}
