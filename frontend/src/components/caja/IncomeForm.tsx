"use client";

import Link from "next/link";
import { Check, Eye, MessageCircle, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/Input";
import { DocumentActions } from "@/components/DocumentActions";
import { PatientPicker, type PickedPatient } from "@/components/PatientPicker";
import { TreatmentAutocomplete } from "@/components/TreatmentAutocomplete";
import { INCOME_PRESETS, METODOS } from "./constants";
import type { CashTransaction, PaymentTarget } from "./types";
import { formatMetodoLabel, isAbonoConcepto, waReceiptMessage } from "./utils";

export interface IncomeFormProps {
  incomePatient: PickedPatient | null;
  setIncomePatient: (p: PickedPatient | null) => void;
  incomeConcepto: string;
  setIncomeConcepto: (v: string) => void;
  incomeMonto: string;
  setIncomeMonto: (v: string) => void;
  incomeMetodo: string;
  setIncomeMetodo: (v: string) => void;
  incomeMixto: boolean;
  setIncomeMixto: (v: boolean) => void;
  incomePartes: { metodo_pago: string; monto: string }[];
  setIncomePartes: (
    v:
      | { metodo_pago: string; monto: string }[]
      | ((
          prev: { metodo_pago: string; monto: string }[]
        ) => { metodo_pago: string; monto: string }[])
  ) => void;
  payTarget: string;
  setPayTarget: (v: string) => void;
  paymentTargets: PaymentTarget[];
  targetsLoading: boolean;
  incomeTotal: number;
  mixtoSuma: number;
  mixtoDiff: number;
  saving: boolean;
  actionBusy: "preview" | "print" | "wa" | null;
  receiptAction: "preview" | "print" | "wa" | null;
  lastReceipt: CashTransaction | null;
  setError: (msg: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  onSaveAndRun: (action: "preview" | "print" | "wa") => void;
  onResetForm: () => void;
  onClearReceipt: () => void;
}

export function IncomeForm({
  incomePatient,
  setIncomePatient,
  incomeConcepto,
  setIncomeConcepto,
  incomeMonto,
  setIncomeMonto,
  incomeMetodo,
  setIncomeMetodo,
  incomeMixto,
  setIncomeMixto,
  incomePartes,
  setIncomePartes,
  payTarget,
  setPayTarget,
  paymentTargets,
  targetsLoading,
  incomeTotal,
  mixtoSuma,
  mixtoDiff,
  saving,
  actionBusy,
  receiptAction,
  lastReceipt,
  setError,
  onSubmit,
  onClose,
  onSaveAndRun,
  onResetForm,
  onClearReceipt,
}: IncomeFormProps) {
  return (
    <Card>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-section-title text-slate-800">Registrar cobro</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <PatientPicker
          value={incomePatient}
          onChange={setIncomePatient}
          label="Paciente (obligatorio para abono a tratamiento)"
        />

        <div>
          <span className="mb-1.5 block text-label text-slate-700">Concepto</span>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {INCOME_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setIncomeConcepto(preset);
                  if (isAbonoConcepto(preset) && !incomePatient) {
                    setError("Selecciona al paciente para ver sus planes activos");
                  }
                }}
                className={`rounded-lg px-2.5 py-1 text-xs transition-smooth ${
                  incomeConcepto === preset
                    ? "bg-brand-600 text-white"
                    : "bg-surface-subtle text-slate-600 hover:bg-slate-200"
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
          <TreatmentAutocomplete
            label=""
            value={incomeConcepto}
            onChange={setIncomeConcepto}
            onSelect={(t) => {
              setIncomeConcepto(t.nombre);
              if (!incomeMonto && t.precio_referencial) {
                setIncomeMonto(String(t.precio_referencial));
              }
            }}
            required
            placeholder="Escribe: curación, limpieza, abono…"
            hint="Catálogo predictivo + acceso rápido arriba"
          />
        </div>

        {incomePatient && (
          <label className="block">
            <span className="mb-1 block text-label text-slate-700">
              Aplicar a (plan / evolución)
            </span>
            <select
              value={payTarget}
              disabled={targetsLoading || saving}
              onChange={(e) => {
                const value = e.target.value;
                setPayTarget(value);
                const t = paymentTargets.find((x) => `${x.kind}:${x.id}` === value);
                if (t) {
                  if (!incomeConcepto || isAbonoConcepto(incomeConcepto)) {
                    const piezaAlready =
                      t.pieza_fdi && String(t.label).includes(String(t.pieza_fdi));
                    const piezaSuffix =
                      t.pieza_fdi && !piezaAlready ? ` (pieza ${t.pieza_fdi})` : "";
                    setIncomeConcepto(`Abono — ${t.label}${piezaSuffix}`);
                  }
                  // Siempre alinear monto al saldo pendiente del destino elegido
                  setIncomeMonto(String(t.saldo));
                }
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm transition-smooth focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
            >
              <option value="auto">Automático (FIFO — saldos abiertos)</option>
              {paymentTargets.map((t) => (
                <option key={`${t.kind}:${t.id}`} value={`${t.kind}:${t.id}`}>
                  {t.kind === "evolution" ? "Evolución" : "Plan"}: {t.label}
                  {t.pieza_fdi ? ` · pieza ${t.pieza_fdi}` : ""} — costo S/{" "}
                  {Number(t.costo || 0).toFixed(2)} · a cuenta S/{" "}
                  {Number(t.a_cuenta || 0).toFixed(2)} · saldo S/{" "}
                  {Number(t.saldo || 0).toFixed(2)}
                </option>
              ))}
            </select>
            {targetsLoading && (
              <p className="mt-1 text-help text-slate-500">
                Cargando planes activos del paciente…
              </p>
            )}
            {!targetsLoading && paymentTargets.length === 0 && (
              <p className="mt-1 text-help text-warning-700">
                Este paciente no tiene líneas con saldo en plan u evolución. El cobro
                quedará registrado en Caja; podrás asignarlo cuando existan costos.
              </p>
            )}
            {!targetsLoading &&
              paymentTargets.length > 0 &&
              isAbonoConcepto(incomeConcepto) &&
              payTarget === "auto" && (
                <p className="mt-1 text-help text-slate-500">
                  Elige el plan o evolución específico, o deja Automático para aplicar
                  FIFO a los saldos abiertos.
                </p>
              )}
          </label>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Monto total (S/)"
            type="number"
            step="0.01"
            min="0.01"
            value={incomeMonto}
            onChange={(e) => setIncomeMonto(e.target.value)}
            required
            autoFocus
          />
          <label className="block">
            <span className="mb-1 block text-label text-slate-700">Método de pago</span>
            <select
              value={incomeMixto ? "mixto" : incomeMetodo}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "mixto") {
                  setIncomeMixto(true);
                  setIncomePartes((prev) => {
                    const total = incomeMonto || "";
                    if (prev.length >= 2) {
                      return [
                        { ...prev[0], monto: prev[0].monto || "" },
                        { ...prev[1], monto: prev[1].monto || "" },
                      ];
                    }
                    return [
                      { metodo_pago: "efectivo", monto: total },
                      { metodo_pago: "yape", monto: "" },
                    ];
                  });
                } else {
                  setIncomeMixto(false);
                  setIncomeMetodo(v);
                }
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm transition-smooth focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
            >
              {METODOS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
              <option value="mixto">Mixto (varios métodos)</option>
            </select>
          </label>
        </div>

        {incomeMixto && (
          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-700">Detalle del pago mixto</p>
              <p className="text-xs text-slate-500">
                Ej.: S/ 20 efectivo + S/ 80 Yape = S/ 100
              </p>
            </div>
            {incomePartes.map((parte, idx) => (
              <div
                key={idx}
                className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]"
              >
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-600">Método</span>
                  <select
                    value={parte.metodo_pago}
                    onChange={(e) => {
                      const next = [...incomePartes];
                      next[idx] = { ...next[idx], metodo_pago: e.target.value };
                      setIncomePartes(next);
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                  >
                    {METODOS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
                <Input
                  label="Monto (S/)"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={parte.monto}
                  onChange={(e) => {
                    const next = [...incomePartes];
                    next[idx] = { ...next[idx], monto: e.target.value };
                    setIncomePartes(next);
                  }}
                  required
                />
                <div className="flex items-end pb-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={incomePartes.length <= 2}
                    onClick={() =>
                      setIncomePartes((prev) => prev.filter((_, i) => i !== idx))
                    }
                  >
                    Quitar
                  </Button>
                </div>
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={incomePartes.length >= METODOS.length}
                onClick={() => {
                  const used = new Set(incomePartes.map((p) => p.metodo_pago));
                  const nextMethod =
                    METODOS.find((m) => !used.has(m.value))?.value || "tarjeta";
                  setIncomePartes((prev) => [
                    ...prev,
                    { metodo_pago: nextMethod, monto: "" },
                  ]);
                }}
              >
                + Agregar método
              </Button>
              <p
                className={`text-sm ${
                  Math.abs(mixtoDiff) < 0.01 ? "text-success-700" : "text-warning-700"
                }`}
              >
                Suma: S/ {mixtoSuma.toFixed(2)}
                {incomeTotal > 0 && (
                  <>
                    {" "}
                    / Total S/ {incomeTotal.toFixed(2)}
                    {Math.abs(mixtoDiff) >= 0.01
                      ? ` · faltan S/ ${mixtoDiff.toFixed(2)}`
                      : " · cuadrado"}
                  </>
                )}
              </p>
            </div>
          </div>
        )}

        <div className="space-y-3 border-t border-slate-100 pt-4">
          <p className="text-label text-slate-700">Comprobante (Ticket 80mm)</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              loading={actionBusy === "preview"}
              disabled={!!actionBusy || saving}
              onClick={() => onSaveAndRun("preview")}
              icon={<Eye className="h-3.5 w-3.5" />}
            >
              Previsualizar
            </Button>
            <Button
              type="button"
              variant="secondary"
              loading={actionBusy === "print"}
              disabled={!!actionBusy || saving}
              onClick={() => onSaveAndRun("print")}
              icon={<Printer className="h-3.5 w-3.5" />}
            >
              Imprimir
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={actionBusy === "wa"}
              disabled={!!actionBusy || saving}
              onClick={() => onSaveAndRun("wa")}
              icon={<MessageCircle className="h-3.5 w-3.5" />}
            >
              WhatsApp
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="secondary" loading={saving && !receiptAction}>
              Solo registrar
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                onClose();
                onClearReceipt();
                onResetForm();
              }}
            >
              Cancelar
            </Button>
          </div>
          <p className="text-help text-slate-500">
            Previsualizar, Imprimir o WhatsApp registran el cobro (si hace falta) y abren el
            ticket de una vez.
          </p>

          {lastReceipt && (
            <div className="rounded-lg border border-success-200 bg-success-50/60 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-success-800">
                <Check className="h-4 w-4" />
                Cobro registrado · S/ {lastReceipt.monto.toFixed(2)} ·{" "}
                {formatMetodoLabel(lastReceipt)} · {lastReceipt.concepto}
              </p>
              {typeof lastReceipt.allocated_total === "number" &&
                lastReceipt.allocated_total > 0 && (
                  <p className="mb-2 text-xs text-success-800">
                    Aplicado al plan/evolución: S/{" "}
                    {lastReceipt.allocated_total.toFixed(2)}
                    {(() => {
                      const alloc = lastReceipt.allocations?.[0];
                      const aCuenta =
                        typeof alloc?.a_cuenta_after === "number"
                          ? alloc.a_cuenta_after
                          : null;
                      const costo =
                        typeof alloc?.costo === "number" ? alloc.costo : null;
                      const saldo =
                        typeof lastReceipt.saldo_pendiente_destino === "number"
                          ? lastReceipt.saldo_pendiente_destino
                          : typeof alloc?.saldo_after === "number"
                            ? alloc.saldo_after
                            : null;
                      if (saldo === null) return "";
                      if (saldo <= 0.009) return " · Tratamiento saldado";
                      const parts = [`Saldo pendiente: S/ ${saldo.toFixed(2)}`];
                      if (costo !== null && aCuenta !== null) {
                        parts.unshift(
                          `Presupuesto S/ ${costo.toFixed(2)} · A cuenta S/ ${aCuenta.toFixed(2)}`
                        );
                      }
                      return ` · ${parts.join(" · ")}`;
                    })()}
                  </p>
                )}
              <DocumentActions
                key={`receipt-${lastReceipt.id}-${receiptAction || "idle"}`}
                label="Comprobante de pago"
                documentType="comprobante"
                downloadUrl={`/api/documents/comprobante/${lastReceipt.id}`}
                telefono={lastReceipt.patient_telefono}
                mensaje={waReceiptMessage(lastReceipt)}
                forceFormat="80mm"
                autoOpenPreview={receiptAction === "preview"}
                autoPrint={receiptAction === "print"}
                autoWhatsApp={receiptAction === "wa"}
              />
              {!lastReceipt.patient_id && (
                <p className="mt-2 text-xs text-warning-700">
                  Sin paciente: puedes imprimir, pero no enviar por WhatsApp.
                </p>
              )}
              {!!lastReceipt.patient_id && !lastReceipt.patient_telefono && (
                <p className="mt-2 text-xs text-warning-700">
                  Sin teléfono en la ficha.{" "}
                  <Link
                    href={`/pacientes/${lastReceipt.patient_id}`}
                    className="font-medium text-brand-600 underline"
                  >
                    Completar ficha
                  </Link>
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => {
                    onClearReceipt();
                    onResetForm();
                  }}
                >
                  Otro cobro
                </Button>
              </div>
            </div>
          )}
        </div>
      </form>
    </Card>
  );
}
