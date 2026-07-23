"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/Input";
import { EXPENSE_PRESETS, METODOS } from "./constants";

export interface ExpenseFormProps {
  expenseConcepto: string;
  setExpenseConcepto: (v: string) => void;
  expenseMonto: string;
  setExpenseMonto: (v: string) => void;
  expenseMetodo: string;
  setExpenseMetodo: (v: string) => void;
  saving: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export function ExpenseForm({
  expenseConcepto,
  setExpenseConcepto,
  expenseMonto,
  setExpenseMonto,
  expenseMetodo,
  setExpenseMetodo,
  saving,
  onSubmit,
  onClose,
}: ExpenseFormProps) {
  return (
    <Card>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-section-title text-slate-800">Registrar egreso</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div>
          <span className="mb-1.5 block text-label text-slate-700">Concepto</span>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {EXPENSE_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setExpenseConcepto(preset)}
                className={`rounded-lg px-2.5 py-1 text-xs transition-smooth ${
                  expenseConcepto === preset
                    ? "bg-warning-500 text-white"
                    : "bg-surface-subtle text-slate-600 hover:bg-slate-200"
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
          <Input
            value={expenseConcepto}
            onChange={(e) => setExpenseConcepto(e.target.value)}
            required
            placeholder="O escribe el concepto…"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Monto (S/)"
            type="number"
            step="0.01"
            min="0.01"
            value={expenseMonto}
            onChange={(e) => setExpenseMonto(e.target.value)}
            required
          />
          <label className="block">
            <span className="mb-1 block text-label text-slate-700">Método</span>
            <select
              value={expenseMetodo}
              onChange={(e) => setExpenseMetodo(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm transition-smooth focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
            >
              {METODOS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex gap-2">
          <Button type="submit" loading={saving}>
            Registrar egreso
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}
