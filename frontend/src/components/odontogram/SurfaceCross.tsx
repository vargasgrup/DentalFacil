"use client";

import { memo } from "react";
import { conditionById, type SurfaceKey } from "@/lib/odontogramConditions";

/**
 * Cruz de 5 casillas — réplica de la referencia:
 *      [ V ]
 * [ M ][ O ][ D ]
 *      [ L ]
 */
const BOX = 10;
const CX = 20;
const CY = 20;
const O0 = CX - BOX / 2;
const O1 = CY - BOX / 2;

const SURFACES: { key: SurfaceKey; x: number; y: number; label: string }[] = [
  { key: "V", x: O0, y: O1 - BOX, label: "Vestibular" },
  { key: "L", x: O0, y: O1 + BOX, label: "Lingual/Palatino" },
  { key: "M", x: O0 - BOX, y: O1, label: "Mesial" },
  { key: "D", x: O0 + BOX, y: O1, label: "Distal" },
  { key: "O", x: O0, y: O1, label: "Oclusal/Incisal" },
];

interface SurfaceCrossProps {
  pieza: string;
  surfaces: Record<SurfaceKey, string | null>;
  circled?: boolean;
  onSurfaceClick: (surface: SurfaceKey, e: React.MouseEvent) => void;
}

function SurfaceCrossInner({ pieza, surfaces, circled, onSurfaceClick }: SurfaceCrossProps) {
  return (
    <svg
      viewBox="0 0 40 40"
      className="aspect-square h-auto w-[90%] max-w-full touch-manipulation"
    >
      {SURFACES.map(({ key, x, y, label }) => {
        const cid = surfaces[key];
        const cond = conditionById(cid);
        const fill = cid === "caries" ? "#ef4444" : cond ? (cond.convention === "rojo" ? "#ef4444" : cond.convention === "azul" ? "#2563eb" : cond.color) : "#ffffff";
        return (
          <rect
            key={key}
            x={x}
            y={y}
            width={BOX}
            height={BOX}
            fill={fill}
            stroke="#111111"
            strokeWidth="1.15"
            vectorEffect="non-scaling-stroke"
            className="cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onSurfaceClick(key, e as unknown as React.MouseEvent);
            }}
            role="button"
            tabIndex={0}
            aria-label={`Pieza ${pieza}, ${label}${cond ? `, ${cond.label}` : ""}`}
          >
            <title>{`Pieza ${pieza} · ${label}${cond ? ` · ${cond.label}` : ""}`}</title>
          </rect>
        );
      })}
      {circled && (
        <circle
          cx={CX}
          cy={CY}
          r={18.5}
          fill="none"
          stroke="#1e3a8a"
          strokeWidth="2"
          pointerEvents="none"
        />
      )}
    </svg>
  );
}

export const SurfaceCross = memo(SurfaceCrossInner);
