/**
 * Catálogo por defecto de especialidades odontológicas.
 * El centro puede personalizarlo en Configuración; SpecialtySelect / SpecialtyMultiSelect
 * cargan el catálogo activo desde la API.
 */

export const ESPECIALIDADES_ODONTOLOGICAS = [
  "Odontología general",
  "Rehabilitación oral",
  "Ortodoncia",
  "Endodoncia",
  "Cirugía bucal y maxilofacial",
  "Prótesis dental",
  "Implantología oral",
  "Estética dental",
  "Otros",
] as const;

export type EspecialidadOdontologica = (typeof ESPECIALIDADES_ODONTOLOGICAS)[number] | string;

export function isEspecialidadKnown(value: string | null | undefined): boolean {
  if (!value) return false;
  return (ESPECIALIDADES_ODONTOLOGICAS as readonly string[]).includes(value);
}

/** Abreviatura corta para tablas densas */
export function especialidadShort(value: string | null | undefined): string {
  if (!value) return "—";
  const map: Record<string, string> = {
    "Odontología general": "General",
    "Rehabilitación oral": "Rehab.",
    Ortodoncia: "Ortod.",
    Endodoncia: "Endod.",
    "Cirugía bucal y maxilofacial": "Cirugía",
    "Prótesis dental": "Prótesis",
    "Implantología oral": "Implantes",
    "Estética dental": "Estética",
    Otros: "Otros",
  };
  if (map[value]) return map[value];
  return value.length > 8 ? `${value.slice(0, 6)}.` : value;
}

/** Lista efectiva de especialidades del paciente (multi + legado). */
export function resolvePatientEspecialidades(patient: {
  especialidad?: string | null;
  especialidades?: string[] | null;
}): string[] {
  const multi = patient.especialidades;
  if (Array.isArray(multi) && multi.length > 0) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of multi) {
      const s = String(raw || "").trim();
      if (!s) continue;
      const k = s.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(s);
    }
    return out;
  }
  const one = (patient.especialidad || "").trim();
  return one ? [one] : [];
}

/** Etiqueta corta para listados (p. ej. "Ortod. · Endod."). */
export function formatEspecialidadesShort(list: string[] | null | undefined): string {
  if (!list || !list.length) return "—";
  return list.map((s) => especialidadShort(s)).join(" · ");
}

/** Título completo para tooltip. */
export function formatEspecialidadesFull(list: string[] | null | undefined): string {
  if (!list || !list.length) return "";
  return list.join(" · ");
}
