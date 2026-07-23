import type { PlanItem, TreatmentPlans } from "@/lib/treatmentPlans";

export interface Patient {
  id: string;
  numero_ficha: number;
  nombres: string;
  apellidos: string;
  tipo_documento: string;
  numero_documento?: string;
  fecha_nacimiento?: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  contacto_emergencia?: string;
  alergias?: string;
  lugar_nacimiento?: string;
  ocupacion?: string;
  estado_civil?: string;
  nombre_responsable?: string;
  /** Especialidad odontológica en la que se atiende al paciente */
  especialidad?: string;
  es_migrado?: boolean;
  fecha_ingreso_clinica?: string | null;
  resumen_historia_previa?: string | null;
  created_at: string;
}

export interface ClinicalRecord {
  id: string;
  patient_id: string;
  motivo_consulta?: string;
  antecedentes_medicos?: string;
  antecedentes_odontologicos?: string;
  diagnostico?: string;
  plan_tratamiento?: string | PlanItem[];
  observaciones?: string;
  doctor_responsable_id?: string;
  consentimiento_firmado: boolean;
  consentimiento_fecha?: string;
  firma_odontologo?: string;
  firma_paciente?: string;
  updated_at?: string;
}

export interface EvolutionEntry {
  id: string;
  patient_id: string;
  doctor_id?: string;
  especialidad?: string;
  tratamiento_descripcion: string;
  pieza_fdi?: string;
  cantidad?: number;
  costo_unitario?: number;
  costo: number;
  a_cuenta: number;
  estado: string;
  plan_item_id?: string;
  proxima_cita_fecha?: string;
  origen?: string;
  fecha: string;
  created_at: string;
}

export interface FinancialSummary {
  costo_total: number;
  pagado_total: number;
  saldo: number;
  a_cuenta_clinico?: number;
  plan_estimado?: number;
  plan_a_cuenta?: number;
  plan_saldo?: number;
}

export interface PaymentTarget {
  kind: "evolution" | "plan";
  id: string;
  plan_item_id?: string;
  label: string;
  pieza_fdi?: string;
  costo: number;
  a_cuenta: number;
  saldo: number;
}

export interface PaymentTx {
  id: string;
  concepto: string;
  monto: number;
  metodo_pago: string;
  created_at: string;
}

export type SaveState = "idle" | "saving" | "saved";

export type FichaTab = "historia" | "evaluacion" | "seguimiento";

export type { PlanItem, TreatmentPlans };
