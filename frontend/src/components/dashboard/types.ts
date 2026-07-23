export interface DashboardHome {
  generated_at: string;
  cash: {
    open: boolean;
    session_id: string | null;
    monto_inicial: number;
    ingresos_hoy: number;
    egresos_hoy: number;
    saldo: number;
  };
  kpis: {
    ingresos_hoy: number;
    citas_hoy: number;
    citas_completadas: number;
    citas_pendientes: number;
    citas_delta_vs_ayer: number;
    pacientes_nuevos_mes: number;
    pacientes_nuevos_delta: number;
    deuda_total: number;
    deuda_pacientes: number;
    pacientes_total: number;
    recordatorios_pendientes: number;
  };
  citas_hoy: DashboardCita[];
  reminders: DashboardReminder[];
  deudas: DashboardDeuda[];
  tratamientos_activos: DashboardTratamiento[];
  revenue_chart: {
    labels: string[];
    this_week: number[];
    last_week: number[];
  };
  resumen_semanal: {
    citas_atendidas: number;
    ingresos: number;
    nuevos_pacientes: number;
    tratamientos: number;
  };
  especialidades: { nombre: string; count: number; pct: number }[];
  cumpleanos: DashboardCumple[];
  actividad: DashboardActividad[];
}

export interface DashboardCita {
  id: string;
  patient_id: string;
  patient_nombre: string;
  patient_telefono?: string | null;
  fecha_hora: string | null;
  duracion_minutos: number;
  estado: string;
  especialidad?: string | null;
  notas?: string | null;
  doctor_nombre: string;
}

export interface DashboardReminder {
  id: string;
  appointment_id: string;
  patient_id?: string | null;
  patient_nombre: string;
  patient_telefono?: string | null;
  mensaje_sugerido: string;
  programado_para?: string | null;
  appointment_fecha?: string | null;
  especialidad?: string | null;
  estado: string;
}

export interface DashboardDeuda {
  patient_id: string;
  patient_nombre: string;
  initials: string;
  ficha: string;
  saldo: number;
  concepto: string;
}

export interface DashboardTratamiento {
  patient_id: string;
  label: string;
  progress_pct: number;
  saldo: number;
  costo: number;
  estado: string;
}

export interface DashboardCumple {
  patient_id: string;
  patient_nombre: string;
  initials: string;
  fecha: string;
  dias: number;
  ficha: string;
}

export interface DashboardActividad {
  type: string;
  title: string;
  detail: string;
  at?: string | null;
  relative: string;
  href: string;
  amount?: number | null;
}

export function moneyPE(value: number): string {
  return `S/ ${Number(value || 0).toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
