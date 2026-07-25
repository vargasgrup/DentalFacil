"use client";

import {
  useCallback,
  useEffect,
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
} from "lucide-react";

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.15;
const STAGE_PAD = 24;

export interface DigitizedDocumentViewerProps {
  title: string;
  subtitle?: string;
  src: string;
  /** image | pdf */
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
 * Digitized document viewer.
 * Zoom uses real layout width/height (not CSS scale) so large images fit and center correctly.
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
  const [zoom, setZoom] = useState(1);
  const [fitZoom, setFitZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [ready, setReady] = useState(false);
  const [fitMode, setFitMode] = useState(true);
  const dragOrigin = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
    null
  );
  const rotationRef = useRef(rotation);
  const fitModeRef = useRef(fitMode);
  rotationRef.current = rotation;
  fitModeRef.current = fitMode;

  const computeFitZoom = useCallback((natW: number, natH: number, rot: number) => {
    const stage = stageRef.current;
    if (!stage || natW <= 0 || natH <= 0) return 1;
    const sw = Math.max(40, stage.clientWidth - STAGE_PAD);
    const sh = Math.max(40, stage.clientHeight - STAGE_PAD);
    const rotated = Math.abs(rot % 180) === 90;
    const iw = rotated ? natH : natW;
    const ih = rotated ? natW : natH;
    return clampZoom(Math.min(sw / iw, sh / ih));
  }, []);

  const applyFit = useCallback(() => {
    const rot = rotationRef.current;
    const next =
      kind === "pdf" ? 1 : computeFitZoom(natural.w, natural.h, rot);
    setFitZoom(next);
    setZoom(next);
    setOffset({ x: 0, y: 0 });
    setFitMode(true);
  }, [computeFitZoom, kind, natural.h, natural.w]);

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
        if (fitModeRef.current && kind === "image" && natural.w > 0) {
          const z = computeFitZoom(natural.w, natural.h, next);
          setFitZoom(z);
          setZoom(z);
          setOffset({ x: 0, y: 0 });
        }
        return next;
      });
    },
    [computeFitZoom, kind, natural.h, natural.w]
  );

  const toggleFullscreen = useCallback(async () => {
    const el = shellRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      setFullscreen((f) => !f);
    }
  }, []);

  const refitIfNeeded = useCallback(() => {
    if (!fitModeRef.current || kind !== "image" || natural.w <= 0) return;
    const z = computeFitZoom(natural.w, natural.h, rotationRef.current);
    setFitZoom(z);
    setZoom(z);
    setOffset({ x: 0, y: 0 });
  }, [computeFitZoom, kind, natural.h, natural.w]);

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    setNatural({ w, h });
    // Wait for stage flex layout before measuring
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const z = computeFitZoom(w, h, rotationRef.current);
        setFitZoom(z);
        setZoom(z);
        setOffset({ x: 0, y: 0 });
        setFitMode(true);
        setReady(true);
      });
    });
  };

  useEffect(() => {
    const onFs = () => {
      setFullscreen(Boolean(document.fullscreenElement));
      requestAnimationFrame(() => refitIfNeeded());
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, [refitIfNeeded]);

  useEffect(() => {
    if (kind !== "image" || natural.w <= 0) return;
    const onResize = () => refitIfNeeded();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [kind, natural.w, refitIfNeeded]);

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

  // Real layout size — never use CSS scale for zoom (avoids black-gap / clip bug)
  const displayW = natural.w > 0 ? natural.w * zoom : 0;
  const displayH = natural.h > 0 ? natural.h * zoom : 0;
  const rotated90 = Math.abs(rotation % 180) === 90;
  const boxW = rotated90 ? displayH : displayW;
  const boxH = rotated90 ? displayW : displayH;

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
            : "max-h-[94vh] max-w-6xl rounded-xl"
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

        <div
          ref={stageRef}
          className={`relative min-h-0 flex-1 overflow-hidden bg-slate-950 ${
            fullscreen ? "h-full" : "h-[min(78vh,720px)]"
          } ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
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
              {/* Bounding box matches visual size after rotation */}
              <div
                className="relative flex shrink-0 items-center justify-center"
                style={{
                  width: boxW || undefined,
                  height: boxH || undefined,
                  opacity: ready ? 1 : 0,
                  transition: dragging ? "none" : "opacity 0.12s ease",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={title}
                  draggable={false}
                  onLoad={onImageLoad}
                  className="block max-w-none select-none shadow-lg"
                  style={{
                    width: displayW || "auto",
                    height: displayH || "auto",
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
