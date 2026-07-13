"use client";

import { memo, useId } from "react";
import {
  conditionById,
  conditionFillColor,
  toothKind,
} from "@/lib/odontogramConditions";
import { toothAnatomy } from "./toothAnatomy";
import { toothReferenceUrl } from "./toothAssetsReferencia";

type Arch = "upper" | "lower";

interface ToothSVGProps {
  pieza: string;
  arch: Arch;
  condicion: string | null;
  selected?: boolean;
  onClick: (e: React.MouseEvent) => void;
}

const CROWN_BASE = "#ffffff";
const STROKE = "#111111";
const SW = 1.55;

function crownFill(condicion: string | null): string {
  const cond = conditionById(condicion);
  if (!cond) return CROWN_BASE;
  if (cond.symbol === "x" || cond.symbol === "diagonal" || cond.symbol === "lines") {
    return CROWN_BASE;
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
 * Diente clínico estilo Odontograma.jpg — imagen anatómica de referencia
 * + capa SVG para marcas clínicas (relleno, símbolos).
 */
function ToothSVGInner({ pieza, arch, condicion, selected, onClick }: ToothSVGProps) {
  const uid = useId().replace(/:/g, "");
  const kind = toothKind(pieza);
  const { crown } = toothAnatomy(kind, arch);
  const cond = conditionById(condicion);
  const symbol = cond?.symbol ?? null;
  const fill = crownFill(condicion);
  const banded = wantsBanded(condicion) && fill !== CROWN_BASE;
  const imgSrc = toothReferenceUrl(pieza);
  const flip = arch === "upper" ? "scaleY(-1)" : undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      title={`Pieza ${pieza}${cond ? ` — ${cond.label}` : " — sin marca"}`}
      aria-label={`Pieza ${pieza}${cond ? `, ${cond.label}` : ", sin marca"}`}
      className={`relative flex flex-col items-center p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
        selected ? "bg-emerald-50/70" : ""
      }`}
    >
      <span className="relative block h-[90px] w-[42px]">
        {/* Sprite extraído de la referencia clínica M&D */}
        <img
          src={imgSrc}
          alt=""
          aria-hidden
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain object-center"
          style={{ transform: flip }}
        />

        <svg
          viewBox="0 0 48 96"
          className="absolute inset-0 h-full w-full"
          style={{ transform: flip }}
        >
          <defs>
            <clipPath id={`${uid}-cr`}>
              <path d={crown} />
            </clipPath>
          </defs>

          {/* Normaliza corona (referencia demo trae tintes) o aplica condición clínica */}
          <path
            d={crown}
            fill={fill}
            stroke="none"
            opacity={condicion ? 0.92 : 0.88}
          />
          <path
            d={crown}
            fill="none"
            stroke={STROKE}
            strokeWidth={SW}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={0.35}
          />

          {banded && (
            <g clipPath={`url(#${uid}-cr)`} pointerEvents="none">
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
      </span>
    </button>
  );
}

export const ToothSVG = memo(ToothSVGInner);
