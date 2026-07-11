/** FDI ↔ Universal (ADA) — nomenclatura estandarizada. */

export type NumberingSystem = "fdi" | "universal";

const FDI_TO_UNIVERSAL_PERM: Record<string, string> = {
  "18": "1", "17": "2", "16": "3", "15": "4", "14": "5", "13": "6", "12": "7", "11": "8",
  "21": "9", "22": "10", "23": "11", "24": "12", "25": "13", "26": "14", "27": "15", "28": "16",
  "38": "17", "37": "18", "36": "19", "35": "20", "34": "21", "33": "22", "32": "23", "31": "24",
  "41": "25", "42": "26", "43": "27", "44": "28", "45": "29", "46": "30", "47": "31", "48": "32",
};

const FDI_TO_UNIVERSAL_TEMP: Record<string, string> = {
  "55": "A", "54": "B", "53": "C", "52": "D", "51": "E",
  "61": "F", "62": "G", "63": "H", "64": "I", "65": "J",
  "75": "K", "74": "L", "73": "M", "72": "N", "71": "O",
  "81": "P", "82": "Q", "83": "R", "84": "S", "85": "T",
};

const UNIVERSAL_TO_FDI: Record<string, string> = Object.fromEntries([
  ...Object.entries(FDI_TO_UNIVERSAL_PERM).map(([f, u]) => [u, f]),
  ...Object.entries(FDI_TO_UNIVERSAL_TEMP).map(([f, u]) => [u, f]),
  ...Object.entries(FDI_TO_UNIVERSAL_TEMP).map(([f, u]) => [u.toLowerCase(), f]),
]);

export function fdiToUniversal(piezaFdi: string): string {
  return FDI_TO_UNIVERSAL_PERM[piezaFdi] || FDI_TO_UNIVERSAL_TEMP[piezaFdi] || piezaFdi;
}

export function universalToFdi(codigo: string): string {
  const k = codigo.trim();
  return UNIVERSAL_TO_FDI[k] || UNIVERSAL_TO_FDI[k.toUpperCase()] || codigo;
}

export function displayToothLabel(piezaFdi: string, sistema: NumberingSystem = "fdi"): string {
  return sistema === "universal" ? fdiToUniversal(piezaFdi) : piezaFdi;
}

/** Infer storage dentition from FDI number */
export function denticionOfPieza(piezaFdi: string): "permanente" | "temporal" {
  const q = Number(piezaFdi[0]);
  return q >= 5 ? "temporal" : "permanente";
}
