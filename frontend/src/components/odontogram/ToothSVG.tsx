"use client";

import { memo, useId } from "react";
import { conditionById, conditionFillColor, toothKind, type ToothKind } from "@/lib/odontogramConditions";

type Arch = "upper" | "lower";

interface ToothSVGProps {
  pieza: string;
  arch: Arch;
  condicion: string | null;
  selected?: boolean;
  onClick: (e: React.MouseEvent) => void;
}

/** Relleno base (raíz / corona sin marca) — tono papel de la referencia */
const BASE = "#f7f4ef";
const STROKE = "#111111";
const SW = 1.55;

/**
 * Anatomía estilo ilustración clínica de docs/Odontograma.jpg.
 * viewBox 0 0 48 96 — raíz hacia Y=0, corona hacia Y=max.
 * Arcada inferior se espeja con scaleY(-1).
 */
function anatomy(kind: ToothKind, arch: Arch): { roots: string[]; crown: string } {
  if (kind === "incisor") {
    return {
      roots: [
        "M24 2 C22.2 2 20.8 9 20.2 20 C19.5 34 19.2 44 20 52 L28 52 C28.8 44 28.5 34 27.8 20 C27.2 9 25.8 2 24 2 Z",
      ],
      crown:
        "M19.2 52 C16.5 52 14.8 56 14.2 63 C13.5 72 14.8 81 18.2 86 C20.5 89.5 22.5 91 24 91 C25.5 91 27.5 89.5 29.8 86 C33.2 81 34.5 72 33.8 63 C33.2 56 31.5 52 28.8 52 Z",
    };
  }

  if (kind === "canine") {
    return {
      roots: [
        "M24 1.5 C21.8 1.5 20 10 19.2 22 C18.2 38 18 46 19 54 L29 54 C30 46 29.8 38 28.8 22 C28 10 26.2 1.5 24 1.5 Z",
      ],
      crown:
        "M18 54 C14.5 54 12.5 60 13 69 C13.5 78 17 87 24 93.5 C31 87 34.5 78 35 69 C35.5 60 33.5 54 30 54 Z",
    };
  }

  if (kind === "premolar") {
    return {
      roots: [
        "M24 3 C21.2 3 19 14 18.2 28 C17.4 40 17.5 48 18.5 55 L29.5 55 C30.5 48 30.6 40 29.8 28 C29 14 26.8 3 24 3 Z",
      ],
      crown:
        "M15.5 55 C11.5 55 9.5 61 10 70 C10.5 79 14.5 86.5 20.5 90.5 C22.5 92 24 92.5 24 92.5 C24 92.5 25.5 92 27.5 90.5 C33.5 86.5 37.5 79 38 70 C38.5 61 36.5 55 32.5 55 Z",
    };
  }

  if (arch === "upper") {
    // Maxilar: 3 raíces
    return {
      roots: [
        "M13.5 5 C11.2 5 9.5 16 9 28 C8.5 40 9.5 48 11.5 55 L18.5 55 C19.5 46 19 34 18.5 24 C18 14 15.8 5 13.5 5 Z",
        "M24 2 C21.8 2 20.5 12 20 25 C19.5 38 20 48 21 54 L27 54 C28 48 28.5 38 28 25 C27.5 12 26.2 2 24 2 Z",
        "M34.5 5 C32.2 5 30 14 29.5 24 C29 34 29 46 30 55 L37 55 C39 48 39.5 40 39 28 C38.5 16 36.8 5 34.5 5 Z",
      ],
      crown:
        "M9.5 55 C5 55 3.5 64 4 74 C4.5 84 12 93 24 95 C36 93 43.5 84 44 74 C44.5 64 43 55 38.5 55 Z",
    };
  }

  // Mandibular: 2 raíces
  return {
    roots: [
      "M15.5 4 C12.8 4 11 16 10.5 28 C10 40 11 50 13.5 55 L21.5 55 C22.5 46 22 34 21.5 24 C21 14 18.2 4 15.5 4 Z",
      "M32.5 4 C29.8 4 27 14 26.5 24 C26 34 26 46 27 55 L34.5 55 C37 50 38 40 37.5 28 C37 16 35.2 4 32.5 4 Z",
    ],
    crown:
      "M10.5 55 C6 55 4.5 64 5 74 C5.5 84 13 93 24 95 C35 93 42.5 84 43 74 C43.5 64 42 55 37.5 55 Z",
  };
}

/** Condiciones con relleno de corona (símbolos van sobre fondo claro) */
function crownFill(condicion: string | null): string {
  const cond = conditionById(condicion);
  if (!cond) return BASE;
  if (cond.symbol === "x" || cond.symbol === "diagonal" || cond.symbol === "lines") return BASE;
  return conditionFillColor(condicion);
}

/** Bandas verticales como en prótesis fija de la referencia */
function wantsBanded(condicion: string | null): boolean {
  return (
    condicion === "protesis_fija" ||
    condicion === "protesis" ||
    condicion === "corona" ||
    condicion === "corona_temp"
  );
}

function ToothSVGInner({ pieza, arch, condicion, selected, onClick }: ToothSVGProps) {
  const uid = useId().replace(/:/g, "");
  const kind = toothKind(pieza);
  const { roots, crown } = anatomy(kind, arch);
  const cond = conditionById(condicion);
  const symbol = cond?.symbol ?? null;
  const fill = crownFill(condicion);
  const banded = wantsBanded(condicion) && fill !== BASE;

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
      <svg
        viewBox="0 0 48 96"
        className="h-[90px] w-[42px]"
        style={{ transform: arch === "lower" ? "scaleY(-1)" : undefined }}
      >
        <defs>
          <clipPath id={`${uid}-cr`}>
            <path d={crown} />
          </clipPath>
        </defs>

        {roots.map((d, i) => (
          <path
            key={i}
            d={d}
            fill={BASE}
            stroke={STROKE}
            strokeWidth={SW}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        <path
          d={crown}
          fill={fill}
          stroke={STROKE}
          strokeWidth={SW}
          strokeLinejoin="round"
          strokeLinecap="round"
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

        {/* Cuello */}
        <line
          x1={kind === "molar" ? 11 : 18}
          y1="55"
          x2={kind === "molar" ? 37 : 30}
          y2="55"
          stroke={STROKE}
          strokeWidth="1"
          opacity={0.45}
        />

        {kind === "molar" && (
          <g
            clipPath={`url(#${uid}-cr)`}
            stroke={STROKE}
            strokeWidth={0.85}
            opacity={0.22}
            fill="none"
          >
            <path d="M15 66 Q24 61 33 66" />
            <path d="M24 58 L24 82" />
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
    </button>
  );
}

export const ToothSVG = memo(ToothSVGInner);
