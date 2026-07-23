import { PERMANENT, TEMPORAL, toothKind, type Denticion } from "@/lib/odontogramConditions";
import type { VistaDiente } from "./cargadorImagenes";

export const NOMBRE_DIENTE: Record<string, string> = {
  "11": "Incisivo central superior derecho",
  "12": "Incisivo lateral superior derecho",
  "13": "Canino superior derecho",
  "14": "1.er premolar superior derecho",
  "15": "2.º premolar superior derecho",
  "16": "1.er molar superior derecho",
  "17": "2.º molar superior derecho",
  "18": "3.er molar superior derecho",
  "21": "Incisivo central superior izquierdo",
  "22": "Incisivo lateral superior izquierdo",
  "23": "Canino superior izquierdo",
  "24": "1.er premolar superior izquierdo",
  "25": "2.º premolar superior izquierdo",
  "26": "1.er molar superior izquierdo",
  "27": "2.º molar superior izquierdo",
  "28": "3.er molar superior izquierdo",
  "31": "Incisivo central inferior izquierdo",
  "32": "Incisivo lateral inferior izquierdo",
  "33": "Canino inferior izquierdo",
  "34": "1.er premolar inferior izquierdo",
  "35": "2.º premolar inferior izquierdo",
  "36": "1.er molar inferior izquierdo",
  "37": "2.º molar inferior izquierdo",
  "38": "3.er molar inferior izquierdo",
  "41": "Incisivo central inferior derecho",
  "42": "Incisivo lateral inferior derecho",
  "43": "Canino inferior derecho",
  "44": "1.er premolar inferior derecho",
  "45": "2.º premolar inferior derecho",
  "46": "1.er molar inferior derecho",
  "47": "2.º molar inferior derecho",
  "48": "3.er molar inferior derecho",
};

/** Ancho relativo (oclusal) — molares más anchos */
export function anchoRelativo(pieza: string): number {
  const k = toothKind(pieza);
  if (k === "molar") return 1.15;
  if (k === "premolar") return 0.95;
  if (k === "canine") return 0.85;
  return 0.78;
}

export function secuenciaArcada(denticion: Denticion): {
  upper: string[];
  lower: string[];
  upperRightLen: number;
  lowerRightLen: number;
} {
  const arches = denticion === "temporal" ? TEMPORAL : PERMANENT;
  return {
    upper: [...arches.upperRight, ...arches.upperLeft],
    lower: [...arches.lowerRight, ...arches.lowerLeft],
    upperRightLen: arches.upperRight.length,
    lowerRightLen: arches.lowerRight.length,
  };
}

export const COLORES_OVERLAY: Record<string, string> = {
  caries: "rgba(239, 68, 68, 0.38)",
  obturacion: "rgba(37, 99, 235, 0.38)",
  pulpa: "rgba(255, 140, 0, 0.42)",
  corona: "rgba(100, 116, 139, 0.45)",
  implante: "rgba(22, 163, 74, 0.35)",
  ausente: "rgba(239, 68, 68, 0.18)",
  extraer: "rgba(220, 38, 38, 0.35)",
  fractura: "rgba(220, 38, 38, 0.4)",
  default: "rgba(37, 99, 235, 0.32)",
};

export function colorOverlay(condicionId: string | null | undefined): string {
  if (!condicionId) return "transparent";
  return COLORES_OVERLAY[condicionId] || COLORES_OVERLAY.default;
}

export const VISTAS_DISPONIBLES: VistaDiente[] = ["vestibular", "lingual", "oclusal"];

export function labelVista(v: VistaDiente): string {
  if (v === "vestibular") return "Vestibular";
  if (v === "lingual") return "Lingual / Palatino";
  return "Oclusal";
}
