/**
 * Propuestas de tratamiento asociadas a condiciones del odontograma.
 * Precios iniciales editables al agregar al plan (misma moneda de la ficha).
 */

export interface TreatmentSuggestion {
  nombre: string;
  precio_default: number;
}

export const CONDITION_TREATMENT_MAP: Record<string, TreatmentSuggestion> = {
  caries: { nombre: "Curación / obturación con resina", precio_default: 100 },
  obturacion: { nombre: "Curación / obturación con resina", precio_default: 100 },
  corona: { nombre: "Corona metal-porcelana", precio_default: 450 },
  corona_temp: { nombre: "Corona temporal / provisional", precio_default: 120 },
  ausente: { nombre: "Rehabilitación por pieza ausente", precio_default: 400 },
  extraer: { nombre: "Exodoncia simple", precio_default: 100 },
  fractura: { nombre: "Tratamiento por fractura", precio_default: 150 },
  pulpa: { nombre: "Endodoncia unirradicular", precio_default: 280 },
  implante: { nombre: "Implante dental (colocación)", precio_default: 1800 },
  protesis_fija: { nombre: "Puente / prótesis fija", precio_default: 900 },
  protesis: { nombre: "Prótesis parcial removible", precio_default: 600 },
  protesis_remov: { nombre: "Prótesis parcial removible", precio_default: 600 },
  perno: { nombre: "Perno muñón / poste", precio_default: 180 },
  poste: { nombre: "Perno muñón / poste", precio_default: 180 },
  ortodoncia_fija: { nombre: "Ortodoncia fija (brackets)", precio_default: 2500 },
  ortod_remov: { nombre: "Ortodoncia removible / aparato funcional", precio_default: 800 },
  erupcion: { nombre: "Control de erupción", precio_default: 50 },
  impactado: { nombre: "Extracción de cordal / tercer molar", precio_default: 350 },
  impactado_p: { nombre: "Extracción de cordal / tercer molar", precio_default: 350 },
  discromia: { nombre: "Blanqueamiento dental", precio_default: 350 },
  desgaste: { nombre: "Rehabilitación por desgaste", precio_default: 180 },
  abrasion: { nombre: "Tratamiento por abrasión", precio_default: 120 },
  erosion: { nombre: "Tratamiento por erosión", precio_default: 120 },
  anomalia_des: { nombre: "Corrección anomalía del desarrollo", precio_default: 200 },
};

export function suggestTreatment(condicionId: string | null | undefined): TreatmentSuggestion {
  if (!condicionId) return { nombre: "Tratamiento dental", precio_default: 0 };
  return (
    CONDITION_TREATMENT_MAP[condicionId] || {
      nombre: `Tratamiento — ${condicionId}`,
      precio_default: 0,
    }
  );
}

export interface PlanProposalItem {
  item: string;
  cantidad: number;
  costo_unitario: number;
  a_cuenta?: number;
  estado: string;
  pieza_fdi: string;
  condicion_id: string;
  origen: "odontogram";
}
