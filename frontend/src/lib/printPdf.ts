/**
 * Impresión fiel de PDF: no usa el visor embebido del navegador
 * (Chrome/Edge escalan mal tickets 80mm y páginas A5).
 *
 * Flujo: lee el PDF → renderiza cada página a imagen en tamaño real →
 * imprime vía iframe oculto (sin popup; evita bloqueo de ventanas emergentes).
 *
 * Ticket 80mm: una sola franja continua (sin hoja 2), ancho completo,
 * @page margin 0 y título vacío para reducir cabeceras/pies del navegador.
 */

const PT_TO_MM = 25.4 / 72;
/** Escala de render para calidad de impresión (~150–200 dpi) */
const RENDER_SCALE = 2.5;
/** Ancho útil típico en rollo 80mm (Star TSP700II ≈ 72 mm imprimibles) */
const THERMAL_WIDTH_MM = 80;
const THERMAL_PRINTABLE_MM = 72;

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
  canvas?: HTMLCanvasElement;
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
      canvas,
    });
  }
  return pages;
}

/** Une todas las páginas del PDF en una sola imagen vertical (rollo térmico). */
function stitchPagesVertically(pages: RenderedPage[]): RenderedPage {
  if (pages.length === 1 && pages[0].canvas) {
    return pages[0];
  }
  const width = Math.max(...pages.map((p) => p.canvas?.width || 0));
  const height = pages.reduce((sum, p) => sum + (p.canvas?.height || 0), 0);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo unir el ticket para impresión");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  let y = 0;
  for (const p of pages) {
    if (!p.canvas) continue;
    const x = Math.floor((width - p.canvas.width) / 2);
    ctx.drawImage(p.canvas, x, y);
    y += p.canvas.height;
  }
  const widthMm = pages[0]?.widthMm || THERMAL_WIDTH_MM;
  const heightMm = pages.reduce((s, p) => s + p.heightMm, 0);
  return {
    dataUrl: canvas.toDataURL("image/png"),
    widthMm,
    heightMm,
    canvas,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * HTML de impresión para tiquetera 80mm:
 * - Una sola franja (sin page-break → no hoja 2)
 * - Márgenes 0; ancho al rollo
 * - Título vacío (Chrome pone fecha + título en cabecera si "Headers and footers" está activo)
 */
function buildThermalPrintHtml(page: RenderedPage): string {
  const w = THERMAL_PRINTABLE_MM;
  const h = Math.max(page.heightMm * (w / Math.max(page.widthMm, 1)), 40);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>&nbsp;</title>
  <style>
    @page {
      size: ${THERMAL_WIDTH_MM}mm ${h.toFixed(1)}mm;
      margin: 0;
    }
    @page {
      margin: 0;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: ${THERMAL_WIDTH_MM}mm;
      margin: 0;
      padding: 0;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .ticket {
      width: ${w}mm;
      max-width: 100%;
      margin: 0 auto;
      padding: 0;
      page-break-after: avoid;
      page-break-inside: avoid;
      break-after: avoid;
      break-inside: avoid;
    }
    .ticket img {
      display: block;
      width: 100%;
      height: auto;
      max-width: ${w}mm;
    }
    @media print {
      html, body { width: ${THERMAL_WIDTH_MM}mm; margin: 0; }
      .ticket { page-break-inside: avoid; break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="ticket"><img src="${page.dataUrl}" alt="" /></div>
</body>
</html>`;
}

function buildPrintHtml(
  pages: RenderedPage[],
  options?: { title?: string; formatHint?: PrintFormatHint }
): string {
  if (options?.formatHint === "80mm") {
    return buildThermalPrintHtml(stitchPagesVertically(pages));
  }

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
 * Imprime HTML en un iframe oculto.
 * Usa blob: URL para que el pie del navegador no muestre /caja de la app.
 */
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
  const FLAG = "ds_print_pipeline_v4";
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
