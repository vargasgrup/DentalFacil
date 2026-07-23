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
  created_at: string;
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
  por_metodo: Record<string, number>;
  monto_final: number;
}

export interface SessionTotals {
  ingresos: number;
  egresos: number;
  saldo: number;
  porMetodo: Record<string, number>;
}
