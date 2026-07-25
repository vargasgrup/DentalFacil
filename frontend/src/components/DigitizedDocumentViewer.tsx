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
} from "lucide-react";

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.15;
const STAGE_PAD = 24;

export interface DigitizedDocumentViewerProps {
  title: string;
  subtitle?: string;
  src: string;
  kind: "image" | "pdf";
  onClose: () => void;
  onDownload?: () => void;
  headerExtra?: ReactNode;
}

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 1000) / 1000));
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
 * Digitized document viewer — zoom via real pixel size (not CSS scale),
 * always measures stage before fitting, handles cached images.
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

  const [zoom, setZoom] = useState(1);
  const [fitZoom, setFitZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [fitMode, setFitMode] = useState(true);
  const [loading, setLoading] = useState(kind === "image");

  const dragOrigin = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const rotationRef = useRef(0);
  const fitModeRef = useRef(true);
  const naturalRef = useRef({ w: 0, h: 0 });
  rotationRef.current = rotation;
  fitModeRef.current = fitMode;
  naturalRef.current = natural;

  const measureFitZoom = useCallback((natW: number, natH: number, rot: number) => {
    const stage = stageRef.current;
    if (!stage || natW <= 0 || natH <= 0) return 1;
    const sw = Math.max(1, stage.clientWidth - STAGE_PAD);
    const sh = Math.max(1, stage.clientHeight - STAGE_PAD);
    if (sw < 8 || sh < 8) return 1;
    const rotated = Math.abs(rot % 180) === 90;
    const iw = rotated ? natH : natW;
    const ih = rotated ? natW : natH;
    return clampZoom(Math.min(sw / iw, sh / ih));
  }, []);

  const applyMeasuredFit = useCallback(
    (natW: number, natH: number, rot: number) => {
      const z = kind === "pdf" ? 1 : measureFitZoom(natW, natH, rot);
      setFitZoom(z);
      setZoom(z);
      setOffset({ x: 0, y: 0 });
      setFitMode(true);
    },
    [kind, measureFitZoom]
  );

  const applyFit = useCallback(() => {
    const { w, h } = naturalRef.current;
    applyMeasuredFit(w, h, rotationRef.current);
  }, [applyMeasuredFit]);

  const ingestImageSize = useCallback(
    (w: number, h: number) => {
      if (w <= 0 || h <= 0) return;
      setNatural({ w, h });
      naturalRef.current = { w, h };
      setLoading(false);
      // Measure after paint so stage has real height
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          applyMeasuredFit(w, h, rotationRef.current);
        });
      });
    },
    [applyMeasuredFit]
  );

  // Reset when source changes
  useEffect(() => {
    setNatural({ w: 0, h: 0 });
    naturalRef.current = { w: 0, h: 0 };
    setZoom(1);
    setFitZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
    setFitMode(true);
    setLoading(kind === "image");
  }, [src, kind]);

  // Handle cached images (onLoad may not fire) + late decode
  useLayoutEffect(() => {
    if (kind !== "image") return;
    const img = imgRef.current;
    if (!img) return;

    const tryIngest = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        ingestImageSize(img.naturalWidth, img.naturalHeight);
      }
    };

    if (img.complete) {
      tryIngest();
    }

    // decode() resolves for blob/object URLs even when complete is tricky
    if (typeof img.decode === "function") {
      img.decode().then(tryIngest).catch(() => {
        /* onLoad / complete will cover */
      });
    }
  }, [src, kind, ingestImageSize]);

  const zoomBy = useCallback((delta: number) => {
    setFitMode(false);
    setZoom((z) => clampZoom(z + delta));
  }, []);

  const zoomAt = useCallback((next: number) => {
    setFitMode(false);
    setZoom(clampZoom(next));
    setOffset({ x: 0, y: 0 });
  }, []);

  const rotateBy = useCallback(
    (deg: number) => {
      setRotation((r) => {
        const next = ((r + deg) % 360 + 360) % 360;
        if (fitModeRef.current && kind === "image") {
          const { w, h } = naturalRef.current;
          if (w > 0) applyMeasuredFit(w, h, next);
        }
        return next;
      });
    },
    [applyMeasuredFit, kind]
  );

  const toggleFullscreen = useCallback(async () => {
    const el = shellRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) await el.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      setFullscreen((f) => !f);
    }
  }, []);

  useEffect(() => {
    const onFs = () => {
      setFullscreen(Boolean(document.fullscreenElement));
      requestAnimationFrame(() => {
        if (fitModeRef.current) applyFit();
      });
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, [applyFit]);

  useEffect(() => {
    if (kind !== "image") return;
    const onResize = () => {
      if (fitModeRef.current) applyFit();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [applyFit, kind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (document.fullscreenElement) {
          void document.exitFullscreen();
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
        void toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applyFit, onClose, rotateBy, toggleFullscreen, zoomBy]);

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
  const isFitActive = fitMode || Math.abs(zoom - fitZoom) < 0.01;
  const hasSize = natural.w > 0 && natural.h > 0;
  const displayW = hasSize ? natural.w * zoom : undefined;
  const displayH = hasSize ? natural.h * zoom : undefined;
  const rotated90 = Math.abs(rotation % 180) === 90;
  const boxW = hasSize ? (rotated90 ? displayH! : displayW!) : undefined;
  const boxH = hasSize ? (rotated90 ? displayW! : displayH!) : undefined;

  return (
    <div
      className={`fixed inset-0 z-[80] flex items-center justify-center bg-black/75 ${
        fullscreen ? "p-0" : "p-2 sm:p-4"
      }`}
      role="dialog"
      aria-modal="true"
      aria-label={`Vista de ${title}`}
      onClick={onClose}
    >
      <div
        ref={shellRef}
        className={`relative flex w-full flex-col overflow-hidden bg-white shadow-2xl ${
          fullscreen
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
                isFitActive
                  ? "border-brand-500 bg-brand-600 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
              }`}
            >
              <ScanSearch className="h-3.5 w-3.5" />
              Ver completo
            </button>
            <ToolBtn label="Alejar (−)" onClick={() => zoomBy(-ZOOM_STEP)} disabled={zoom <= MIN_ZOOM}>
              <ZoomOut className="h-4 w-4" />
            </ToolBtn>
            <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1 py-0.5">
              {[0.5, 1, 1.5, 2].map((z) => (
                <button
                  key={z}
                  type="button"
                  onClick={() => zoomAt(z)}
                  className={`rounded-md px-2 py-1 text-[11px] font-semibold tabular-nums ${
                    !fitMode && Math.abs(zoom - z) < 0.02
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
            <ToolBtn label="Acercar (+)" onClick={() => zoomBy(ZOOM_STEP)} disabled={zoom >= MAX_ZOOM}>
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
              label={fullscreen ? "Salir de pantalla completa (F)" : "Pantalla completa (F)"}
              onClick={() => void toggleFullscreen()}
              active={fullscreen}
            >
              {fullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </ToolBtn>
          </div>
          <p className="hidden text-[11px] text-slate-400 md:block">
            Ver completo · Ctrl+rueda · arrastra · 0 ajustar · F pantalla completa
          </p>
        </div>

        {/* Explicit height so flex children always have a measurable stage */}
        <div
          ref={stageRef}
          className={`relative min-h-0 flex-1 overflow-hidden bg-slate-950 ${
            dragging ? "cursor-grabbing" : "cursor-grab"
          }`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {loading && kind === "image" && (
            <div className="absolute inset-0 z-10 flex items-center justify-center text-slate-300">
              <Loader2 className="h-7 w-7 animate-spin" aria-hidden />
              <span className="sr-only">Cargando documento…</span>
            </div>
          )}

          {kind === "pdf" ? (
            <div
              className="absolute inset-0 flex items-center justify-center p-3"
              style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
            >
              <div
                className="h-full w-full max-w-5xl overflow-hidden rounded bg-white shadow-lg"
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  transformOrigin: "center center",
                }}
              >
                <iframe title={title} src={src} className="h-full w-full border-0" />
              </div>
            </div>
          ) : (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
            >
              <div
                className="relative flex shrink-0 items-center justify-center"
                style={{
                  width: boxW,
                  height: boxH,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={imgRef}
                  src={src}
                  alt={title}
                  draggable={false}
                  onLoad={(e) => {
                    const el = e.currentTarget;
                    ingestImageSize(el.naturalWidth, el.naturalHeight);
                  }}
                  onError={() => setLoading(false)}
                  className="block max-w-none select-none shadow-lg"
                  style={{
                    // Until measured: fill stage with object-fit so something is always visible
                    width: hasSize ? displayW : "100%",
                    height: hasSize ? displayH : "100%",
                    maxWidth: hasSize ? undefined : "100%",
                    maxHeight: hasSize ? undefined : "100%",
                    objectFit: hasSize ? undefined : "contain",
                    transform: rotation ? `rotate(${rotation}deg)` : undefined,
                    transformOrigin: "center center",
                  }}
                />
              </div>
            </div>
          )}

          <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-white backdrop-blur-sm">
            {fitMode ? `Completo · ${zoomPct}%` : `${zoomPct}%`}
            {rotation ? ` · ${rotation}°` : ""}
          </div>
        </div>
      </div>
    </div>
  );
}
