/**
 * Impresión fiel de PDF: no usa el visor embebido del navegador
 * (Chrome/Edge escalan mal tickets 80mm y páginas A5).
 *
 * Flujo: lee el PDF → renderiza cada página a imagen en tamaño real →
 * imprime vía iframe oculto (sin popup; evita bloqueo de ventanas emergentes).
 */

const PT_TO_MM = 25.4 / 72;
/** Escala de render para calidad de impresión (~150–200 dpi) */
const RENDER_SCALE = 2.5;

export type PrintFormatHint = "80mm" | "A5" | "A4";

let workerReady = false;

async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
  if (!workerReady) {
    const version = pdfjs.version || "4.10.38";
    const major = Number(String(version).split(".")[0] || "4");
    const workerFile = major >= 4 ? "pdf.worker.min.mjs" : "pdf.worker.min.js";
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/${workerFile}`;
    workerReady = true;
  }
  return pdfjs;
}

interface RenderedPage {
  dataUrl: string;
  widthMm: number;
  heightMm: number;
}

async function renderAllPages(pdf: {
  numPages: number;
  getPage: (n: number) => Promise<{
    getViewport: (o: { scale: number }) => { width: number; height: number };
    render: (o: {
      canvasContext: CanvasRenderingContext2D;
      viewport: { width: number; height: number };
    }) => { promise: Promise<void> };
  }>;
}): Promise<RenderedPage[]> {
  const pages: RenderedPage[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const widthMm = base.width * PT_TO_MM;
    const heightMm = base.height * PT_TO_MM;
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo crear el lienzo de impresión");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    pages.push({
      dataUrl: canvas.toDataURL("image/png"),
      widthMm,
      heightMm,
    });
  }
  return pages;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildPrintHtml(
  pages: RenderedPage[],
  options?: { title?: string; formatHint?: PrintFormatHint }
): string {
  const sizeKey = (p: RenderedPage) =>
    `${p.widthMm.toFixed(2)}x${p.heightMm.toFixed(2)}`;
  const uniqueSizes = Array.from(
    new Map(pages.map((p) => [sizeKey(p), p])).values()
  );

  const title = escapeHtml(options?.title || "Documento");
  const first = pages[0];
  const sizeIndex = (p: RenderedPage) =>
    uniqueSizes.findIndex((u) => sizeKey(u) === sizeKey(p));

  const pageCss = uniqueSizes
    .map((p, i) => {
      const name = `sheet${i}`;
      return `
      @page ${name} {
        size: ${p.widthMm.toFixed(2)}mm ${p.heightMm.toFixed(2)}mm;
        margin: 0;
      }
      .sz-${i} {
        page: ${name};
        width: ${p.widthMm.toFixed(2)}mm;
        height: ${p.heightMm.toFixed(2)}mm;
      }`;
    })
    .join("\n");

  const sheetsHtml = pages
    .map((p, i) => {
      const si = sizeIndex(p);
      return `<div class="sheet sz-${si}"><img src="${p.dataUrl}" alt="Página ${i + 1}" /></div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    @page {
      size: ${first.widthMm.toFixed(2)}mm ${first.heightMm.toFixed(2)}mm;
      margin: 0;
    }
    ${pageCss}
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet {
      overflow: hidden;
      page-break-after: always;
      break-after: page;
      background: #fff;
    }
    .sheet:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .sheet img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: fill;
    }
  </style>
</head>
<body>
  ${sheetsHtml}
</body>
</html>`;
}

/**
 * Imprime HTML en un iframe oculto de la misma página.
 * No usa window.open → no lo bloquea el filtro de popups.
 */
function printHtmlInHiddenIframe(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("title", "Imprimir documento");
    iframe.setAttribute("aria-hidden", "true");
    // Visible mínimo: algunos motores no imprimen iframes 0×0
    iframe.style.cssText =
      "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;border:0;pointer-events:none;z-index:-1;";
    document.body.appendChild(iframe);

    const win = iframe.contentWindow;
    const doc = iframe.contentDocument ?? win?.document;
    if (!win || !doc) {
      iframe.remove();
      reject(new Error("No se pudo preparar la impresión en esta página"));
      return;
    }

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      try {
        iframe.remove();
      } catch {
        /* ignore */
      }
      resolve();
    };

    const triggerPrint = () => {
      try {
        win.focus();
        const onAfter = () => cleanup();
        win.addEventListener("afterprint", onAfter);
        // Safari / algunos Chrome no disparan afterprint de forma fiable
        setTimeout(() => {
          win.removeEventListener("afterprint", onAfter);
          cleanup();
        }, 90_000);
        win.print();
      } catch (err) {
        iframe.remove();
        reject(err instanceof Error ? err : new Error("Error al imprimir"));
      }
    };

    doc.open();
    doc.write(html);
    doc.close();

    const waitImages = () => {
      const imgs = Array.from(doc.images);
      if (imgs.length === 0) {
        setTimeout(triggerPrint, 200);
        return;
      }
      let left = imgs.length;
      const tick = () => {
        left -= 1;
        if (left <= 0) setTimeout(triggerPrint, 200);
      };
      imgs.forEach((img) => {
        if (img.complete) tick();
        else {
          img.addEventListener("load", tick, { once: true });
          img.addEventListener("error", tick, { once: true });
        }
      });
      // Timeout de seguridad si alguna imagen no termina
      setTimeout(() => {
        if (left > 0) triggerPrint();
      }, 8_000);
    };

    if (doc.readyState === "complete") waitImages();
    else iframe.addEventListener("load", waitImages, { once: true });
  });
}

/**
 * Imprime un PDF (Blob) respetando el tamaño de página del archivo.
 * Sin ventanas emergentes (iframe en la misma pestaña).
 */
export async function printPdfBlob(
  blob: Blob,
  options?: { title?: string; formatHint?: PrintFormatHint }
): Promise<void> {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await blob.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages = await renderAllPages(pdf);
  if (!pages.length) throw new Error("El PDF no tiene páginas");

  const html = buildPrintHtml(pages, options);
  await printHtmlInHiddenIframe(html);
}

/** Preferencias de formato: migra/limpia claves antiguas corruptas una sola vez. */
export function resetPrintFormatPrefsIfNeeded(): void {
  if (typeof window === "undefined") return;
  const FLAG = "ds_print_pipeline_v3";
  if (localStorage.getItem(FLAG) === "1") return;
  localStorage.removeItem("pdf_format_pref");
  localStorage.setItem(FLAG, "1");
}

export function getSavedPrintFormat(fallback: PrintFormatHint): PrintFormatHint {
  resetPrintFormatPrefsIfNeeded();
  const saved = localStorage.getItem("pdf_format_pref");
  if (saved === "80mm" || saved === "A5" || saved === "A4") return saved;
  return fallback;
}

export function savePrintFormat(format: PrintFormatHint): void {
  localStorage.setItem("pdf_format_pref", format);
}
