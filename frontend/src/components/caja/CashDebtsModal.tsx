"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PacienteFichaLink } from "@/components/PacienteFichaLink";
import type { DebtPatient, DebtsOverview } from "./types";

interface CashDebtsModalProps {
  open: boolean;
  onClose: () => void;
  debts: DebtsOverview | null;
  loading?: boolean;
  sessionOpen: boolean;
  onCobrar?: (debt: DebtPatient, lineId?: string) => void;
}

/**
 * Consulta de saldos por cobrar — solo bajo demanda.
 * No se renderiza como listado principal en Caja.
 */
export function CashDebtsModal({
  open,
  onClose,
  debts,
  loading,
  sessionOpen,
  onCobrar,
}: CashDebtsModalProps) {
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveId(null);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const items = debts?.items ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (d) =>
        d.patient_nombre.toLowerCase().includes(q) ||
        d.ficha.toLowerCase().includes(q) ||
        (d.telefono || "").includes(q)
    );
  }, [items, query]);

  if (!open) return null;

  const total = debts?.deuda_total ?? 0;
  const count = debts?.deuda_pacientes ?? 0;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="caja-por-cobrar-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h2
              id="caja-por-cobrar-title"
              className="text-base font-semibold text-slate-800"
            >
              Cuentas por cobrar
            </h2>
            <p className="mt-0.5 text-help text-slate-500">
              {count === 0
                ? "Sin saldos pendientes"
                : `${count} ${count === 1 ? "paciente" : "pacientes"} · S/ ${total.toFixed(2)}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-slate-100 px-4 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, ficha o teléfono…"
              className="w-full rounded-lg border border-slate-200 bg-surface-subtle py-2 pl-9 pr-3 text-sm text-slate-800 outline-none ring-brand-500/0 focus:border-brand-400 focus:bg-white focus:ring-2"
              autoFocus
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && !debts ? (
            <div className="space-y-2 p-4">
              <div className="skeleton h-12 rounded-lg" />
              <div className="skeleton h-12 rounded-lg" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">
              {query
                ? "Ningún resultado con ese criterio."
                : "No hay saldos pendientes por cobrar."}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.map((d) => {
                const openRow = activeId === d.patient_id;
                return (
                  <li key={d.patient_id}>
                    <div className="flex items-center gap-2 px-4 py-3">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() =>
                          setActiveId(openRow ? null : d.patient_id)
                        }
                        aria-expanded={openRow}
                      >
                        <p className="truncate text-sm font-medium text-slate-800">
                          {d.patient_nombre}
                        </p>
                        <p className="truncate text-help text-slate-500">
                          {d.ficha}
                          {d.lines.length > 1
                            ? ` · ${d.lines.length} tratamientos`
                            : d.lines[0]
                              ? ` · ${d.lines[0].label}`
                              : ""}
                        </p>
                      </button>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-800">
                        S/ {d.saldo.toFixed(2)}
                      </span>
                      {sessionOpen && onCobrar ? (
                        <Button
                          type="button"
                          variant="secondary"
                          className="shrink-0 text-xs"
                          onClick={() => {
                            onCobrar(d);
                            onClose();
                          }}
                        >
                          Cobrar
                        </Button>
                      ) : null}
                    </div>
                    {openRow ? (
                      <div className="space-y-2 bg-surface-subtle/80 px-4 pb-3">
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
                              <span className="font-semibold tabular-nums text-slate-700">
                                S/ {line.saldo.toFixed(2)}
                              </span>
                              {sessionOpen && onCobrar ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  className="text-xs text-brand-600"
                                  onClick={() => {
                                    onCobrar(d, line.evolution_entry_id);
                                    onClose();
                                  }}
                                >
                                  Cobrar
                                </Button>
                              ) : null}
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
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {!sessionOpen && count > 0 ? (
          <p className="border-t border-slate-100 px-4 py-2 text-help text-slate-500">
            Abra la caja para registrar cobros sobre estos saldos.
          </p>
        ) : null}
      </div>
    </div>
  );
}
