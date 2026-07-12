/**
 * Paths SVG (espacio 0–100) para zonas cliqueables sobre cada imagen dental.
 * Se adaptan por tipo de diente; se proyectan a coordenadas Konva del diente.
 */

import { toothKind } from "@/lib/odontogramConditions";
import type { SurfaceKey } from "@/lib/odontogramConditions";

export type ZonaId =
  | "vestibular"
  | "lingual"
  | "mesial"
  | "distal"
  | "oclusal"
  | "raiz_mesial"
  | "raiz_distal"
  | "raiz_palatina"
  | "furca";

export interface ZonaTratamiento {
  id: ZonaId;
  nombre: string;
  /** Path en viewBox 0–100 */
  path: string;
  /** Mapeo a superficie API MDVLO; null = aplica estado general del diente */
  surface: SurfaceKey | null;
}

const ZONAS_INCISOR: ZonaTratamiento[] = [
  {
    id: "oclusal",
    nombre: "Borde incisal",
    path: "M 30,8 C 40,4 60,4 70,8 L 72,18 L 28,18 Z",
    surface: "O",
  },
  {
    id: "vestibular",
    nombre: "Cara vestibular",
    path: "M 28,18 C 32,22 68,22 72,18 L 74,48 C 70,58 30,58 26,48 Z",
    surface: "V",
  },
  {
    id: "mesial",
    nombre: "Cara mesial",
    path: "M 24,20 C 18,28 16,50 22,58 L 32,56 L 34,22 Z",
    surface: "M",
  },
  {
    id: "distal",
    nombre: "Cara distal",
    path: "M 76,20 C 82,28 84,50 78,58 L 68,56 L 66,22 Z",
    surface: "D",
  },
  {
    id: "raiz_mesial",
    nombre: "Raíz",
    path: "M 40,58 C 38,72 42,88 50,96 C 58,88 62,72 60,58 Z",
    surface: null,
  },
];

const ZONAS_CANINE: ZonaTratamiento[] = [
  {
    id: "oclusal",
    nombre: "Cúspide",
    path: "M 42,4 C 48,0 52,0 58,4 L 62,16 L 38,16 Z",
    surface: "O",
  },
  {
    id: "vestibular",
    nombre: "Cara vestibular",
    path: "M 30,16 C 36,22 64,22 70,16 L 74,50 C 68,60 32,60 26,50 Z",
    surface: "V",
  },
  {
    id: "mesial",
    nombre: "Cara mesial",
    path: "M 24,18 C 16,30 14,52 22,60 L 34,56 L 36,20 Z",
    surface: "M",
  },
  {
    id: "distal",
    nombre: "Cara distal",
    path: "M 76,18 C 84,30 86,52 78,60 L 66,56 L 64,20 Z",
    surface: "D",
  },
  {
    id: "raiz_mesial",
    nombre: "Raíz",
    path: "M 40,58 C 36,74 42,90 50,98 C 58,90 64,74 60,58 Z",
    surface: null,
  },
];

const ZONAS_PREMOLAR: ZonaTratamiento[] = [
  {
    id: "oclusal",
    nombre: "Cara oclusal",
    path: "M 28,10 C 40,4 60,4 72,10 C 74,16 70,22 50,20 C 30,22 26,16 28,10 Z",
    surface: "O",
  },
  {
    id: "vestibular",
    nombre: "Cara vestibular",
    path: "M 26,20 C 34,28 66,28 74,20 L 78,52 C 70,62 30,62 22,52 Z",
    surface: "V",
  },
  {
    id: "mesial",
    nombre: "Cara mesial",
    path: "M 20,22 C 12,34 10,54 18,62 L 32,58 L 34,24 Z",
    surface: "M",
  },
  {
    id: "distal",
    nombre: "Cara distal",
    path: "M 80,22 C 88,34 90,54 82,62 L 68,58 L 66,24 Z",
    surface: "D",
  },
  {
    id: "raiz_mesial",
    nombre: "Raíz mesial",
    path: "M 28,60 C 22,74 20,90 28,98 C 36,92 40,74 40,62 Z",
    surface: null,
  },
  {
    id: "raiz_distal",
    nombre: "Raíz distal",
    path: "M 60,62 C 60,74 64,92 72,98 C 80,90 78,74 72,60 Z",
    surface: null,
  },
  {
    id: "furca",
    nombre: "Furca",
    path: "M 40,60 L 60,60 L 50,70 Z",
    surface: null,
  },
];

