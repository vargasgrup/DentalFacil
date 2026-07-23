"use client";

import { ArrowDownCircle, ArrowUpCircle, Scale } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, StatCard } from "@/components/ui/Card";
import { formatDateTime } from "@/lib/datetime";
import { METODO_LABEL } from "./constants";
import type { CashSession, SessionTotals } from "./types";

interface CashSessionDashboardProps {
  session: CashSession;
  totals: SessionTotals;
  barMax: number;
}

export function CashSessionDashboard({ session, totals, barMax }: CashSessionDashboardProps) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={<ArrowDownCircle className="h-5 w-5" />}
          label="Total ingresos"
          value={`S/ ${totals.ingresos.toFixed(2)}`}
          variant="success"
        />
        <StatCard
          icon={<ArrowUpCircle className="h-5 w-5" />}
          label="Total egresos"
          value={`S/ ${totals.egresos.toFixed(2)}`}
          variant="warning"
        />
        <StatCard
          icon={<Scale className="h-5 w-5" />}
          label="Saldo de sesión"
          value={`S/ ${totals.saldo.toFixed(2)}`}
          subtext={`Inicial: S/ ${session.monto_inicial.toFixed(2)}`}
          variant="info"
        />
      </div>

      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="success">Abierta</Badge>
              <span className="text-help text-slate-500">
                {formatDateTime(session.abierta_en)}
              </span>
            </div>
            {Object.keys(totals.porMetodo).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(totals.porMetodo).map(([method, amount]) => (
                  <span
                    key={method}
                    className="rounded-lg bg-surface-subtle px-2.5 py-1 text-xs text-slate-600"
                  >
                    {METODO_LABEL[method] || method}:{" "}
                    <strong>S/ {amount.toFixed(2)}</strong>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="w-full max-w-xs space-y-2 sm:w-48">
            <div>
              <div className="mb-1 flex justify-between text-xs text-slate-500">
                <span>Ingresos</span>
                <span className="font-medium text-success-700">
                  S/ {totals.ingresos.toFixed(2)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-subtle">
                <div
                  className="h-full rounded-full bg-success-500 transition-smooth"
                  style={{ width: `${(totals.ingresos / barMax) * 100}%` }}
                />
              </div>
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs text-slate-500">
                <span>Egresos</span>
                <span className="font-medium text-warning-700">
                  S/ {totals.egresos.toFixed(2)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-subtle">
                <div
                  className="h-full rounded-full bg-warning-500 transition-smooth"
                  style={{ width: `${(totals.egresos / barMax) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </Card>
    </>
  );
}
