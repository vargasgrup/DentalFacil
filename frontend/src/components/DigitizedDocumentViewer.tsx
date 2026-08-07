"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Download,
  Maximize2,
  Minimize2,
  RotateCcw,
  RotateCw,
  ZoomIn,
  ZoomOut,
  ScanSearch,
  Loader2,
  AlertTriangle,
} from "lucide-react";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.15;
/** Cap longest painted edge to avoid WebView2/GPU freeze on radiology files. */
const MAX_PAINT_EDGE = 2048;
const LOAD_TIMEOUT_MS = 60_000;

export interface DigitizedDocumentViewerProps {
  title: string;
  subtitle?: string;
  /** Blob URL or same-origin streaming API URL (preferred for desktop). */
  src: string;
  kind: "image" | "pdf";
  onClose: () => void;
  onDownload?: () => void;
  headerExtra?: ReactNode;
}

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 1000) / 1000));
}

/** Desktop Server WebView2 / pywebview — native Fullscreen API often paints black. */
function isDesktopWebHost(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as Window & {
    chrome?: { webview?: unknown };
    pywebview?: unknown;
  };
  if (w.pywebview || w.chrome?.webview) return true;
  const host = (window.location.hostname || "").toLowerCase();
  const port = window.location.port;
  return (
    port === "8001" &&
    (host === "127.0.0.1" || host === "localhost" || host.startsWith("192.168."))
  );
}

