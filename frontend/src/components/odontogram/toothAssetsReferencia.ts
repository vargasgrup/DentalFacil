/**
 * Assets de dientes por pieza FDI.
 * Fuente: frontend/public/dientes/{pieza}.png (extraídos por el equipo clínico).
 *
 * Permanentes: 11–48.
 * Temporales (51–85): reutilizan el PNG permanente homólogo (51→11, 85→45, …).
 */

import { toothKind } from "@/lib/odontogramConditions";

/**
 * Homólogo permanente para reutilizar el mismo sprite realista.
 * 5→1, 6→2, 7→3, 8→4 (manteniendo el dígito de posición 1–8).
 */
export function permanentAssetPieza(pieza: string): string {
  const n = Number(pieza);
  if (!Number.isFinite(n) || pieza.length < 2) return pieza;
  const q = Math.floor(n / 10);
  const p = n % 10;
  if (q >= 1 && q <= 4) return pieza;
  if (q >= 5 && q <= 8 && p >= 1 && p <= 8) {
    const mapQ: Record<number, number> = { 5: 1, 6: 2, 7: 3, 8: 4 };
    return `${mapQ[q]}${p}`;
  }
  return pieza;
}

/** URL del PNG: /dientes/18.png (temporales → permanente homólogo). */
export function toothPieceUrl(pieza: string): string {
  return `/dientes/${permanentAssetPieza(pieza)}.png`;
}

/** ¿Hay PNG usable (directo o vía homólogo permanente)? */
export function hasToothPieceAsset(pieza: string): boolean {
  const asset = permanentAssetPieza(pieza);
  const n = Number(asset);
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
  const q = Number(permanentAssetPieza(pieza)[0]);
  const upper = q === 1 || q === 2;
  if (kind === "molar") return upper ? "molar_upper" : "molar_lower";
  return kind;
}

export function toothReferenceUrl(pieza: string): string {
  return toothPieceUrl(pieza);
}
