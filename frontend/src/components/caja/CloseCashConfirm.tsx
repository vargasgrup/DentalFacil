"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/Input";
import type { CashSession, SessionTotals } from "./types";

interface CloseCashConfirmProps {
  session: CashSession;
  totals: SessionTotals;
  saving: boolean;
  onConfirm: (payload: { monto_contado: number; notas?: string }) => void;
  onCancel: () => void;
}

export function CloseCashConfirm({
  totals,
  saving,
  onConfirm,
  onCancel,
}: CloseCashConfirmProps) {
  const expected = totals.saldo;
  const [montoContado, setMontoContado] = useState(expected.toFixed(2));
  const [notas, setNotas] = useState("");
  const contado = parseFloat(montoContado);
  const diff = Number.isFinite(contado) ? contado - expected : 0;

  return (
    <Card className="border-danger-200 bg-danger-50/50">
      <h2 className="text-section-title text-slate-800">Cerrar caja — arqueo</h2>
      <p className="mt-1 text-sm text-slate-600">
        Total esperado (inicial + ingresos − egresos):{" "}
        <strong className="text-slate-900">S/ {expected.toFixed(2)}</strong>
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          label="Monto contado (S/) *"
          type="number"
          step="0.01"
          min="0"
          value={montoContado}
          onChange={(e) => setMontoContado(e.target.value)}
          required
          hint="Cuente efectivo y registre aquí el total físico/confirmado"
        />
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <p className="text-help text-slate-500">Diferencia</p>
          <p
            className={`text-lg font-semibold ${
              Math.abs(diff) < 0.01
                ? "text-success-700"
                : diff > 0
                  ? "text-brand-700"
                  : "text-danger-600"
            }`}
          >
            {diff >= 0 ? "+" : "−"} S/ {Math.abs(diff).toFixed(2)}
          </p>
        </div>
      </div>
      <div className="mt-3">
        <Input
          label="Notas de cierre (opcional)"
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Observaciones del arqueo…"
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="danger"
          loading={saving}
          disabled={!Number.isFinite(contado) || contado < 0}
          onClick={() =>
            onConfirm({
              monto_contado: contado,
              notas: notas.trim() || undefined,
            })
          }
        >
          Confirmar cierre
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
      </div>
    </Card>
  );
}
