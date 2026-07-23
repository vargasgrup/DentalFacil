"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DocumentActions } from "@/components/DocumentActions";
import type { CloseSummary } from "./types";

interface CloseCashSummaryProps {
  summary: CloseSummary;
  onDismiss: () => void;
}

export function CloseCashSummary({ summary, onDismiss }: CloseCashSummaryProps) {
  return (
    <Card className="border-success-200 bg-success-50">
      <h2 className="mb-3 flex items-center gap-2 text-section-title text-success-800">
        <Check className="h-5 w-5" />
        Caja cerrada
      </h2>
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <p className="text-help text-slate-500">Inicial</p>
          <p className="font-medium">S/ {summary.monto_inicial.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-help text-slate-500">Ingresos</p>
          <p className="font-medium text-success-700">S/ {summary.ingresos.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-help text-slate-500">Egresos</p>
          <p className="font-medium text-danger-600">S/ {summary.egresos.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-help text-slate-500">Total en caja</p>
          <p className="text-lg font-bold text-slate-800">
            S/ {summary.total_esperado.toFixed(2)}
          </p>
        </div>
      </div>
      {Object.keys(summary.por_metodo).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-success-200 pt-3">
          {Object.entries(summary.por_metodo).map(([method, amount]) => (
            <span
              key={method}
              className="rounded-lg bg-white px-2.5 py-1 text-xs capitalize shadow-card"
            >
              {method}: <strong>S/ {amount.toFixed(2)}</strong>
            </span>
          ))}
        </div>
      )}
      <div className="mt-4">
        <p className="mb-2 text-sm font-medium text-slate-700">Imprimir / descargar cierre</p>
        <DocumentActions
          label="Cierre de caja"
          downloadUrl={`/api/documents/cierre-caja/${summary.session_id}`}
          telefono={null}
          mensaje=""
          hideWhatsApp
        />
      </div>
      <Button variant="ghost" className="mt-3" onClick={onDismiss}>
        Listo
      </Button>
    </Card>
  );
}
