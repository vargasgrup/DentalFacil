/**
 * Catálogo odontograma — grilla de referencia + patologías Fase 2.
 * Convención: rojo = patología/requiere tratamiento; azul = realizado/existente.
 */

export type SurfaceKey = "M" | "D" | "V" | "L" | "O";
export type Convention = "rojo" | "azul" | "neutro";

export interface OdontogramCondition {
  id: string;
  label: string;
  color: string;
  symbol: "x" | "diagonal" | "circle" | "lines" | null;
  convention: Convention;
}

export const ODONTOGRAM_CONDITIONS: OdontogramCondition[] = [
  { id: "caries", label: "Caries", color: "#ef4444", symbol: null, convention: "rojo" },
  { id: "corona", label: "Corona", color: "#3b82f6", symbol: null, convention: "azul" },
  { id: "corona_temp", label: "Corona (Temp.)", color: "#60a5fa", symbol: null, convention: "azul" },
  { id: "ausente", label: "Ausente", color: "#94a3b8", symbol: "x", convention: "neutro" },
  { id: "fractura", label: "Fractura", color: "#dc2626", symbol: "lines", convention: "rojo" },
  { id: "diastema", label: "Diastema", color: "#fde68a", symbol: null, convention: "neutro" },
  { id: "obturacion", label: "Obturación", color: "#2563eb", symbol: null, convention: "azul" },
  { id: "protesis_remov", label: "Prótesis Remov.", color: "#3b82f6", symbol: null, convention: "azul" },
  { id: "desplazamiento", label: "Desplazamiento", color: "#f97316", symbol: null, convention: "rojo" },
  { id: "rotacion", label: "Rotación", color: "#fb923c", symbol: null, convention: "rojo" },
  { id: "fusion", label: "Fusión", color: "#f59e0b", symbol: null, convention: "rojo" },
  { id: "remanente_rad", label: "Remanente Rad", color: "#a8a29e", symbol: null, convention: "rojo" },
  { id: "erupcion", label: "Erupción", color: "#86efac", symbol: null, convention: "neutro" },
  { id: "transposicion", label: "Transposición", color: "#f97316", symbol: null, convention: "rojo" },
  { id: "supernumerario", label: "Supernumerario", color: "#fbbf24", symbol: null, convention: "rojo" },
  { id: "pulpa", label: "Pulpa", color: "#ef4444", symbol: null, convention: "rojo" },
  { id: "protesis", label: "Prótesis", color: "#3b82f6", symbol: null, convention: "azul" },
  { id: "perno", label: "Perno", color: "#2563eb", symbol: null, convention: "azul" },
  { id: "ortodoncia_fija", label: "Ortodoncia Fija", color: "#3b82f6", symbol: null, convention: "azul" },
  { id: "protesis_fija", label: "Prótesis Fija", color: "#2563eb", symbol: null, convention: "azul" },
  { id: "implante", label: "Implante", color: "#1d4ed8", symbol: null, convention: "azul" },
  { id: "macrodoncia", label: "Macrodoncia", color: "#fbbf24", symbol: null, convention: "rojo" },
  { id: "microdoncia", label: "Microdoncia", color: "#fcd34d", symbol: null, convention: "rojo" },
  { id: "discromia", label: "Discromia", color: "#f472b6", symbol: null, convention: "rojo" },
  { id: "desgaste", label: "Desgaste", color: "#ef4444", symbol: null, convention: "rojo" },
  { id: "impactado_p", label: "Impactado/P", color: "#dc2626", symbol: null, convention: "rojo" },
  { id: "intrusion", label: "Intrusión", color: "#f97316", symbol: null, convention: "rojo" },
  { id: "edentulismo", label: "Edentulismo", color: "#e2e8f0", symbol: "x", convention: "neutro" },
  { id: "ectopico", label: "Ectópico", color: "#f97316", symbol: null, convention: "rojo" },
  { id: "impactado", label: "Impactado", color: "#dc2626", symbol: null, convention: "rojo" },
  { id: "ortod_remov", label: "Ortod. Remov", color: "#3b82f6", symbol: null, convention: "azul" },
  { id: "extrusion", label: "Extrusión", color: "#f97316", symbol: null, convention: "rojo" },
  { id: "poste", label: "Poste", color: "#2563eb", symbol: null, convention: "azul" },
  { id: "extraer", label: "Extraer", color: "#dc2626", symbol: "diagonal", convention: "rojo" },
  { id: "abrasion", label: "Abrasión", color: "#ef4444", symbol: null, convention: "rojo" },
  { id: "erosion", label: "Erosión", color: "#dc2626", symbol: null, convention: "rojo" },
  { id: "anomalia_des", label: "Anomalía desarr.", color: "#f59e0b", symbol: null, convention: "rojo" },
];

