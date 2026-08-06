"use client";

import { ArrowDownCircle, Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { DocumentActions } from "@/components/DocumentActions";
import { PacienteFichaLink } from "@/components/PacienteFichaLink";
import { formatDateTime, formatTime } from "@/lib/datetime";
import type { CashPeriod, CashTransaction } from "./types";
import { formatMetodoLabel, waReceiptMessage } from "./utils";

const PERIODS: { id: CashPeriod; label: string }[] = [
  { id: "sesion", label: "Sesión" },
  { id: "hoy", label: "Hoy" },
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mes" },
  { id: "anio", label: "Año" },
];

interface TransactionsTableProps {
  transactions: CashTransaction[];
  filteredTx: CashTransaction[];
  tipoFilter: "todos" | "ingreso" | "egreso";
  setTipoFilter: (v: "todos" | "ingreso" | "egreso") => void;
  period: CashPeriod;
  setPeriod: (p: CashPeriod) => void;
  sessionOpen: boolean;
  periodIngresos: number;
  periodEgresos: number;
  periodLoading?: boolean;
  onCobrar: () => void;
  onVoid?: (tx: CashTransaction) => void;
  voidingId?: string | null;
  allowVoid?: boolean;
}

export function TransactionsTable({
  transactions,
  filteredTx,
  tipoFilter,
  setTipoFilter,
  period,
  setPeriod,
  sessionOpen,
  periodIngresos,
  periodEgresos,
  periodLoading,
  onCobrar,
  onVoid,
  voidingId,
  allowVoid = true,
}: TransactionsTableProps) {
  const empty = !periodLoading && filteredTx.length === 0;

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="space-y-3 border-b border-slate-200 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Movimientos de caja</h3>
            <p className="text-help text-slate-500">
              Historial consolidado de ingresos y egresos
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs tabular-nums">
            <span className="text-success-700">
              Ingresos <strong>S/ {periodIngresos.toFixed(2)}</strong>
            </span>
            <span className="text-warning-700">
              Egresos <strong>S/ {periodEgresos.toFixed(2)}</strong>
            </span>
            <span className="text-slate-700">
              Neto{" "}
              <strong>
                S/ {(periodIngresos - periodEgresos).toFixed(2)}
              </strong>
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap rounded-lg bg-slate-100 p-0.5">
            {PERIODS.map((p) => {
              const disabled = p.id === "sesion" && !sessionOpen;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={disabled}
                  title={
                    disabled
                      ? "Abra una sesión de caja para filtrar por sesión actual"
                      : undefined
                  }
                  onClick={() => setPeriod(p.id)}
                  className={`rounded px-2.5 py-1 text-xs transition-smooth disabled:cursor-not-allowed disabled:opacity-40 ${
                    period === p.id
                      ? "bg-white font-medium text-slate-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <div className="flex rounded-lg bg-slate-100 p-0.5">
            {(
              [
                ["todos", "Todos"],
                ["ingreso", "Ingresos"],
                ["egreso", "Egresos"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTipoFilter(key)}
                className={`rounded px-2.5 py-1 text-xs transition-smooth ${
                  tipoFilter === key
                    ? "bg-white font-medium text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {periodLoading ? (
        <div className="space-y-2 p-4">
          <div className="skeleton h-10 w-full rounded-lg" />
          <div className="skeleton h-10 w-full rounded-lg" />
          <div className="skeleton h-10 w-full rounded-lg" />
        </div>
      ) : empty ? (
        <EmptyState
          icon={<Wallet className="h-7 w-7" />}
          title="Sin movimientos en este período"
          description={
            sessionOpen
              ? "Pulse Cobrar para registrar el primer pago del período seleccionado."
              : "Abra la caja o cambie el período (hoy, semana, mes…)."
          }
          action={
            sessionOpen ? (
              <Button onClick={onCobrar} icon={<ArrowDownCircle className="h-4 w-4" />}>
                Cobrar
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-surface-subtle text-left text-slate-500">
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Concepto</th>
                <th className="px-4 py-3 font-medium">Paciente</th>
                <th className="px-4 py-3 font-medium">Método</th>
                <th className="px-4 py-3 font-medium text-right">Monto</th>
                <th className="px-4 py-3 font-medium">Comprobante</th>
                <th className="px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredTx.map((t) => {
                const voided = Boolean(t.anulado);
                const sameDay =
                  period === "sesion" || period === "hoy";
                return (
                  <tr
                    key={t.id}
                    className={`border-b border-slate-50 transition-smooth hover:bg-brand-50/30 ${
                      voided ? "bg-slate-50 opacity-70" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5 text-slate-500">
                      {sameDay
                        ? formatTime(t.created_at)
                        : formatDateTime(t.created_at, { year: undefined })}
                    </td>
                    <td className="px-4 py-2.5">
                      {voided ? (
                        <Badge variant="neutral">anulado</Badge>
                      ) : (
                        <Badge variant={t.tipo === "ingreso" ? "success" : "danger"}>
                          {t.tipo}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">
                      <span className={voided ? "line-through" : ""}>{t.concepto}</span>
                      {voided && t.anulacion_motivo ? (
                        <span className="mt-0.5 block text-help text-slate-500">
                          Motivo: {t.anulacion_motivo}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5">
                      {t.patient_id && t.patient_nombre ? (
                        <PacienteFichaLink
                          patientId={t.patient_id}
                          className="text-brand-600 hover:underline"
                        >
                          {t.patient_nombre}
                        </PacienteFichaLink>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {formatMetodoLabel(t)}
                      {t.grupo_pago_id && !voided ? (
                        <span className="ml-1 text-xs text-slate-400">(mixto)</span>
                      ) : null}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-medium ${
                        voided
                          ? "text-slate-400 line-through"
                          : t.tipo === "ingreso"
                            ? "text-success-600"
                            : "text-danger-500"
                      }`}
                    >
                      {t.tipo === "ingreso" ? "+" : "−"} S/ {t.monto.toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5">
                      {!voided && t.tipo === "ingreso" ? (
                        <DocumentActions
                          label="Comprobante"
                          documentType="comprobante"
                          downloadUrl={`/api/documents/comprobante/${t.id}`}
                          telefono={t.patient_telefono}
                          mensaje={waReceiptMessage(t)}
                          hideWhatsApp={!t.patient_id}
                          forceFormat="80mm"
                          compact
                        />
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {!voided && allowVoid && period === "sesion" && onVoid ? (
                        <Button
                          type="button"
                          variant="ghost"
                          className="text-xs text-danger-600"
                          loading={voidingId === t.id}
                          onClick={() => onVoid(t)}
                        >
                          Anular
                        </Button>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {transactions.length > 0 && (
            <p className="border-t border-slate-100 px-4 py-2 text-help text-slate-500">
              {filteredTx.length} de {transactions.length} movimiento
              {transactions.length === 1 ? "" : "s"} en el período
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
