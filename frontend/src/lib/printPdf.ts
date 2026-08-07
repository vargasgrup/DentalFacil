/**
 * Impresión fiel de PDF con panel de trabajo propio (modo escritorio).
 *
 * - Raster (pdf.js → imagen) con @page del MediaBox.
 * - En WebView2/pywebview el diálogo nativo de Windows al cerrar (X)
 *   a veces cierra TODA la app: el panel N&K permite Cerrar sin matar el host.
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

/**
 * Panel de impresión N&K: vista previa + Imprimir / Cerrar.
 * Cerrar solo quita el panel (no llama a window.close del shell).
 */
function openClinicPrintWorkbench(
  html: string,
  options?: { title?: string }
): Promise<void> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve();
      return;
    }

    const existing = document.getElementById("nk-print-workbench");
    if (existing) existing.remove();

    const backdrop = document.createElement("div");
    backdrop.id = "nk-print-workbench";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-label", options?.title || "Imprimir documento");
    backdrop.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:2147483000",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "padding:12px",
      "background:rgba(15,23,42,0.55)",
      "font-family:Segoe UI,system-ui,sans-serif",
    ].join(";");

    const panel = document.createElement("div");
    panel.style.cssText = [
      "display:flex",
      "flex-direction:column",
      "width:min(960px,100%)",
      "height:min(90vh,900px)",
      "background:#fff",
      "border-radius:14px",
      "box-shadow:0 25px 50px -12px rgba(15,23,42,0.35)",
      "overflow:hidden",
    ].join(";");

    const header = document.createElement("div");
    header.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid #e2e8f0;background:#f8fafc;";

    const titleEl = document.createElement("div");
    titleEl.innerHTML = `<p style="margin:0;font-size:14px;font-weight:700;color:#0f172a">${escapeHtml(
      options?.title || "Imprimir documento"
    )}</p><p style="margin:2px 0 0;font-size:12px;color:#64748b">Vista previa · Imprima o cierre sin salir del sistema</p>`;

    const closeHeader = document.createElement("button");
    closeHeader.type = "button";
    closeHeader.setAttribute("aria-label", "Cerrar panel de impresión");
    closeHeader.textContent = "×";
    closeHeader.style.cssText =
      "width:36px;height:36px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;font-size:22px;line-height:1;color:#475569;cursor:pointer";

    header.appendChild(titleEl);
    header.appendChild(closeHeader);

    const body = document.createElement("div");
    body.style.cssText =
      "flex:1;min-height:0;background:#e2e8f0;display:flex;padding:12px";

    const iframe = document.createElement("iframe");
    iframe.title = "Vista previa de impresión";
    iframe.style.cssText =
      "flex:1;width:100%;height:100%;border:0;border-radius:8px;background:#fff;box-shadow:0 1px 3px rgba(15,23,42,0.12)";

    body.appendChild(iframe);

    const footer = document.createElement("div");
    footer.style.cssText =
      "display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid #e2e8f0;background:#fff";

    const hint = document.createElement("p");
    hint.style.cssText =
      "margin:0;margin-right:auto;font-size:12px;color:#64748b;max-width:28rem";
    hint.textContent =
      "Cerrar solo cierra este panel. Imprimir abre el diálogo de la impresora.";

    const btnCancel = document.createElement("button");
    btnCancel.type = "button";
    btnCancel.textContent = "Cancelar";
    btnCancel.style.cssText =
      "padding:9px 14px;border-radius:10px;border:1px solid #cbd5e1;background:#fff;color:#334155;font-size:13px;font-weight:600;cursor:pointer";

    const btnClose = document.createElement("button");
    btnClose.type = "button";
    btnClose.textContent = "Cerrar";
    btnClose.style.cssText =
      "padding:9px 14px;border-radius:10px;border:1px solid #cbd5e1;background:#f1f5f9;color:#0f172a;font-size:13px;font-weight:600;cursor:pointer";

    const btnPrint = document.createElement("button");
    btnPrint.type = "button";
    btnPrint.textContent = "Imprimir";
    btnPrint.style.cssText =
      "padding:9px 18px;border-radius:10px;border:0;background:#2563eb;color:#fff;font-size:13px;font-weight:700;cursor:pointer";

    footer.appendChild(hint);
    footer.appendChild(btnCancel);
    footer.appendChild(btnClose);
    footer.appendChild(btnPrint);

    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(footer);
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      try {
        backdrop.remove();
      } catch {
        /* ignore */
      }
      resolve();
    };

    const doPrint = () => {
      const win = iframe.contentWindow;
      if (!win) return;
      try {
        win.focus();
        win.print();
      } catch {
        /* ignore */
      }
    };

    btnPrint.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      doPrint();
    });
    btnCancel.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      finish();
    });
    btnClose.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      finish();
    });
    closeHeader.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      finish();
    });
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) finish();
    });
    // Escape cierra solo el panel
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        document.removeEventListener("keydown", onKey, true);
        finish();
      }
    };
    document.addEventListener("keydown", onKey, true);

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);
    iframe.addEventListener(
      "load",
      () => {
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      },
      { once: true }
    );
    iframe.src = blobUrl;
  });
}

/**
 * Imprime un PDF (Blob) vía panel de trabajo interno (Imprimir / Cerrar).
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

  const html = buildPrintHtml(pages, {
    ...options,
    title: options?.title ? options.title : "\u00a0",
  });
  await openClinicPrintWorkbench(html, { title: options?.title || "Imprimir" });
}

export function resetPrintFormatPrefsIfNeeded(): void {
  if (typeof window === "undefined") return;
  const FLAG = "ds_print_pipeline_v8";
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
