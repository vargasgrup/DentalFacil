/**
 * Patient age bands and lifecycle helpers for registration / ficha.
 * Age is always derived from fecha_nacimiento when present.
 */

export type AgeBandId = "bebe" | "nino" | "adolescente" | "adulto" | "mayor";

export type DocTipo =
  | "DNI"
  | "CE"
  | "PASAPORTE"
  | "SIN_DOC"
  | "EN_TRAMITE"
  | "OTRO";

export interface AgeBand {
  id: AgeBandId;
  label: string;
  shortAges: string;
  /** Inclusive max age; mayor uses Infinity. */
  maxAge: number;
  needsGuardian: boolean;
  docDefault: DocTipo;
  hint: string;
}

export const AGE_BANDS: AgeBand[] = [
  {
    id: "bebe",
    label: "Bebé",
    shortAges: "0–2",
    maxAge: 2,
    needsGuardian: true,
    docDefault: "SIN_DOC",
    hint: "Incluye apoderado; documento del niño opcional.",
  },
  {
    id: "nino",
    label: "Niño/a",
    shortAges: "3–11",
    maxAge: 11,
    needsGuardian: true,
    docDefault: "SIN_DOC",
    hint: "Apoderado obligatorio; celular del tutor para contacto.",
  },
  {
    id: "adolescente",
    label: "Adolescente",
    shortAges: "12–17",
    maxAge: 17,
    needsGuardian: true,
    docDefault: "DNI",
    hint: "Apoderado y contacto del responsable.",
  },
  {
    id: "adulto",
    label: "Adulto",
    shortAges: "18–59",
    maxAge: 59,
    needsGuardian: false,
    docDefault: "DNI",
    hint: "Registro estándar con DNI o carné / pasaporte.",
  },
  {
    id: "mayor",
    label: "Adulto mayor",
    shortAges: "60+",
    maxAge: 200,
    needsGuardian: false,
    docDefault: "DNI",
    hint: "Puede registrar un familiar de apoyo si lo desea.",
  },
];

export const PARENTESCO_OPTIONS = [
  "Madre",
  "Padre",
  "Tutor legal",
  "Abuelo/a",
  "Tío/a",
  "Hermano/a",
  "Cónyuge",
  "Hijo/a",
  "Cuidador/a",
  "Otro",
] as const;

export function calcAgeYears(fecha?: string | null, asOf: Date = new Date()): number | null {
  if (!fecha) return null;
  const born = new Date(`${fecha}T12:00:00`);
  if (Number.isNaN(born.getTime())) return null;
  let age = asOf.getFullYear() - born.getFullYear();
  const m = asOf.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && asOf.getDate() < born.getDate())) age -= 1;
  return age < 0 ? null : age;
}

export function bandFromAge(age: number | null): AgeBandId | null {
  if (age === null || age < 0) return null;
  if (age <= 2) return "bebe";
  if (age <= 11) return "nino";
  if (age <= 17) return "adolescente";
  if (age <= 59) return "adulto";
  return "mayor";
}

export function getAgeBand(id: AgeBandId): AgeBand {
  return AGE_BANDS.find((b) => b.id === id) || AGE_BANDS[3];
}

export function bandLabel(id: AgeBandId | null | undefined): string {
  if (!id) return "";
  return getAgeBand(id).label;
}

export function isMinor(
  age: number | null,
  band: AgeBandId | null | undefined
): boolean {
  if (age !== null) return age < 18;
  if (!band) return false;
  return getAgeBand(band).needsGuardian;
}

export function needsDocumentNumber(tipo: DocTipo | string): boolean {
  const t = (tipo || "DNI").toUpperCase();
  return t !== "SIN_DOC" && t !== "EN_TRAMITE";
}

export function docTipoLabel(tipo: string | undefined | null): string {
  switch ((tipo || "").toUpperCase()) {
    case "DNI":
      return "DNI";
    case "CE":
      return "Carné extranjería";
    case "PASAPORTE":
    case "PASAPORT":
      return "Pasaporte";
    case "SIN_DOC":
      return "Sin documento";
    case "EN_TRAMITE":
      return "En trámite";
    case "OTRO":
      return "Otro";
    default:
      return tipo || "Documento";
  }
}

export function formatAgeLabel(age: number | null, band?: AgeBandId | null): string {
  if (age === null) {
    return band ? bandLabel(band) : "Edad no indicada";
  }
  if (age === 0) return "Menos de 1 año";
  if (age === 1) return "1 año";
  return `${age} años`;
}