export const CYCLE_CONDITIONS = [
  "caries",
  "obturacion",
  "corona",
  "ausente",
  "extraer",
  "protesis_fija",
  "abrasion",
  "erosion",
];

export const EMPTY_SURFACES: Record<SurfaceKey, string | null> = {
  M: null,
  D: null,
  V: null,
  L: null,
  O: null,
};

export type Denticion = "permanente" | "temporal" | "mixta";

export const PERMANENT = {
  upperRight: ["18", "17", "16", "15", "14", "13", "12", "11"],
  upperLeft: ["21", "22", "23", "24", "25", "26", "27", "28"],
  lowerRight: ["48", "47", "46", "45", "44", "43", "42", "41"],
  lowerLeft: ["31", "32", "33", "34", "35", "36", "37", "38"],
};

export const TEMPORAL = {
  upperRight: ["55", "54", "53", "52", "51"],
  upperLeft: ["61", "62", "63", "64", "65"],
  lowerRight: ["85", "84", "83", "82", "81"],
  lowerLeft: ["71", "72", "73", "74", "75"],
};

/** Dentición mixta: permanentes + temporales en filas paralelas de numeración */
export const MIXED = {
  permanent: PERMANENT,
  temporal: TEMPORAL,
};

export type ToothKind = "incisor" | "canine" | "premolar" | "molar";

export function toothKind(pieza: string): ToothKind {
  const n = Number(pieza[1]);
  if (n === 1 || n === 2) return "incisor";
  if (n === 3) return "canine";
  if (n === 4 || n === 5) return "premolar";
  return "molar";
}

export function conditionById(id: string | null | undefined): OdontogramCondition | null {
  if (!id) return null;
  return ODONTOGRAM_CONDITIONS.find((c) => c.id === id) || null;
}

export const HEALTHY_TOOTH_COLOR = "#f5f0e8";

/** Color clínico: rojo/azul de convención, o catálogo */
export function conditionFillColor(estado: string | null | undefined): string {
  if (!estado || estado === "sano") return HEALTHY_TOOTH_COLOR;
  const c = conditionById(estado);
  if (!c) return HEALTHY_TOOTH_COLOR;
  if (c.convention === "rojo") return "#ef4444";
  if (c.convention === "azul") return "#2563eb";
  return c.color;
}

export const REFERENCE_DEMO_MARKS: {
  pieza: string;
  estado: string | null;
  superficies?: Partial<Record<SurfaceKey, string>>;
  note: string;
}[] = [
  { pieza: "18", estado: "caries", note: "Rojo patología" },
  { pieza: "17", estado: "caries", note: "Rojo" },
  { pieza: "16", estado: "caries", note: "Rojo" },
  { pieza: "15", estado: "protesis_fija", note: "Azul realizado" },
  {
    pieza: "14",
    estado: "protesis_fija",
    superficies: { M: "caries", D: "caries", O: "caries" },
    note: "Azul + superficies rojas",
  },
  { pieza: "13", estado: "protesis_fija", note: "Azul" },
  {
    pieza: "12",
    estado: "protesis_fija",
    superficies: { O: "obturacion" },
    note: "Azul + círculo",
  },
  { pieza: "11", estado: "extraer", note: "Diagonal roja" },
  { pieza: "21", estado: "protesis_fija", note: "Azul" },
  { pieza: "22", estado: "protesis_fija", note: "Azul" },
  { pieza: "23", estado: "protesis_fija", note: "Azul" },
  { pieza: "24", estado: "ausente", note: "X" },
  { pieza: "25", estado: "protesis_fija", note: "Azul" },
  { pieza: "26", estado: "erupcion", note: "Neutro" },
  { pieza: "27", estado: "erupcion", note: "Neutro" },
  { pieza: "28", estado: "erupcion", note: "Neutro" },
  { pieza: "45", estado: "discromia", note: "Rosado" },
  { pieza: "44", estado: "discromia", note: "Rosado" },
  { pieza: "43", estado: "discromia", note: "Rosado" },
  { pieza: "42", estado: "discromia", note: "Rosado" },
  { pieza: "41", estado: "discromia", note: "Rosado" },
  { pieza: "31", estado: "discromia", note: "Rosado" },
  { pieza: "32", estado: "discromia", note: "Rosado" },
  { pieza: "33", estado: "discromia", note: "Rosado" },
  { pieza: "34", estado: "discromia", note: "Rosado" },
  { pieza: "35", estado: "discromia", note: "Rosado" },
  { pieza: "36", estado: "fractura", note: "Líneas" },
];