const ZONAS_MOLAR: ZonaTratamiento[] = [
  {
    id: "oclusal",
    nombre: "Cara oclusal",
    path: "M 22,8 C 38,2 62,2 78,8 C 82,14 76,22 50,20 C 24,22 18,14 22,8 Z",
    surface: "O",
  },
  {
    id: "vestibular",
    nombre: "Cara vestibular",
    path: "M 20,20 C 30,30 70,30 80,20 L 86,54 C 76,66 24,66 14,54 Z",
    surface: "V",
  },
  {
    id: "mesial",
    nombre: "Cara mesial",
    path: "M 14,22 C 6,36 4,56 12,66 L 28,62 L 30,24 Z",
    surface: "M",
  },
  {
    id: "distal",
    nombre: "Cara distal",
    path: "M 86,22 C 94,36 96,56 88,66 L 72,62 L 70,24 Z",
    surface: "D",
  },
  {
    id: "raiz_mesial",
    nombre: "Raíz mesial",
    path: "M 22,64 C 14,78 12,92 20,99 C 30,94 36,78 38,66 Z",
    surface: null,
  },
  {
    id: "raiz_distal",
    nombre: "Raíz distal",
    path: "M 62,66 C 64,78 70,94 80,99 C 88,92 86,78 78,64 Z",
    surface: null,
  },
  {
    id: "raiz_palatina",
    nombre: "Raíz palatina / lingual",
    path: "M 42,66 C 40,82 44,96 50,100 C 56,96 60,82 58,66 Z",
    surface: null,
  },
  {
    id: "furca",
    nombre: "Zona de furca",
    path: "M 34,62 L 66,62 L 50,74 Z",
    surface: null,
  },
];

/** Zonas linguales = mismas caras con énfasis en L */
const LINGUAL_OVERRIDE: Partial<Record<ZonaId, SurfaceKey | null>> = {
  vestibular: "L",
};

export function zonasParaPieza(pieza: string, vista: "vestibular" | "lingual" | "oclusal" = "vestibular"): ZonaTratamiento[] {
  const kind = toothKind(pieza);
  let base =
    kind === "incisor"
      ? ZONAS_INCISOR
      : kind === "canine"
        ? ZONAS_CANINE
        : kind === "premolar"
          ? ZONAS_PREMOLAR
          : ZONAS_MOLAR;

  if (vista === "oclusal") {
    return base.filter((z) => z.id === "oclusal" || z.id === "mesial" || z.id === "distal" || z.id === "vestibular");
  }

  if (vista === "lingual") {
    return base.map((z) => ({
      ...z,
      surface: LINGUAL_OVERRIDE[z.id] !== undefined ? LINGUAL_OVERRIDE[z.id]! : z.surface,
      nombre: z.id === "vestibular" ? "Cara lingual / palatina" : z.nombre,
    }));
  }

  return base;
}

/** Escala path 0–100 → rectángulo del diente en el stage (opcional; Konva usa Group scale). */
export function scalePathToBox(path: string, x: number, y: number, w: number, h: number): string {
  const tokens = path.match(/[MLCZmlcz]|-?\d+\.?\d*/g) || [];
  let numIdx = 0;
  return tokens
    .map((tok) => {
      if (/^[MLCZmlcz]$/.test(tok)) return tok;
      const n = parseFloat(tok);
      const isX = numIdx % 2 === 0;
      numIdx += 1;
      const scaled = isX ? x + (n / 100) * w : y + (n / 100) * h;
      return String(Math.round(scaled * 100) / 100);
    })
    .join(" ")
    .replace(/ ([MLCZmlcz])/g, "$1");
}
