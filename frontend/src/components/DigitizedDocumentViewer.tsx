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
  Expand,
} from "lucide-react";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.25;

export interface DigitizedDocumentViewerProps {
  title: string;
  subtitle?: string;
  src: string;
  /** image | pdf */
  kind: "image" | "pdf";
  onClose: () => void;
  onDownload?: () => void;
  /** Extra actions in the header (e.g. delete) */
  headerExtra?: ReactNode;
}

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));
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
 * Professional digitized document viewer: zoom, pan, rotate, fit, fullscreen.
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
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const dragOrigin = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
    null
  );

  const resetView = useCallback(() => {
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  }, []);

  const zoomBy = useCallback((delta: number) => {
    setZoom((z) => clampZoom(z + delta));
  }, []);

  const zoomAt = useCallback((next: number) => {
    setZoom(clampZoom(next));
  }, []);

  const rotateBy = useCallback((deg: number) => {
    setRotation((r) => ((r + deg) % 360 + 360) % 360);
  }, []);

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

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

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
        resetView();
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
  }, [onClose, resetView, rotateBy, toggleFullscreen, zoomBy]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        zoomBy(delta);
      }
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (kind === "pdf" && zoom <= 1) return;
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
    const dx = e.clientX - dragOrigin.current.x;
    const dy = e.clientY - dragOrigin.current.y;
    setOffset({
      x: dragOrigin.current.ox + dx,
      y: dragOrigin.current.oy + dy,
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
  const canPan = kind === "image" || zoom > 1;

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
        {/* Header */}
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

        {/* Toolbar */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 sm:px-4">
          <div className="flex flex-wrap items-center gap-1.5">
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
                    Math.abs(zoom - z) < 0.01
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
            <ToolBtn label="Ajustar a la vista (0)" onClick={resetView}>
              <Expand className="h-4 w-4" />
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
            Ctrl + rueda · arrastra para mover · +/− · F pantalla completa · Esc cerrar
          </p>
        </div>

        {/* Stage */}
        <div
          ref={stageRef}
          className={`relative min-h-0 flex-1 overflow-hidden bg-slate-950 ${
            fullscreen ? "h-full" : "h-[min(78vh,720px)]"
          } ${canPan ? (dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-default"}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div
            className="flex h-full w-full items-center justify-center"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px)`,
            }}
          >
            {kind === "pdf" ? (
              <div
                className="origin-center bg-white shadow-lg"
                style={{
                  width: fullscreen ? "min(96vw, 1100px)" : "100%",
                  height: fullscreen ? "calc(100vh - 7.5rem)" : "min(78vh, 720px)",
                  maxWidth: "100%",
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  transformOrigin: "center center",
                }}
              >
                <iframe
                  title={title}
                  src={src}
                  className="h-full w-full border-0"
                />
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt={title}
                draggable={false}
                className="max-h-full max-w-full select-none object-contain shadow-lg"
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  transformOrigin: "center center",
                  transition: dragging ? "none" : "transform 0.12s ease-out",
                }}
              />
            )}
          </div>

          {/* Corner zoom chip */}
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-white backdrop-blur-sm">
            {zoomPct}%
            {rotation ? ` · ${rotation}°` : ""}
          </div>
        </div>
      </div>
    </div>
  );
}
