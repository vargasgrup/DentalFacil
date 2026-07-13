"use client";

import { memo, useEffect, useId, useState } from "react";
import {
  conditionById,
  conditionFillColor,
  toothKind,
} from "@/lib/odontogramConditions";
import { toothAnatomy } from "./toothAnatomy";
import { hasToothPieceAsset, toothPieceUrl } from "./toothAssetsReferencia";

type Arch = "upper" | "lower";

interface ToothSVGProps {
  pieza: string;
  arch: Arch;
  condicion: string | null;
  selected?: boolean;
  onClick: (e: React.MouseEvent) => void;
}

const BASE = "#f7f4ef";
const STROKE = "#111111";
const SW = 1.55;

function crownFill(condicion: string | null): string | null {
  const cond = conditionById(condicion);
  if (!cond) return null;
  if (cond.symbol === "x" || cond.symbol === "diagonal" || cond.symbol === "lines") {
    return null;
  }
  return conditionFillColor(condicion);
}

function wantsBanded(condicion: string | null): boolean {
  return (
    condicion === "protesis_fija" ||
    condicion === "protesis" ||
    condicion === "corona" ||
    condicion === "corona_temp"
  );
}

/**
 * Diente clínico: PNG por FDI (/dientes/{pieza}.png) + marcas SVG.
 * Los PNG ya vienen orientados (superior raíces↑, inferior raíces↓).
 */
function ToothSVGInner({ pieza, arch, condicion, selected, onClick }: ToothSVGProps) {
  const uid = useId().replace(/:/g, "");
  const kind = toothKind(pieza);
  const { roots, crown } = toothAnatomy(kind, arch);
  const cond = conditionById(condicion);
  const symbol = cond?.symbol ?? null;
  const fill = crownFill(condicion);
  const banded = wantsBanded(condicion) && !!fill;
  const usePng = hasToothPieceAsset(pieza);
  const imgSrc = usePng ? toothPieceUrl(pieza) : "";
  const [imgOk, setImgOk] = useState(usePng);

  useEffect(() => {
    setImgOk(usePng);
  }, [pieza, usePng, imgSrc]);

  // Overlay SVG: viewBox con raíz en Y=0. PNG inferior ya tiene corona arriba → espejar solo el overlay.
  const overlayFlip = arch === "lower" ? "scaleY(-1)" : undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      title={`Pieza ${pieza}${cond ? ` — ${cond.label}` : " — sin marca"}`}
      aria-label={`Pieza ${pieza}${cond ? `, ${cond.label}` : ", sin marca"}`}
      aria-pressed={selected}
      className="relative box-border flex w-full max-w-full flex-col items-center p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-inset"
    >
      <span className="relative mx-auto block h-[4.5rem] w-full max-w-full sm:h-[5.15rem] md:h-[5.625rem]">
        {usePng && imgOk ? (
          <img
            src={imgSrc}
            alt=""
            aria-hidden
            draggable={false}
            onError={() => setImgOk(false)}
            className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain object-center"
          />
        ) : (
          <svg
            viewBox="0 0 48 96"
            className="absolute inset-0 h-full w-full"
            style={{ transform: arch === "lower" ? "scaleY(-1)" : undefined }}
            aria-hidden
          >
            {roots.map((d, i) => (
              <path
                key={i}
                d={d}
                fill={BASE}
                stroke={STROKE}
                strokeWidth={SW}
                strokeLinejoin="round"
              />
            ))}
            <path
              d={crown}
              fill={fill || BASE}
              stroke={STROKE}
              strokeWidth={SW}
              strokeLinejoin="round"
            />
          </svg>
        )}

        {/* Marcas clínicas (solo si hay condición o selección de símbolo) */}
        {(fill || symbol || banded) && (
          <svg
            viewBox="0 0 48 96"
            className="pointer-events-none absolute inset-0 h-full w-full"
            style={{ transform: overlayFlip }}
          >
            <defs>
              <clipPath id={`${uid}-cr`}>
                <path d={crown} />
              </clipPath>
            </defs>

            {fill && (
              <path d={crown} fill={fill} stroke="none" opacity={0.72} />
            )}

            {banded && (
              <g clipPath={`url(#${uid}-cr)`}>
                <rect x="24" y="54" width="20" height="42" fill="#ffffff" opacity={0.28} />
                <line
                  x1="24"
                  y1="56"
                  x2="24"
                  y2="94"
                  stroke={STROKE}
                  strokeWidth="0.9"
                  opacity={0.35}
                />
              </g>
            )}

            {symbol === "x" && (
              <g stroke="#1e3a8a" strokeWidth="2.6" strokeLinecap="round">
                <line x1="11" y1="22" x2="37" y2="86" />
                <line x1="37" y1="22" x2="11" y2="86" />
              </g>
            )}
            {symbol === "diagonal" && (
              <line
                x1="13"
                y1="20"
                x2="35"
                y2="88"
                stroke="#dc2626"
                strokeWidth="2.7"
                strokeLinecap="round"
              />
            )}
            {symbol === "lines" && (
              <g stroke="#1e3a8a" strokeWidth="2.2" strokeLinecap="round">
                <line x1="9" y1="68" x2="39" y2="68" />
                <line x1="9" y1="76" x2="39" y2="76" />
              </g>
            )}
          </svg>
        )}
      </span>
    </button>
  );
}

export const ToothSVG = memo(ToothSVGInner);
