/**
 * Assets de dientes por pieza FDI.
 * Fuente: frontend/public/dientes/{pieza}.png (extraídos por el equipo clínico).
 */

import { toothKind } from "@/lib/odontogramConditions";

/** URL del PNG permanente adulto: /dientes/18.png */
export function toothPieceUrl(pieza: string): string {
  return `/dientes/${pieza}.png`;
}

/** ¿Existe asset dedicado? Solo permanentes 11–48. */
export function hasToothPieceAsset(pieza: string): boolean {
  const n = Number(pieza);
  if (!Number.isFinite(n)) return false;
  const q = Math.floor(n / 10);
  const p = n % 10;
  return q >= 1 && q <= 4 && p >= 1 && p <= 8;
}

export type ToothAssetKind =
  | "incisor"
  | "canine"
  | "premolar"
  | "molar_upper"
  | "molar_lower";

export function toothAssetKind(pieza: string): ToothAssetKind {
  const kind = toothKind(pieza);
  const q = Number(pieza[0]);
  const upper = q === 1 || q === 2 || q === 5 || q === 6;
  if (kind === "molar") return upper ? "molar_upper" : "molar_lower";
  return kind;
}

/** Fallback legacy (tipo anatómico) si faltara el PNG por pieza. */
export function toothReferenceUrl(pieza: string): string {
  if (hasToothPieceAsset(pieza)) return toothPieceUrl(pieza);
  return `/dientes/referencia/${toothAssetKind(pieza)}.png`;
}
