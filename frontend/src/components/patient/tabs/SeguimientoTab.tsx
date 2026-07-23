"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/Input";
import { VoiceDictation } from "@/components/VoiceDictation";
import { DocumentActions } from "@/components/DocumentActions";
import { SpecialtySelect } from "@/components/SpecialtySelect";
import { TreatmentAutocomplete } from "@/components/TreatmentAutocomplete";
import { Section } from "@/components/clinical/Section";
import { MoneyCard } from "@/components/clinical/MoneyCard";
import { formatDateTime } from "@/lib/datetime";
import { especialidadShort } from "@/lib/especialidades";
import { normalizeEstado, type TreatmentPlans } from "@/lib/treatmentPlans";
import { FIELD_CLASS } from "../constants";
import type {
  ClinicalRecord,
  EvolutionEntry,
  FinancialSummary,
  Patient,
  PaymentTarget,
  PaymentTx,
} from "../types";

export interface SeguimientoTabProps {
  patient: Patient;
  patientId: string;
  record: ClinicalRecord;
  planBundle: TreatmentPlans;
  evolution: EvolutionEntry[];
  financial: FinancialSummary | null;
  payments: PaymentTx[];
  evoTotals: { subtotal: number; a_cuenta: number; saldo: number };
  estadoColors: Record<string, string>;
  showEvoForm: boolean;
  setShowEvoForm: (v: boolean) => void;
  newEvo: {
    tratamiento_descripcion: string;
    especialidad: string;
    pieza_fdi: string;
    cantidad: string;
    costo_unitario: string;
    a_cuenta: string;
    estado: string;
  };
  setNewEvo: (v: SeguimientoTabProps["newEvo"]) => void;
  addEvolution: (e: React.FormEvent) => Promise<void>;
  deleteEvolution: (entryId: string) => Promise<void>;
  updateEvolutionEstado: (entryId: string, estado: string) => Promise<void>;
  updateEvolutionField: (
    entryId: string,
    patch: Record<string, string | number | null>
  ) => Promise<void>;
  showPayment: boolean;
  openPaymentForm: () => Promise<void>;
  payMonto: string;
  setPayMonto: (v: string) => void;
  payConcepto: string;
  setPayConcepto: (v: string) => void;
  payMetodo: string;
  setPayMetodo: (v: string) => void;
  payTarget: string;
  setPayTarget: (v: string) => void;
  paymentTargets: PaymentTarget[];
  paySaving: boolean;
  payError: string;
  payInfo: string;
  cashOpen: boolean | null;
  registerPayment: (e: React.FormEvent) => Promise<void>;
  saveRecord: () => Promise<void>;
  onNavigate: (path: string) => void;
}

