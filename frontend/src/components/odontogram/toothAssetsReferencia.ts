/**
 * Sprites anatómicos extraídos de docs/Odontograma.jpg (referencia clínica M&D).
 */
import { toothKind } from "@/lib/odontogramConditions";

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

export function toothReferenceUrl(pieza: string): string {
  return `/dientes/referencia/${toothAssetKind(pieza)}.png`;
}

export function toothReferencePieceUrl(pieza: string): string {
  return `/dientes/referencia/${pieza}_vestibular.png`;
}
