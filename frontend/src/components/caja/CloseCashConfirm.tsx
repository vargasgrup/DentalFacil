"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { CashSession, SessionTotals } from "./types";

interface CloseCashConfirmProps {
  session: CashSession;
  totals: SessionTotals;
  saving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function CloseCashConfirm({
  totals,
  saving,
  onConfirm,
  onCancel,
}: CloseCashConfirmProps) {
  return (
    <Card className="border-danger-200 bg-danger-50/50">
      <h2 className="text-section-title text-slate-800">¿Cerrar caja?</h2>
      <p className="mt-1 text-sm text-slate-600">
        Debes tener en caja{" "}
        <strong className="text-slate-900">S/ {totals.saldo.toFixed(2)}</strong> (inicial +
        ingresos − egresos). Esta acción cierra la sesión actual.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="danger" loading={saving} onClick={onConfirm}>
          Sí, cerrar caja
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </Card>
  );
}
