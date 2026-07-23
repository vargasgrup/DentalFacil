import type { CashTransaction } from "./types";
import { METODO_LABEL } from "./constants";

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function isAbonoConcepto(concepto: string): boolean {
  const c = concepto.trim().toLowerCase();
  return c.includes("abono") && c.includes("tratamiento");
}

export function formatMetodoLabel(t: CashTransaction): string {
  if (t.pagos_parciales && t.pagos_parciales.length > 0) {
    return t.pagos_parciales
      .map(
        (p) =>
          `${METODO_LABEL[p.metodo_pago] || p.metodo_pago} S/ ${Number(p.monto).toFixed(2)}`
      )
      .join(" + ");
  }
  if (t.metodo_pago === "mixto") return "Mixto";
  return METODO_LABEL[t.metodo_pago] || t.metodo_pago;
}

export function waReceiptMessage(t: CashTransaction): string {
  const nombre = t.patient_nombre?.split(" ")[0] || "paciente";
  const metodo =
    t.pagos_parciales && t.pagos_parciales.length > 0
      ? ` · ${formatMetodoLabel(t)}`
      : "";
  return `Hola ${nombre}, adjuntamos tu comprobante de pago por S/ ${t.monto.toFixed(2)} (${t.concepto}${metodo}). Gracias por tu preferencia — M&D Odontología.`;
}