function ToolBtn({
  label,
  onClick,
  disabled,
  children,
  active,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border text-slate-700 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "border-brand-300 bg-brand-50 text-brand-700"
          : "border-slate-200 bg-white hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Document viewer safe for pywebview/WebView2:
 * - zoom via CSS transform (never natural×zoom pixel monsters)
 * - paint edge capped
 * - CSS fullscreen fallback instead of Fullscreen API on desktop host
 * - load timeout + recoverable error UI
 */
export function DigitizedDocumentViewer({
  title,
  subtitle,
  src,
  kind,
  onClose,
  onDownload,
  headerExtra,
}: DigitizedDocumentViewerProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const desktopHost = isDesktopWebHost();

  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  /** CSS-expanded chrome when Fullscreen API is avoided. */
  const [expanded, setExpanded] = useState(false);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [baseFit, setBaseFit] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const dragOrigin = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
    null
  );

  const computeBaseFit = useCallback((natW: number, natH: number) => {
    const stage = stageRef.current;
    if (!stage || natW <= 0 || natH <= 0) return 1;
    const sw = Math.max(64, stage.clientWidth - 32);
    const sh = Math.max(64, stage.clientHeight - 32);
    // Cap paint size first (browser still decodes, but layout GPU work is bound)
    const paintScale = Math.min(1, MAX_PAINT_EDGE / Math.max(natW, natH));
    const dw = natW * paintScale;
    const dh = natH * paintScale;
    return Math.min(sw / dw, sh / dh, 1);
  }, []);

  const ingestImageSize = useCallback(
    (w: number, h: number) => {
      if (w <= 0 || h <= 0) return;
      setNatural({ w, h });
      setLoading(false);
      setError("");
      requestAnimationFrame(() => {
        const fit = computeBaseFit(w, h);
        setBaseFit(fit);
        setZoom(1);
        setOffset({ x: 0, y: 0 });
      });
    },
    [computeBaseFit]
  );

  useEffect(() => {
    setNatural({ w: 0, h: 0 });
    setZoom(1);
    setBaseFit(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
    setLoading(true);
    setError("");
    setExpanded(false);
  }, [src, kind]);

  useEffect(() => {
    if (!loading) return;
    const t = window.setTimeout(() => {
      setLoading(false);
      setError(
        "El documento tarda demasiado en cargar. Cierre e intente de nuevo, o use un archivo más liviano."
      );
    }, LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [loading, src]);

  useLayoutEffect(() => {
    if (kind !== "image") {
      setLoading(false);
      return;
    }
    const img = imgRef.current;
    if (!img) return;
    const tryIngest = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        ingestImageSize(img.naturalWidth, img.naturalHeight);
      }
    };
    if (img.complete) tryIngest();
    // Avoid img.decode() on huge radiology bitmaps in WebView2 (main-thread freezes).
  }, [src, kind, ingestImageSize]);

  const zoomBy = useCallback((delta: number) => {
    setZoom((z) => clampZoom(z + delta));
  }, []);

  const zoomAt = useCallback((next: number) => {
    setZoom(clampZoom(next));
    setOffset({ x: 0, y: 0 });
  }, []);

  const applyFit = useCallback(() => {
    if (natural.w > 0) {
      setBaseFit(computeBaseFit(natural.w, natural.h));
    }
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [computeBaseFit, natural.w, natural.h]);

  const rotateBy = useCallback((deg: number) => {
    setRotation((r) => ((r + deg) % 360 + 360) % 360);
    setOffset({ x: 0, y: 0 });
  }, []);

  const toggleExpand = useCallback(async () => {
    if (desktopHost) {
      // Never call requestFullscreen inside pywebview/WebView2 clinic shell.
      setExpanded((v) => !v);
      requestAnimationFrame(() => applyFit());
      return;
    }
    const el = shellRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) await el.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      setExpanded((v) => !v);
    }
  }, [applyFit, desktopHost]);

  useEffect(() => {
    if (desktopHost) return;
    const onFs = () => {
      setExpanded(Boolean(document.fullscreenElement));
      requestAnimationFrame(() => applyFit());
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, [applyFit, desktopHost]);

  useEffect(() => {
    const onResize = () => {
      if (kind === "image" && natural.w > 0) applyFit();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [applyFit, kind, natural.w]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!desktopHost && document.fullscreenElement) {
          void document.exitFullscreen();
          e.preventDefault();
          return;
        }
        if (expanded) {
          setExpanded(false);
          e.preventDefault();
          return;
        }
        onClose();
        return;
      }
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomBy(ZOOM_STEP);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        zoomBy(-ZOOM_STEP);
      } else if (e.key === "0") {
        e.preventDefault();
        applyFit();
      } else if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        rotateBy(90);
      } else if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        void toggleExpand();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    applyFit,
    desktopHost,
    expanded,
    onClose,
    rotateBy,
    toggleExpand,
    zoomBy,
  ]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomBy(e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP);
      }
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragOrigin.current = {
      x: e.clientX,
      y: e.clientY,
      ox: offset.x,
      oy: offset.y,
    };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragOrigin.current) return;
    setOffset({
      x: dragOrigin.current.ox + (e.clientX - dragOrigin.current.x),
      y: dragOrigin.current.oy + (e.clientY - dragOrigin.current.y),
    });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragOrigin.current) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    dragOrigin.current = null;
    setDragging(false);
  };

  const zoomPct = Math.round(zoom * 100);
  const paintScale =
    natural.w > 0
      ? Math.min(1, MAX_PAINT_EDGE / Math.max(natural.w, natural.h))
      : 1;
  const paintW = natural.w > 0 ? natural.w * paintScale : undefined;
  const paintH = natural.h > 0 ? natural.h * paintScale : undefined;
  const compositeScale = baseFit * zoom;

  // Soft CSS pdf zoom — keep range modest for WebView PDF plugin.
  const pdfScale = clampZoom(Math.min(2.5, Math.max(0.5, zoom)));

  return (
    <div
      className={`fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/80 ${
        expanded ? "p-0" : "p-2 sm:p-4"
      }`}
      role="dialog"
      aria-modal="true"
      aria-label={`Vista de ${title}`}
      onClick={onClose}
    >
      <div
        ref={shellRef}
        className={`relative flex w-full flex-col overflow-hidden bg-white shadow-2xl ${
          expanded
            ? "h-full max-h-none max-w-none rounded-none"
            : "h-[94vh] max-h-[94vh] max-w-6xl rounded-xl"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-3 py-2.5 sm:px-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
            {subtitle && (
              <p className="truncate text-xs text-slate-500">{subtitle}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerExtra}
            {onDownload && (
              <button
                type="button"
                onClick={onDownload}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Descargar</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              Cerrar
            </button>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 sm:px-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => applyFit()}
              title="Ver documento completo en pantalla (0)"
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors ${
                Math.abs(zoom - 1) < 0.02
                  ? "border-brand-500 bg-brand-600 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
              }`}
            >
              <ScanSearch className="h-3.5 w-3.5" />
              Ver completo
            </button>
            <ToolBtn
              label="Alejar (−)"
              onClick={() => zoomBy(-ZOOM_STEP)}
              disabled={zoom <= MIN_ZOOM}
            >
              <ZoomOut className="h-4 w-4" />
            </ToolBtn>
            <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1 py-0.5">
              {[0.5, 1, 1.5, 2].map((z) => (
                <button
                  key={z}
                  type="button"
                  onClick={() => zoomAt(z)}
                  className={`rounded-md px-2 py-1 text-[11px] font-semibold tabular-nums ${
                    Math.abs(zoom - z) < 0.02
                      ? "bg-brand-600 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {Math.round(z * 100)}%
                </button>
              ))}
              <span className="min-w-[3rem] px-1 text-center text-[11px] font-semibold tabular-nums text-slate-700">
                {zoomPct}%
              </span>
            </div>
            <ToolBtn
              label="Acercar (+)"
              onClick={() => zoomBy(ZOOM_STEP)}
              disabled={zoom >= MAX_ZOOM}
            >
              <ZoomIn className="h-4 w-4" />
            </ToolBtn>
            <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:inline-block" />
            <ToolBtn label="Rotar izquierda" onClick={() => rotateBy(-90)}>
              <RotateCcw className="h-4 w-4" />
            </ToolBtn>
            <ToolBtn label="Rotar derecha (R)" onClick={() => rotateBy(90)}>
              <RotateCw className="h-4 w-4" />
            </ToolBtn>
            <ToolBtn
              label={
                expanded ? "Salir de pantalla completa (F)" : "Pantalla completa (F)"
              }
              onClick={() => void toggleExpand()}
              active={expanded}
            >
              {expanded ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </ToolBtn>
          </div>
          <p className="hidden text-[11px] text-slate-400 md:block">
            {desktopHost
              ? "Modo escritorio · zoom suave · arrastre · Esc cierra"
              : "Ctrl+rueda · arrastre · 0 ajustar · F pantalla completa"}
          </p>
        </div>

        <div
          ref={stageRef}
          className={`relative min-h-0 flex-1 overflow-hidden bg-slate-100 ${
            dragging ? "cursor-grabbing" : "cursor-grab"
          }`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {loading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-slate-100 text-slate-600">
              <Loader2 className="h-7 w-7 animate-spin text-brand-600" aria-hidden />
              <span className="text-xs font-medium">Cargando documento…</span>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-white px-6 text-center">
              <AlertTriangle className="h-8 w-8 text-amber-500" aria-hidden />
              <p className="max-w-md text-sm text-slate-700">{error}</p>
              <div className="flex flex-wrap justify-center gap-2">
                {onDownload && (
                  <button
                    type="button"
                    onClick={onDownload}
                    className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Descargar archivo
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800"
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}

          {kind === "pdf" ? (
            <div
              className="absolute inset-0 flex items-center justify-center p-2"
              style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
            >
              <div
                className="h-full w-full max-w-5xl overflow-hidden rounded-md bg-white shadow-md ring-1 ring-slate-200"
                style={{
                  transform: `scale(${pdfScale}) rotate(${rotation}deg)`,
                  transformOrigin: "center center",
                  willChange: "transform",
                }}
              >
                {/* Stream URL preferred; blob: also works but is heavier in WebView2 */}
                <iframe
                  title={title}
                  src={src}
                  className="h-full w-full border-0 bg-white"
                  // Avoid sandbox here — breaks PDF plugin inside WebView2
                />
              </div>
            </div>
          ) : (
            <div
              className="absolute inset-0 flex items-center justify-center overflow-hidden"
              style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
            >
              <div
                className="relative flex shrink-0 items-center justify-center"
                style={{
                  width: paintW,
                  height: paintH,
                  maxWidth: "100%",
                  maxHeight: "100%",
                  transform: `scale(${compositeScale}) rotate(${rotation}deg)`,
                  transformOrigin: "center center",
                  willChange: "transform",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={imgRef}
                  src={src}
                  alt={title}
                  draggable={false}
                  decoding="async"
                  loading="eager"
                  onLoad={(e) => {
                    const el = e.currentTarget;
                    ingestImageSize(el.naturalWidth, el.naturalHeight);
                  }}
                  onError={() => {
                    setLoading(false);
                    setError(
                      "No se pudo mostrar la imagen (formato no soportado o archivo dañado)."
                    );
                  }}
                  className="block max-h-full max-w-full select-none object-contain shadow-md"
                  style={{
                    width: paintW ? paintW : "auto",
                    height: paintH ? paintH : "auto",
                  }}
                />
              </div>
            </div>
          )}

          <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-slate-900/70 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-white">
            {zoomPct}%
            {rotation ? ` · ${rotation}°` : ""}
          </div>
        </div>
      </div>
    </div>
  );
}
