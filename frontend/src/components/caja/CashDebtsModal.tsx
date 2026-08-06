"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PacienteFichaLink } from "@/components/PacienteFichaLink";
import type { DebtPatient, DebtsOverview } from "./types";

export type DebtFinanceFilter =
  | "todos"
  | "sin_abono"
  | "parcial"
  | "mayor_saldo"
  | "varios";

const FINANCE_FILTERS: { id: DebtFinanceFilter; label: string; hint: string }[] = [
  { id: "todos", label: "Todos", hint: "Todos con saldo" },
  { id: "sin_abono", label: "Sin abonos", hint: "Aún no pagó nada" },
  { id: "parcial", label: "Pago parcial", hint: "Ya abonó, resta saldo" },
  { id: "mayor_saldo", label: "Saldo alto", hint: "S/ 300 o más" },
  { id: "varios", label: "Varios ítems", hint: "Más de un tratamiento" },
];

const ALTO_SALDO = 300;

function fold(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Búsqueda por tokens: nombre, ficha, teléfono; ignora acentos. */
export function matchDebtPatient(d: DebtPatient, rawQuery: string): boolean {
  const q = fold(rawQuery);
  if (!q) return true;
  const hay = fold(
    [d.patient_nombre, d.ficha, d.telefono || "", d.initials]
      .concat(d.lines.map((l) => `${l.label} ${l.pieza_fdi || ""}`))
      .join(" ")
  );
  const tokens = q.split(/\s+/).filter(Boolean);
  return tokens.every((t) => hay.includes(t));
}

function paidTotal(d: DebtPatient): number {
  return d.lines.reduce((s, l) => s + (l.a_cuenta || 0), 0);
}

function matchFinanceFilter(d: DebtPatient, f: DebtFinanceFilter): boolean {
  const paid = paidTotal(d);
  switch (f) {
    case "sin_abono":
      return paid <= 0.009;
    case "parcial":
      return paid > 0.009 && d.saldo > 0.009;
    case "mayor_saldo":
      return d.saldo + 0.0001 >= ALTO_SALDO;
    case "varios":
      return d.lines.length > 1;
    default:
      return true;
  }
}

interface CashDebtsModalProps {
  open: boolean;
  onClose: () => void;
  debts: DebtsOverview | null;
  loading?: boolean;
  sessionOpen: boolean;
  onCobrar?: (debt: DebtPatient, lineId?: string) => void;
  /** Pre-fill search when opening from movements filter, etc. */
  initialQuery?: string;
  initialFinanceFilter?: DebtFinanceFilter;
}

/**
 * Consulta y filtro de saldos por cobrar (no listado en vista principal).
 */
export function CashDebtsModal({
  open,
  onClose,
  debts,
  loading,
  sessionOpen,
  onCobrar,
  initialQuery = "",
  initialFinanceFilter = "todos",
}: CashDebtsModalProps) {
  const [query, setQuery] = useState("");
  const [financeFilter, setFinanceFilter] =
    useState<DebtFinanceFilter>("todos");
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setFinanceFilter("todos");
      setActiveId(null);
      return;
    }
    setQuery(initialQuery);
    setFinanceFilter(initialFinanceFilter);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, initialQuery, initialFinanceFilter]);

  const items = debts?.items ?? [];
  const filtered = useMemo(() => {
    return items
      .filter((d) => matchFinanceFilter(d, financeFilter))
      .filter((d) => matchDebtPatient(d, query))
      .sort((a, b) => b.saldo - a.saldo);
  }, [items, query, financeFilter]);

  const filteredTotal = useMemo(
    () => filtered.reduce((s, d) => s + d.saldo, 0),
    [filtered]
  );

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
        className="flex max-h-[min(92vh,780px)] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h2
              id="caja-por-cobrar-title"
              className="text-base font-semibold text-slate-800"
            >
              Por cobrar — estado financiero
            </h2>
            <p className="mt-0.5 text-help text-slate-500">
              Cartera total:{" "}
              {count === 0
                ? "sin saldos"
                : `${count} ${count === 1 ? "paciente" : "pacientes"} · S/ ${total.toFixed(2)}`}
              {filtered.length !== count || financeFilter !== "todos" || query
                ? ` · filtro: ${filtered.length} · S/ ${filteredTotal.toFixed(2)}`
                : ""}
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

        <div className="space-y-2 border-b border-slate-100 px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar paciente: nombre, ficha FC-…, teléfono o tratamiento…"
              className="w-full rounded-lg border border-slate-200 bg-surface-subtle py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-500/20"
              autoFocus
              aria-label="Búsqueda inteligente de pacientes con deuda"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FINANCE_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                title={f.hint}
                onClick={() => setFinanceFilter(f.id)}
                className={`rounded-full px-2.5 py-1 text-xs transition-smooth ${
                  financeFilter === f.id
                    ? "bg-brand-600 font-medium text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {f.label}
              </button>
            ))}
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
              {query || financeFilter !== "todos"
                ? "Ningún paciente con ese filtro o búsqueda."
                : "No hay saldos pendientes por cobrar."}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.map((d) => {
                const openRow = activeId === d.patient_id;
                const paid = paidTotal(d);
                const statusLabel =
                  paid <= 0.009
                    ? "Sin abonos"
                    : "Pago parcial";
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
                          {" · "}
                          <span className="text-slate-600">{statusLabel}</span>
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
                        <p className="text-help text-slate-500">
                          Abonado S/ {paid.toFixed(2)} · pendiente S/{" "}
                          {d.saldo.toFixed(2)}
                        </p>
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
