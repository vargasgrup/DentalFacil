export interface CashSession {
  id: string;
  monto_inicial: number;
  abierta_en: string;
  estado: string;
}

export interface CashTransaction {
  id: string;
  patient_id?: string | null;
  patient_nombre?: string | null;
  patient_telefono?: string | null;
  tipo: string;
  concepto: string;
  monto: number;
  metodo_pago: string;
  grupo_pago_id?: string | null;
  plan_item_ref?: string | null;
  evolution_entry_id?: string | null;
  anulado?: boolean;
  anulado_en?: string | null;
  anulacion_motivo?: string | null;
  created_at: string;
  allocated_total?: number | null;
  unallocated_amount?: number | null;
  allocations?: {
    kind: string;
    id: string;
    amount: number;
    label: string;
    saldo_after?: number;
    a_cuenta_after?: number;
    costo?: number;
  }[] | null;
  saldo_pendiente_destino?: number | null;
  pagos_parciales?: { metodo_pago: string; monto: number }[] | null;
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

export interface CloseSummary {
  session_id: string;
  monto_inicial: number;
  ingresos: number;
  egresos: number;
  neto: number;
  total_esperado: number;
  monto_contado: number;
  diferencia: number;
  cierre_notas?: string | null;
  por_metodo: Record<string, number>;
  monto_final: number;
}

export interface SessionTotals {
  ingresos: number;
  egresos: number;
  saldo: number;
  porMetodo: Record<string, number>;
}

export type CashPeriod = "sesion" | "hoy" | "semana" | "mes" | "anio";

export interface DebtLine {
  evolution_entry_id: string;
  label: string;
  pieza_fdi?: string | null;
  costo: number;
  a_cuenta: number;
  saldo: number;
}

export interface DebtPatient {
  patient_id: string;
  patient_nombre: string;
  initials: string;
  ficha: string;
  telefono?: string | null;
  saldo: number;
  lines: DebtLine[];
}

export interface DebtsOverview {
  deuda_total: number;
  deuda_pacientes: number;
  items: DebtPatient[];
}

export interface CashMovements {
  period: CashPeriod | string;
  start?: string | null;
  end?: string | null;
  session_id?: string | null;
  ingresos: number;
  egresos: number;
  neto: number;
  items: CashTransaction[];
}
