"use client";

import { ArrowDownCircle, Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { DocumentActions } from "@/components/DocumentActions";
import { PacienteFichaLink } from "@/components/PacienteFichaLink";
import { formatTime } from "@/lib/datetime";
import { formatMetodoLabel, waReceiptMessage } from "./utils";
import type { CashTransaction } from "./types";

interface TransactionsTableProps {
  transactions: CashTransaction[];
  filteredTx: CashTransaction[];
  tipoFilter: "todos" | "ingreso" | "egreso";
  setTipoFilter: (v: "todos" | "ingreso" | "egreso") => void;
  onCobrar: () => void;
  onVoid?: (tx: CashTransaction) => void;
  voidingId?: string | null;
}

export function TransactionsTable({
  transactions,
  filteredTx,
  tipoFilter,
  setTipoFilter,
  onCobrar,
  onVoid,
  voidingId,
}: TransactionsTableProps) {
  if (transactions.length === 0) {
    return (
      <EmptyState
        icon={<Wallet className="h-7 w-7" />}
        title="Sin movimientos aún"
        description="Pulsa Cobrar para registrar el primer pago e imprimir el comprobante."
        action={
          <Button onClick={onCobrar} icon={<ArrowDownCircle className="h-4 w-4" />}>
            Cobrar
          </Button>
        }
      />
    );
  }

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-800">Movimientos</h3>
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
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-surface-subtle text-left text-slate-500">
              <th className="px-4 py-3 font-medium">Hora</th>
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
              return (
                <tr
                  key={t.id}
                  className={`border-b border-slate-50 transition-smooth hover:bg-brand-50/30 ${
                    voided ? "bg-slate-50 opacity-70" : ""
                  }`}
                >
                  <td className="px-4 py-2.5 text-slate-500">
                    {formatTime(t.created_at)}
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
                    {!voided && onVoid ? (
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
      </div>
    </Card>
  );
}