export function SeguimientoTab({
  patient,
  patientId,
  record,
  planBundle,
  evolution,
  financial,
  payments,
  evoTotals,
  estadoColors,
  showEvoForm,
  setShowEvoForm,
  newEvo,
  setNewEvo,
  addEvolution,
  deleteEvolution,
  updateEvolutionEstado,
  updateEvolutionField,
  showPayment,
  openPaymentForm,
  payMonto,
  setPayMonto,
  payConcepto,
  setPayConcepto,
  payMetodo,
  setPayMetodo,
  payTarget,
  setPayTarget,
  paymentTargets,
  paySaving,
  payError,
  payInfo,
  cashOpen,
  registerPayment,
  saveRecord,
  onNavigate,
}: SeguimientoTabProps) {
  return (
    <div
      id="ficha-panel-seguimiento"
      role="tabpanel"
      aria-labelledby="ficha-tab-seguimiento"
      className="space-y-5"
    >
      <Section
        title="Evolución clínica"
        action={
          <Button
            variant="secondary"
            onClick={() => setShowEvoForm(!showEvoForm)}
            icon={!showEvoForm ? <Plus className="h-4 w-4" /> : undefined}
          >
            {showEvoForm ? "Cancelar" : "Nueva entrada"}
          </Button>
        }
        noSave
      >
        <p className="mb-3 text-help text-slate-500">
          Atenciones realizadas. Fuente del costo oficial de la ficha (con pagos de Caja).
          Misma economía que el plan: cantidad, costo unitario, a cuenta, saldo y estado.
        </p>
        {showEvoForm && (
          <form
            onSubmit={addEvolution}
            className="mb-4 space-y-3 rounded-lg bg-surface-subtle p-4"
          >
            <TreatmentAutocomplete
              label="Tratamiento / descripción"
              value={newEvo.tratamiento_descripcion}
              onChange={(tratamiento_descripcion) =>
                setNewEvo({ ...newEvo, tratamiento_descripcion })
              }
              onSelect={(t) =>
                setNewEvo({
                  ...newEvo,
                  tratamiento_descripcion: t.nombre,
                  especialidad: newEvo.especialidad || t.especialidad,
                  costo_unitario:
                    newEvo.costo_unitario ||
                    (t.precio_referencial
                      ? String(t.precio_referencial)
                      : newEvo.costo_unitario),
                })
              }
              required
              hint="Escribe y elige del catálogo, o deja tu texto libre"
              footer={
                <div className="mt-2">
                  <VoiceDictation
                    value={newEvo.tratamiento_descripcion}
                    onChange={(text) =>
                      setNewEvo({ ...newEvo, tratamiento_descripcion: text })
                    }
                  />
                </div>
              }
            />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Input
                label="Pieza"
                value={newEvo.pieza_fdi}
                onChange={(e) => setNewEvo({ ...newEvo, pieza_fdi: e.target.value })}
                placeholder="FDI"
              />
              <SpecialtySelect
                value={newEvo.especialidad}
                onChange={(especialidad) => setNewEvo({ ...newEvo, especialidad })}
              />
              <Input
                label="Cantidad"
                type="number"
                min={1}
                value={newEvo.cantidad}
                onChange={(e) => setNewEvo({ ...newEvo, cantidad: e.target.value })}
              />
              <Input
                label="Costo unit. (S/)"
                type="number"
                step="0.01"
                value={newEvo.costo_unitario}
                onChange={(e) => setNewEvo({ ...newEvo, costo_unitario: e.target.value })}
              />
              <Input
                label="A cuenta (S/)"
                type="number"
                step="0.01"
                value={newEvo.a_cuenta}
                onChange={(e) => setNewEvo({ ...newEvo, a_cuenta: e.target.value })}
              />
              <label className="block">
                <span className="mb-1 block text-label text-slate-700">Estado</span>
                <select
                  value={newEvo.estado}
                  onChange={(e) => setNewEvo({ ...newEvo, estado: e.target.value })}
                  className={FIELD_CLASS}
                >
                  <option value="pendiente">Pendiente</option>
                  <option value="en_proceso">En proceso</option>
                  <option value="completado">Completado</option>
                </select>
              </label>
            </div>
            <p className="text-help text-slate-400">
              Subtotal: S/{" "}
              {(
                Math.max(1, parseFloat(newEvo.cantidad) || 1) *
                (parseFloat(newEvo.costo_unitario) || 0)
              ).toFixed(2)}
              . Fecha y hora al guardar.
            </p>
            <Button type="submit">Agregar</Button>
          </form>
        )}

        {evolution.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            Sin registros de evolución aún
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2 pr-3 font-medium">Fecha</th>
                  <th className="w-14 py-2 pr-2 font-medium">Pieza</th>
                  <th className="py-2 pr-3 font-medium">Tratamiento</th>
                  <th className="py-2 pr-2 font-medium">Esp.</th>
                  <th className="w-14 py-2 pr-2 font-medium">Cant.</th>
                  <th className="w-24 py-2 pr-2 font-medium text-right">Costo unit.</th>
                  <th className="w-24 py-2 pr-2 font-medium text-right">Subtotal</th>
                  <th className="w-24 py-2 pr-2 font-medium text-right">A cuenta</th>
                  <th className="w-24 py-2 pr-2 font-medium text-right">Saldo</th>
                  <th className="w-28 py-2 pr-2 font-medium">Estado</th>
                  <th className="py-2 pr-2 font-medium">PDF</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {evolution.map((e) => {
                  const cant = Number(e.cantidad) || 1;
                  const unit =
                    Number(e.costo_unitario) ||
                    (cant ? Number(e.costo) / cant : Number(e.costo)) ||
                    0;
                  const sub = Number(e.costo) || cant * unit;
                  const saldo = sub - (Number(e.a_cuenta) || 0);
                  return (
                    <tr key={e.id} className="border-b border-slate-100">
                      <td className="py-2 pr-3 text-slate-400">
                        {formatDateTime(e.fecha)}
                      </td>
                      <td className="py-2 pr-2 tabular-nums text-slate-600">
                        {e.pieza_fdi || "—"}
                      </td>
                      <td className="py-2 pr-3">
                        {e.tratamiento_descripcion}
                        {e.origen === "migracion" && (
                          <span className="mt-0.5 block text-[9px] font-medium text-slate-500">
                            Migración (histórico)
                          </span>
                        )}
                        {e.plan_item_id && (
                          <span className="mt-0.5 block text-[9px] text-brand-700">
                            Desde plan
                          </span>
                        )}
                      </td>
                      <td
                        className="py-2 pr-2 text-slate-500"
                        title={e.especialidad || undefined}
                      >
                        {especialidadShort(e.especialidad)}
                      </td>
                      <td className="py-2 pr-2 tabular-nums">{cant}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">
                        S/ {unit.toFixed(2)}
                      </td>
                      <td className="py-2 pr-2 text-right font-medium tabular-nums">
                        S/ {sub.toFixed(2)}
                      </td>
                      <td className="py-2 pr-2 text-right">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          defaultValue={Number(e.a_cuenta) || 0}
                          key={`ac-${e.id}-${e.a_cuenta}`}
                          onBlur={(ev) => {
                            const next = Math.min(parseFloat(ev.target.value) || 0, sub);
                            if (next !== Number(e.a_cuenta)) {
                              updateEvolutionField(e.id, { a_cuenta: next });
                            }
                          }}
                          className="w-full rounded-lg border border-slate-200 px-1.5 py-1 text-right text-sm text-success-700 focus:border-brand-600 focus:outline-none"
                        />
                      </td>
                      <td
                        className={`py-2 pr-2 text-right font-medium tabular-nums ${
                          saldo > 0 ? "text-warning-600" : "text-success-600"
                        }`}
                      >
                        S/ {saldo.toFixed(2)}
                      </td>
                      <td className="py-2 pr-2">
                        <select
                          value={normalizeEstado(e.estado)}
                          onChange={(ev) => updateEvolutionEstado(e.id, ev.target.value)}
                          className={`rounded-lg px-2 py-1 text-xs font-medium ${
                            estadoColors[normalizeEstado(e.estado)] || ""
                          }`}
                        >
                          <option value="pendiente">Pendiente</option>
                          <option value="en_proceso">En proceso</option>
                          <option value="completado">Completado</option>
                        </select>
                      </td>
                      <td className="py-2 pr-2">
                        <DocumentActions
                          label="Evolución"
                          documentType="evolucion"
                          downloadUrl={`/api/documents/evolucion/${e.id}`}
                          telefono={patient.telefono}
                          mensaje={`Hola ${patient.nombres}, adjuntamos el registro de evolución clínica. Gracias.`}
                          compact
                          hidePreview
                          hideDownload
                        />
                      </td>
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() => deleteEvolution(e.id)}
                          className="rounded p-1 text-slate-400 hover:bg-danger-50 hover:text-danger-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-3 flex justify-end">
              <div className="min-w-[220px] rounded-lg bg-surface-subtle px-4 py-3 text-sm">
                <div className="flex justify-between gap-6 text-slate-600">
                  <span>Total evolución</span>
                  <span className="font-semibold tabular-nums text-slate-800">
                    S/ {evoTotals.subtotal.toFixed(2)}
                  </span>
                </div>
                <div className="mt-1 flex justify-between gap-6 text-success-700">
                  <span>A cuenta</span>
                  <span className="font-medium tabular-nums">
                    S/ {evoTotals.a_cuenta.toFixed(2)}
                  </span>
                </div>
                <div className="mt-1 flex justify-between gap-6 border-t border-slate-200 pt-1 font-semibold">
                  <span>Saldo</span>
                  <span
                    className={`tabular-nums ${
                      evoTotals.saldo > 0 ? "text-warning-600" : "text-success-600"
                    }`}
                  >
                    S/ {evoTotals.saldo.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </Section>

      <div id="resumen-financiero">
        <Section title="Resumen financiero del tratamiento" noSave>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MoneyCard label="Costo total (evolución)" value={financial?.costo_total} />
            <MoneyCard label="Pagado (Caja)" value={financial?.pagado_total} tone="success" />
            <MoneyCard label="Saldo" value={financial?.saldo} tone="warning" />
          </div>
          <p className="mt-2 text-help text-slate-500">
            El pago se registra en Caja y se asigna a Evolución / Plan (A cuenta y Saldo) en
            el mismo acto. Costo oficial = evolución · Pagado oficial = caja.
            {typeof financial?.a_cuenta_clinico === "number" && (
              <>
                {" "}
                A cuenta clínico: S/ {Number(financial.a_cuenta_clinico).toFixed(2)}
                {typeof financial.plan_estimado === "number" &&
                  financial.plan_estimado > 0 && (
                    <>
                      {" · "}
                      Plan activo: S/ {Number(financial.plan_estimado).toFixed(2)} (saldo
                      plan S/ {Number(financial.plan_saldo || 0).toFixed(2)})
                    </>
                  )}
              </>
            )}
          </p>
          <div className="mt-3 flex justify-end">
            <Button
              variant="secondary"
              onClick={openPaymentForm}
              icon={!showPayment ? <Plus className="h-4 w-4" /> : undefined}
            >
              {showPayment ? "Cancelar" : "Registrar pago"}
            </Button>
          </div>
          {showPayment && (
            <form
              onSubmit={registerPayment}
              className="mt-3 space-y-3 rounded-card border border-slate-200 bg-white p-4"
            >
              <h3 className="font-medium text-slate-700">Registrar pago</h3>
              <p className="text-help text-slate-400">
                {cashOpen === false
                  ? "No hay caja abierta: al registrar se abrirá automáticamente (monto inicial S/ 0)."
                  : cashOpen === true
                    ? "Caja abierta. El monto entra a Caja y actualiza A cuenta / Saldo del destino clínico."
                    : "El monto entra a Caja y actualiza A cuenta / Saldo (FIFO automático o línea elegida). Si la caja está cerrada, se abrirá al registrar."}
              </p>
              {payError && (
                <p
                  role="alert"
                  className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-800"
                >
                  {payError}
                </p>
              )}
              {payInfo && !payError && (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {payInfo}
                </p>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Input
                  label="Monto (S/)"
                  type="number"
                  step="0.01"
                  min={0.01}
                  value={payMonto}
                  onChange={(e) => setPayMonto(e.target.value)}
                  required
                  disabled={paySaving}
                />
                <label className="block sm:col-span-1 lg:col-span-1">
                  <span className="mb-1 block text-label text-slate-700">
                    Aplicar a
                  </span>
                  <select
                    value={payTarget}
                    disabled={paySaving}
                    onChange={(e) => {
                      setPayTarget(e.target.value);
                      const t = paymentTargets.find(
                        (x) => `${x.kind}:${x.id}` === e.target.value
                      );
                      if (t && !payConcepto) {
                        setPayConcepto(
                          `Abono — ${t.label}${
                            t.pieza_fdi ? ` (pieza ${t.pieza_fdi})` : ""
                          }`
                        );
                      }
                      if (t && !payMonto) {
                        setPayMonto(String(t.saldo));
                      }
                    }}
                    className={FIELD_CLASS}
                  >
                    <option value="auto">
                      Automático (FIFO — saldos abiertos)
                    </option>
                    {paymentTargets.map((t) => (
                      <option key={`${t.kind}:${t.id}`} value={`${t.kind}:${t.id}`}>
                        {t.kind === "evolution" ? "Evolución" : "Plan"}: {t.label}
                        {t.pieza_fdi ? ` · pieza ${t.pieza_fdi}` : ""} — saldo S/{" "}
                        {t.saldo.toFixed(2)}
                      </option>
                    ))}
                  </select>
                </label>
                <TreatmentAutocomplete
                  label="Concepto"
                  value={payConcepto}
                  onChange={setPayConcepto}
                  onSelect={(t) => {
                    setPayConcepto(t.nombre);
                    if (!payMonto && t.precio_referencial) {
                      setPayMonto(String(t.precio_referencial));
                    }
                  }}
                  placeholder="Abono, cuota ortodoncia…"
                />
                <label className="block">
                  <span className="mb-1 block text-label text-slate-700">Método</span>
                  <select
                    value={payMetodo}
                    disabled={paySaving}
                    onChange={(e) => setPayMetodo(e.target.value)}
                    className={FIELD_CLASS}
                  >
                    <option value="efectivo">Efectivo</option>
                    <option value="tarjeta">Tarjeta</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="yape">Yape</option>
                    <option value="plin">Plin</option>
                  </select>
                </label>
              </div>
              {paymentTargets.length === 0 && (
                <p className="text-help text-warning-700">
                  No hay líneas con saldo en plan/evolución. El pago quedará en Caja como
                  abono del paciente (podrás asignarlo cuando existan costos).
                </p>
              )}
              <Button type="submit" loading={paySaving} disabled={paySaving}>
                {paySaving ? "Registrando…" : "Registrar"}
              </Button>
            </form>
          )}

          {payments.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-2 text-sm font-semibold text-slate-700">
                Historial de pagos
              </h3>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-surface-subtle text-left text-slate-500">
                      <th className="px-3 py-2 font-medium">Fecha</th>
                      <th className="px-3 py-2 font-medium">Concepto</th>
                      <th className="px-3 py-2 font-medium">Método</th>
                      <th className="px-3 py-2 font-medium text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="border-b border-slate-50">
                        <td className="px-3 py-2 text-slate-400">
                          {formatDateTime(p.created_at, { year: undefined })}
                        </td>
                        <td className="px-3 py-2">{p.concepto}</td>
                        <td className="px-3 py-2 capitalize text-slate-500">
                          {p.metodo_pago}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-success-600">
                          S/ {Number(p.monto).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Section>
      </div>

      <Section title="Documentos" noSave>
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Ficha clínica completa</p>
            <DocumentActions
              label="Ficha clínica"
              documentType="ficha"
              downloadUrl={`/api/documents/ficha/${patientId}`}
              telefono={patient.telefono}
              mensaje={`Hola ${patient.nombres}, adjuntamos tu ficha clínica. Cualquier consulta estamos a disposición. Gracias.`}
            />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Presupuesto (plan activo)</p>
            <DocumentActions
              label="Presupuesto"
              documentType="presupuesto"
              downloadUrl={`/api/documents/presupuesto/${patientId}?plan_id=${planBundle.active_id}`}
              telefono={patient.telefono}
              mensaje={`Hola ${patient.nombres}, adjuntamos el presupuesto de tu plan de tratamiento. Gracias.`}
              onBeforeFetch={async () => {
                await saveRecord();
              }}
            />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Consentimiento informado</p>
            <DocumentActions
              label="Consentimiento"
              documentType="consentimiento"
              downloadUrl={`/api/documents/consentimiento/${patientId}`}
              telefono={patient.telefono}
              mensaje={`Hola ${patient.nombres}, adjuntamos el consentimiento informado. Gracias.`}
              markSentUrl={`/api/documents/whatsapp-sent/${record.id}`}
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => onNavigate("/reportes")}>
            Ir a Reportes
          </Button>
          <Button variant="ghost" onClick={() => onNavigate("/caja")}>
            Ir a Caja
          </Button>
          <Button variant="ghost" onClick={() => onNavigate("/configuracion")}>
            Configuración
          </Button>
        </div>
      </Section>
    </div>
  );
}
