/**
 * Impresión fiel de PDF.
 *
 * - A4/A5: raster (pdf.js → imagen) para control de tamaño de página.
 * - 80mm (tiquetera): imprime el PDF nativo. Evita el pipeline HTML que
 *   Chrome etiqueta con la URL de /caja, fecha y 2ª hoja en blanco
 *   (Star TSP700II / encabezados del navegador).
 */

const PT_TO_MM = 25.4 / 72;
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

function printHtmlInHiddenIframe(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("title", " ");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText =
      "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;border:0;pointer-events:none;z-index:-1;";
    document.body.appendChild(iframe);

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      try {
        URL.revokeObjectURL(blobUrl);
        iframe.remove();
      } catch {
        /* ignore */
      }
      resolve();
    };

    const triggerPrint = () => {
      const win = iframe.contentWindow;
      if (!win) {
        cleanup();
        reject(new Error("No se pudo preparar la impresión"));
        return;
      }
      try {
        win.focus();
        const onAfter = () => cleanup();
        win.addEventListener("afterprint", onAfter);
        setTimeout(() => {
          win.removeEventListener("afterprint", onAfter);
          cleanup();
        }, 90_000);
        win.print();
      } catch (err) {
        cleanup();
        reject(err instanceof Error ? err : new Error("Error al imprimir"));
      }
    };

    iframe.addEventListener(
      "load",
      () => {
        const doc = iframe.contentDocument;
        const waitImages = () => {
          const imgs = doc ? Array.from(doc.images) : [];
          if (imgs.length === 0) {
            setTimeout(triggerPrint, 250);
            return;
          }
          let left = imgs.length;
          const tick = () => {
            left -= 1;
            if (left <= 0) setTimeout(triggerPrint, 250);
          };
          imgs.forEach((img) => {
            if (img.complete) tick();
            else {
              img.addEventListener("load", tick, { once: true });
              img.addEventListener("error", tick, { once: true });
            }
          });
          setTimeout(() => {
            if (left > 0) triggerPrint();
          }, 8_000);
        };
        waitImages();
      },
      { once: true }
    );

    iframe.src = blobUrl;
  });
}

/**
 * Imprime el PDF tal cual (MediaBox 80mm × alto del ticket).
 * No pasa por HTML → no aparece la URL de /caja ni se inventa una 2ª hoja vacía.
 */
function printPdfNative(blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const pdfBlob =
      blob.type === "application/pdf"
        ? blob
        : new Blob([blob], { type: "application/pdf" });
    const url = URL.createObjectURL(pdfBlob);

    const iframe = document.createElement("iframe");
    iframe.setAttribute("title", "Ticket");
    iframe.setAttribute("aria-hidden", "true");
    // Tamaño real off-screen: el visor PDF de Chrome necesita área no nula
    iframe.style.cssText =
      "position:fixed;left:-10000px;top:0;width:80mm;height:297mm;border:0;opacity:0;pointer-events:none;";
    document.body.appendChild(iframe);

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      try {
        URL.revokeObjectURL(url);
        iframe.remove();
      } catch {
        /* ignore */
      }
      resolve();
    };

    const triggerPrint = () => {
      const win = iframe.contentWindow;
      if (!win) {
        cleanup();
        reject(new Error("No se pudo abrir el ticket para imprimir"));
        return;
      }
      try {
        win.focus();
        const onAfter = () => cleanup();
        win.addEventListener("afterprint", onAfter);
        setTimeout(() => {
          win.removeEventListener("afterprint", onAfter);
          cleanup();
        }, 90_000);
        win.print();
      } catch (err) {
        cleanup();
        reject(err instanceof Error ? err : new Error("Error al imprimir"));
      }
    };

    iframe.addEventListener(
      "load",
      () => {
        // El plugin PDF interno tarda un poco más que un HTML
        setTimeout(triggerPrint, 600);
      },
      { once: true }
    );

    iframe.src = url;
  });
}

/**
 * Imprime un PDF (Blob). Ticket 80mm = PDF nativo; A4/A5 = raster.
 */
export async function printPdfBlob(
  blob: Blob,
  options?: { title?: string; formatHint?: PrintFormatHint }
): Promise<void> {
  if (options?.formatHint === "80mm") {
    await printPdfNative(blob);
    return;
  }

  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await blob.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages = await renderAllPages(pdf);
  if (!pages.length) throw new Error("El PDF no tiene páginas");

  const html = buildPrintHtml(pages, options);
  await printHtmlInHiddenIframe(html);
}

export function resetPrintFormatPrefsIfNeeded(): void {
  if (typeof window === "undefined") return;
  const FLAG = "ds_print_pipeline_v5";
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
