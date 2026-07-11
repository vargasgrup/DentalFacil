/**
 * Catálogo por defecto de especialidades odontológicas.
 * El centro puede personalizarlo en Configuración; SpecialtySelect
 * carga el catálogo activo desde la API.
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
  // Abreviatura genérica: primeras 6 letras + punto
  return value.length > 8 ? `${value.slice(0, 6)}.` : value;
}
