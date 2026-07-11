/**
 * Catálogo de tratamientos odontológicos de uso habitual en clínicas del Perú.
 * Incluye alias y sinónimos para búsqueda predictiva (p. ej. "curacion" → Curación).
 */

import type { EspecialidadOdontologica } from "@/lib/especialidades";

export interface TratamientoOdontologico {
  id: string;
  /** Nombre canónico para registrar en formularios */
  nombre: string;
  especialidad: EspecialidadOdontologica;
  /** Sinónimos, abreviaturas y variantes ortográficas (sin tildes) */
  aliases: string[];
  /** Precio referencial en S/ (editable al registrar) */
  precio_referencial?: number;
}

export const TRATAMIENTOS_ODONTOLOGICOS: readonly TratamientoOdontologico[] = [
  // ——— Odontología general ———
  {
    id: "consulta",
    nombre: "Consulta odontológica",
    especialidad: "Odontología general",
    aliases: ["consulta", "evaluacion", "examen", "primera consulta", "control"],
    precio_referencial: 50,
  },
  {
    id: "urgencia",
    nombre: "Atención de urgencia",
    especialidad: "Odontología general",
    aliases: ["urgencia", "dolor", "emergencia", "consulta urgencia"],
    precio_referencial: 80,
  },
  {
    id: "profilaxis",
    nombre: "Profilaxis / limpieza dental",
    especialidad: "Odontología general",
    aliases: ["profilaxis", "limpieza", "higiene", "detartraje", "tartrectomia", "pulido"],
    precio_referencial: 80,
  },
  {
    id: "fluor",
    nombre: "Aplicación de flúor",
    especialidad: "Odontología general",
    aliases: ["fluor", "fluoracion", "barniz de fluor", "fluoruro"],
    precio_referencial: 40,
  },
  {
    id: "sellantes",
    nombre: "Sellantes de fosas y fisuras",
    especialidad: "Odontología general",
    aliases: ["sellante", "sellantes", "fosas y fisuras", "preventivo"],
    precio_referencial: 50,
  },
  {
    id: "curacion-resina",
    nombre: "Curación / obturación con resina",
    especialidad: "Odontología general",
    aliases: [
      "curacion",
      "curación",
      "obturacion",
      "obturación",
      "resina",
      "composite",
      "empaste",
      "relleno",
      "restauracion",
      "restauración",
    ],
    precio_referencial: 100,
  },
  {
    id: "curacion-amalgama",
    nombre: "Curación / obturación con amalgama",
    especialidad: "Odontología general",
    aliases: ["amalgama", "curacion amalgama", "obturacion amalgama"],
    precio_referencial: 80,
  },
  {
    id: "curacion-temporal",
    nombre: "Curación temporal / obturación provisional",
    especialidad: "Odontología general",
    aliases: ["temporal", "provisional", "curacion temporal", "obturacion temporal", "cavit"],
    precio_referencial: 40,
  },
  {
    id: "recubrimiento-pulpar",
    nombre: "Recubrimiento pulpar",
    especialidad: "Odontología general",
    aliases: ["recubrimiento pulpar", "pulpar", "proteccion pulpar", "mta"],
    precio_referencial: 120,
  },
  {
    id: "desgaste-selectivo",
    nombre: "Desgaste selectivo / ajuste oclusal",
    especialidad: "Odontología general",
    aliases: ["desgaste", "ajuste oclusal", "tallado selectivo", "oclusion"],
    precio_referencial: 60,
  },
  {
    id: "radiografia-periapical",
    nombre: "Radiografía periapical",
    especialidad: "Odontología general",
    aliases: ["rx", "radiografia", "rayos x", "periapical", "placa"],
    precio_referencial: 25,
  },
  {
    id: "radiografia-panoramica",
    nombre: "Radiografía panorámica",
    especialidad: "Odontología general",
    aliases: ["panoramica", "ortopantomografia", "rx panoramica"],
    precio_referencial: 80,
  },
  {
    id: "interconsulta",
    nombre: "Interconsulta / derivación",
    especialidad: "Odontología general",
    aliases: ["interconsulta", "derivacion", "referencia"],
    precio_referencial: 0,
  },

  // ——— Endodoncia ———
  {
    id: "endo-uni",
    nombre: "Endodoncia unirradicular",
    especialidad: "Endodoncia",
    aliases: [
      "endodoncia",
      "tratamiento de conducto",
      "conducto",
      "unirradicular",
      "unirr",
      "pieza anterior",
    ],
    precio_referencial: 280,
  },
  {
    id: "endo-bi",
    nombre: "Endodoncia birradicular",
    especialidad: "Endodoncia",
    aliases: ["birradicular", "birradicular", "premolar", "endodoncia premolar"],
    precio_referencial: 350,
  },
  {
    id: "endo-multi",
    nombre: "Endodoncia multirradicular",
    especialidad: "Endodoncia",
    aliases: ["multirradicular", "molar", "endodoncia molar", "3 conductos"],
    precio_referencial: 450,
  },
  {
    id: "reendo",
    nombre: "Retratamiento endodóntico",
    especialidad: "Endodoncia",
    aliases: ["retratamiento", "reendo", "re endodoncia", "retiro de gutapercha"],
    precio_referencial: 500,
  },
  {
    id: "apicectomia",
    nombre: "Apicectomía",
    especialidad: "Endodoncia",
    aliases: ["apicectomia", "cirugia apical", "resección apical"],
    precio_referencial: 400,
  },
  {
    id: "pulpotomia",
    nombre: "Pulpotomía",
    especialidad: "Endodoncia",
    aliases: ["pulpotomia", "pulpa", "vitalidad"],
    precio_referencial: 150,
  },
  {
    id: "pulpectomia",
    nombre: "Pulpectomía",
    especialidad: "Endodoncia",
    aliases: ["pulpectomia", "nino", "pediatrico"],
    precio_referencial: 180,
  },

  // ——— Cirugía ———
  {
    id: "exodoncia-simple",
    nombre: "Exodoncia simple",
    especialidad: "Cirugía bucal y maxilofacial",
    aliases: [
      "exodoncia",
      "extraccion",
      "sacar diente",
      "extraer",
      "extraccion dental",
      "simple",
    ],
    precio_referencial: 100,
  },
  {
    id: "exodoncia-quirurgica",
    nombre: "Exodoncia quirúrgica",
    especialidad: "Cirugía bucal y maxilofacial",
    aliases: ["exodoncia quirurgica", "extraccion quirurgica", "osteotomia", "retencion"],
    precio_referencial: 250,
  },
  {
    id: "cordal",
    nombre: "Extracción de cordal / tercer molar",
    especialidad: "Cirugía bucal y maxilofacial",
    aliases: [
      "cordal",
      "tercer molar",
      "muela del juicio",
      "juicio",
      "incluido",
      "impactado",
      "semiincluido",
    ],
    precio_referencial: 350,
  },
  {
    id: "frenectomia",
    nombre: "Frenectomía",
    especialidad: "Cirugía bucal y maxilofacial",
    aliases: ["frenectomia", "frenillo", "labial", "lingual"],
    precio_referencial: 200,
  },
  {
    id: "quistectomia",
    nombre: "Quistectomía / biopsia",
    especialidad: "Cirugía bucal y maxilofacial",
    aliases: ["quiste", "quistectomia", "biopsia", "lesion"],
    precio_referencial: 400,
  },
  {
    id: "alveoloplastia",
    nombre: "Alveoloplastia",
    especialidad: "Cirugía bucal y maxilofacial",
    aliases: ["alveoloplastia", "remodelado oseo", "preparacion protesica"],
    precio_referencial: 180,
  },
  {
    id: "sutura",
    nombre: "Sutura / control postoperatorio",
    especialidad: "Cirugía bucal y maxilofacial",
    aliases: ["sutura", "puntos", "retiro de puntos", "postoperatorio", "control post"],
    precio_referencial: 40,
  },

  // ——— Periodoncia (bajo general / cirugía según práctica clínica) ———
  {
    id: "raspado",
    nombre: "Raspado y alisado radicular",
    especialidad: "Odontología general",
    aliases: [
      "raspado",
      "alisado",
      "periodontal",
      "curetaje",
      "detartraje profundo",
      "bolsas",
    ],
    precio_referencial: 150,
  },
  {
    id: "gingivectomia",
    nombre: "Gingivectomía / gingivoplastia",
    especialidad: "Cirugía bucal y maxilofacial",
    aliases: ["gingivectomia", "gingivoplastia", "encias", "sonrisa gingival"],
    precio_referencial: 280,
  },

  // ——— Prótesis / rehabilitación ———
  {
    id: "corona-mp",
    nombre: "Corona metal-porcelana",
    especialidad: "Prótesis dental",
    aliases: ["corona", "metal porcelana", "pfm", "funda", "corona dental"],
    precio_referencial: 450,
  },
  {
    id: "corona-zirconio",
    nombre: "Corona de zirconio",
    especialidad: "Prótesis dental",
    aliases: ["zirconio", "zirconia", "corona zirconio", "corona estetica"],
    precio_referencial: 700,
  },
  {
    id: "corona-emax",
    nombre: "Corona de disilicato de litio (E.max)",
    especialidad: "Prótesis dental",
    aliases: ["emax", "e.max", "disilicato", "litio"],
    precio_referencial: 750,
  },
  {
    id: "corona-temporal",
    nombre: "Corona temporal / provisional",
    especialidad: "Prótesis dental",
    aliases: ["corona temporal", "provisional", "acarilico"],
    precio_referencial: 120,
  },
  {
    id: "incrustacion",
    nombre: "Incrustación (inlay / onlay)",
    especialidad: "Rehabilitación oral",
    aliases: ["incrustacion", "inlay", "onlay", "overlay"],
    precio_referencial: 400,
  },
  {
    id: "perno-munon",
    nombre: "Perno muñón / poste",
    especialidad: "Rehabilitación oral",
    aliases: ["perno", "munon", "muñón", "poste", "perno munon", "fibra de vidrio"],
    precio_referencial: 180,
  },
  {
    id: "protesis-parcial",
    nombre: "Prótesis parcial removible",
    especialidad: "Prótesis dental",
    aliases: ["protesis parcial", "ppr", "removible", "parcial", "esqueleto"],
    precio_referencial: 600,
  },
  {
    id: "protesis-total",
    nombre: "Prótesis total / completa",
    especialidad: "Prótesis dental",
    aliases: ["protesis total", "completa", "dentadura", "placa total"],
    precio_referencial: 800,
  },
  {
    id: "protesis-fija",
    nombre: "Puente / prótesis fija",
    especialidad: "Prótesis dental",
    aliases: ["puente", "protesis fija", "fixed", "pontico"],
    precio_referencial: 900,
  },
  {
    id: "rebasing",
    nombre: "Rebasing / reparación de prótesis",
    especialidad: "Prótesis dental",
    aliases: ["rebasing", "rebasado", "reparacion protesis", "ajuste protesis"],
    precio_referencial: 150,
  },

  // ——— Implantología ———
  {
    id: "implante",
    nombre: "Implante dental (colocación)",
    especialidad: "Implantología oral",
    aliases: ["implante", "implante dental", "tornillo", "osteointegracion"],
    precio_referencial: 1800,
  },
  {
    id: "corona-implante",
    nombre: "Corona sobre implante",
    especialidad: "Implantología oral",
    aliases: ["corona implante", "protesis sobre implante", "pilar"],
    precio_referencial: 900,
  },
  {
    id: "elevacion-seno",
    nombre: "Elevación de seno maxilar",
    especialidad: "Implantología oral",
    aliases: ["seno", "elevacion de seno", "sinus lift", "injerto oseo"],
    precio_referencial: 1500,
  },
  {
    id: "regeneracion-osea",
    nombre: "Regeneración ósea guiada",
    especialidad: "Implantología oral",
    aliases: ["regeneracion", "injerto", "hueso", "rog", "membrana"],
    precio_referencial: 800,
  },

  // ——— Ortodoncia ———
  {
    id: "ortodoncia-fija",
    nombre: "Ortodoncia fija (brackets)",
    especialidad: "Ortodoncia",
    aliases: [
      "ortodoncia",
      "brackets",
      "braquets",
      "frenos",
      "aparato fijo",
      "ortodoncia fija",
    ],
    precio_referencial: 2500,
  },
  {
    id: "ortodoncia-control",
    nombre: "Control / cuota de ortodoncia",
    especialidad: "Ortodoncia",
    aliases: ["control ortodoncia", "cuota", "mensualidad", "ajuste brackets", "activacion"],
    precio_referencial: 150,
  },
  {
    id: "alineadores",
    nombre: "Alineadores transparentes",
    especialidad: "Ortodoncia",
    aliases: ["alineadores", "invisalign", "transparentes", "ferulas ortodonticas"],
    precio_referencial: 4500,
  },
  {
    id: "retenedor",
    nombre: "Retenedor ortodóntico",
    especialidad: "Ortodoncia",
    aliases: ["retenedor", "contencion", "essix", "hawley"],
    precio_referencial: 200,
  },
  {
    id: "ortodoncia-removible",
    nombre: "Ortodoncia removible / aparato funcional",
    especialidad: "Ortodoncia",
    aliases: ["aparato removible", "funcional", "placa ortodontica"],
    precio_referencial: 800,
  },

  // ——— Estética ———
  {
    id: "blanqueamiento",
    nombre: "Blanqueamiento dental",
    especialidad: "Estética dental",
    aliases: [
      "blanqueamiento",
      "blanquear",
      "whitening",
      "aclarar",
      "peroxido",
      "discromia",
    ],
    precio_referencial: 350,
  },
  {
    id: "carillas",
    nombre: "Carillas estéticas",
    especialidad: "Estética dental",
    aliases: ["carilla", "carillas", "veneers", "laminados"],
    precio_referencial: 600,
  },
  {
    id: "contorneado",
    nombre: "Contorneado estético / remodelado",
    especialidad: "Estética dental",
    aliases: ["contorneado", "remodelado", "estetico", "sonrisa"],
    precio_referencial: 200,
  },
  {
    id: "resina-estetica",
    nombre: "Resina estética / cierre de diastema",
    especialidad: "Estética dental",
    aliases: ["diastema", "cierre diastema", "resina estetica", "bonding"],
    precio_referencial: 180,
  },

  // ——— Rehabilitación oral ———
  {
    id: "rehab-integral",
    nombre: "Rehabilitación oral integral",
    especialidad: "Rehabilitación oral",
    aliases: ["rehabilitacion", "rehab", "rehabilitacion oral", "tratamiento integral"],
    precio_referencial: 0,
  },
  {
    id: "placa-bruxismo",
    nombre: "Placa de bruxismo / férula oclusal",
    especialidad: "Rehabilitación oral",
    aliases: ["bruxismo", "ferula", "placa oclusal", "protector nocturno", "miorrelajante"],
    precio_referencial: 250,
  },
  {
    id: "protesis-provisional",
    nombre: "Prótesis provisional de rehabilitación",
    especialidad: "Rehabilitación oral",
    aliases: ["provisional rehab", "protesis temporal"],
    precio_referencial: 300,
  },

  // ——— Conceptos de cobro frecuentes (caja / abonos) ———
  {
    id: "abono",
    nombre: "Abono a tratamiento",
    especialidad: "Otros",
    aliases: ["abono", "adelanto", "pago parcial", "a cuenta", "cuota"],
    precio_referencial: 0,
  },
  {
    id: "saldo-tratamiento",
    nombre: "Cancelación de saldo",
    especialidad: "Otros",
    aliases: ["saldo", "cancelacion", "pago final", "liquidacion"],
    precio_referencial: 0,
  },
] as const;

