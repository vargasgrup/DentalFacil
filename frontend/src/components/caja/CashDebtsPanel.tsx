"use client";

import { useState } from "react";
import { AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PacienteFichaLink } from "@/components/PacienteFichaLink";
import type { DebtPatient, DebtsOverview } from "./types";

interface CashDebtsPanelProps {
  debts: DebtsOverview | null;
  loading?: boolean;
  sessionOpen: boolean;
  onCobrar?: (debt: DebtPatient, lineId?: string) => void;
}

export function CashDebtsPanel({
  debts,
  loading,
  sessionOpen,
  onCobrar,
}: CashDebtsPanelProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (loading && !debts) {
    return (
      <Card>
        <div className="skeleton h-20 w-full rounded-lg" />
      </Card>
    );
  }

  const total = debts?.deuda_total ?? 0;
  const count = debts?.deuda_pacientes ?? 0;
  const items = debts?.items ?? [];

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-danger-50 text-danger-600">
            <AlertCircle className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Deuda pendiente</h3>
            <p className="mt-0.5 text-help text-slate-500">
              Saldos clínicos por cobrar (evolución). Misma fuente que el Dashboard.
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold tabular-nums text-danger-600">
            S/ {total.toFixed(2)}
          </p>
          <p className="text-help text-slate-500">
            {count === 0
              ? "Sin deudas"
              : `${count} ${count === 1 ? "paciente" : "pacientes"}`}
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-400">
          No hay saldos pendientes por cobrar.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((d) => {
            const open = expanded === d.patient_id;
            return (
              <li key={d.patient_id}>
                <div className="flex items-center gap-2 px-4 py-3">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() =>
                      setExpanded(open ? null : d.patient_id)
                    }
                    aria-expanded={open}
                  >
                    {open ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                    )}
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger-50 text-xs font-bold text-danger-700">
                      {d.initials}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {d.patient_nombre}
                      </p>
                      <p className="truncate text-help text-slate-500">
                        {d.ficha}
                        {d.lines[0]
                          ? ` · ${d.lines[0].label}${
                              d.lines[0].pieza_fdi
                                ? ` (pieza ${d.lines[0].pieza_fdi})`
                                : ""
                            }`
                          : ""}
                      </p>
                    </div>
                  </button>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-danger-600">
                    S/ {d.saldo.toFixed(2)}
                  </span>
                  {sessionOpen && onCobrar && (
                    <Button
                      type="button"
                      variant="secondary"
                      className="shrink-0 text-xs"
                      onClick={() => onCobrar(d)}
                    >
                      Cobrar
                    </Button>
                  )}
                </div>
                {open && (
                  <div className="space-y-2 bg-surface-subtle/80 px-4 pb-3 pl-14">
                    {d.lines.map((line) => (
                      <div
                        key={line.evolution_entry_id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-slate-700">
                            {line.label}
                            {line.pieza_fdi ? (
                              <span className="font-normal text-slate-500">
                                {" "}
                                · pieza {line.pieza_fdi}
                              </span>
                            ) : null}
                          </p>
                          <p className="text-help text-slate-500">
                            Costo S/ {line.costo.toFixed(2)} · A cuenta S/{" "}
                            {line.a_cuenta.toFixed(2)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold tabular-nums text-danger-600">
                            S/ {line.saldo.toFixed(2)}
                          </span>
                          {sessionOpen && onCobrar && (
                            <Button
                              type="button"
                              variant="ghost"
                              className="text-xs text-brand-600"
                              onClick={() =>
                                onCobrar(d, line.evolution_entry_id)
                              }
                            >
                              Cobrar línea
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                    <PacienteFichaLink
                      patientId={d.patient_id}
                      className="inline-block text-xs font-medium text-brand-600 hover:underline"
                    >
                      Abrir ficha clínica
                    </PacienteFichaLink>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!sessionOpen && items.length > 0 && (
        <p className="border-t border-slate-100 px-4 py-2 text-help text-slate-500">
          Abra la caja para registrar cobros sobre estos saldos.
        </p>
      )}
    </Card>
  );
}