/** Quita tildes y normaliza para comparación. */
export function normalizeSearchText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface TratamientoMatch {
  tratamiento: TratamientoOdontologico;
  score: number;
}

/**
 * Búsqueda predictiva por nombre, alias y especialidad.
 * Tolera tildes omitidas y coincidencias parciales por token.
 */
export function searchTratamientos(
  query: string,
  limit = 10
): TratamientoMatch[] {
  const q = normalizeSearchText(query);
  if (!q) {
    return TRATAMIENTOS_ODONTOLOGICOS.slice(0, limit).map((tratamiento) => ({
      tratamiento,
      score: 0,
    }));
  }

  const tokens = q.split(" ").filter(Boolean);
  const scored: TratamientoMatch[] = [];

  for (const t of TRATAMIENTOS_ODONTOLOGICOS) {
    const nombreN = normalizeSearchText(t.nombre);
    const espN = normalizeSearchText(t.especialidad);
    const aliasN = t.aliases.map(normalizeSearchText);
    const haystack = [nombreN, espN, ...aliasN].join(" | ");

    let score = 0;

    // Coincidencia exacta de alias o nombre
    if (nombreN === q) score += 100;
    if (aliasN.some((a) => a === q)) score += 95;
    if (nombreN.startsWith(q)) score += 70;
    if (aliasN.some((a) => a.startsWith(q))) score += 65;
    if (nombreN.includes(q)) score += 40;
    if (aliasN.some((a) => a.includes(q))) score += 35;

    // Todos los tokens deben aparecer en algún campo
    const allTokens = tokens.every((tok) => haystack.includes(tok));
    if (!allTokens && score === 0) continue;
    if (allTokens) score += 20 * tokens.length;

    // Bonus si el primer token inicia un alias (ej. "cura" → curacion)
    const first = tokens[0];
    if (first && aliasN.some((a) => a.startsWith(first))) score += 15;
    if (first && nombreN.split(" ").some((w) => w.startsWith(first))) score += 12;

    if (score > 0) scored.push({ tratamiento: t, score });
  }

  scored.sort((a, b) => b.score - a.score || a.tratamiento.nombre.localeCompare(b.tratamiento.nombre, "es"));
  return scored.slice(0, limit);
}

export function findTratamientoByNombre(
  nombre: string
): TratamientoOdontologico | undefined {
  const n = normalizeSearchText(nombre);
  return TRATAMIENTOS_ODONTOLOGICOS.find(
    (t) =>
      normalizeSearchText(t.nombre) === n ||
      t.aliases.some((a) => normalizeSearchText(a) === n)
  );
}
