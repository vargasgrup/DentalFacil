"use client";

import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Odontograma } from "@/components/Odontograma";
import { DocumentActions } from "@/components/DocumentActions";
import { PruebasComplementarias } from "@/components/PruebasComplementarias";
import { TreatmentAutocomplete } from "@/components/TreatmentAutocomplete";
import { Section } from "@/components/clinical/Section";
import { formatDateTime } from "@/lib/datetime";
import {
  itemSubtotal,
  itemSaldo,
  newPlanAlt,
  normalizeEstado,
  type PlanItem,
  type TreatmentPlans,
} from "@/lib/treatmentPlans";
import { CONSENT_TEXT, FIELD_CLASS } from "../constants";
import type { ClinicalRecord, Patient, SaveState } from "../types";

export interface EvaluacionTabProps {
  patient: Patient;
  patientId: string;
  record: ClinicalRecord;
  recordForm: Partial<ClinicalRecord>;
  setRecordForm: (form: Partial<ClinicalRecord>) => void;
  planBundle: TreatmentPlans;
  setPlanBundle: (bundle: TreatmentPlans) => void;
  planItems: PlanItem[];
  setPlanItems: (items: PlanItem[] | ((prev: PlanItem[]) => PlanItem[])) => void;
  planTotals: { subtotal: number; a_cuenta: number; saldo: number };
  hasOdontogramSnapshot: boolean | null;
  consentText: string;
  doctorDisplay: string;
  saveRecord: () => Promise<void>;
  recordSaved: SaveState;
  toggleConsentimiento: () => void;
  addPlanFromOdontogram: (item: PlanItem) => Promise<void>;
  addItemRow: () => void;
  removeItemRow: (idx: number) => void;
  updateItem: (idx: number, key: keyof PlanItem, val: string | number) => void;
  registerPlanItemInEvolution: (idx: number) => Promise<void>;
}

export function EvaluacionTab({
  patient,
  patientId,
  record,
  recordForm,
  setRecordForm,
  planBundle,
  setPlanBundle,
  planItems,
  setPlanItems,
  planTotals,
  hasOdontogramSnapshot,
  consentText,
  doctorDisplay,
  saveRecord,
  recordSaved,
  toggleConsentimiento,
  addPlanFromOdontogram,
  addItemRow,
  removeItemRow,
  updateItem,
  registerPlanItemInEvolution,
}: EvaluacionTabProps) {
  return (
    <div
      id="ficha-panel-evaluacion"
      role="tabpanel"
      aria-labelledby="ficha-tab-evaluacion"
      className="space-y-5"
    >
      <Section title="Odontograma" noSave>
        {patient.es_migrado && hasOdontogramSnapshot === false && (
          <p className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Este es el estado inicial registrado al momento de la migración (no se
            generarán eventos de evolución por pieza). Guarda un estado de cita en el
            odontograma para fijar el snapshot histórico.
          </p>
        )}
        {patient.es_migrado && hasOdontogramSnapshot === true && (
          <p className="mb-3 text-help text-slate-500">
            Paciente migrado: el odontograma incluye el estado histórico de migración.
          </p>
        )}
        <Odontograma patientId={patientId} onProposeTreatment={addPlanFromOdontogram} />
      </Section>

      <Section title="Diagnóstico" onSave={saveRecord} saveState={recordSaved}>
        <textarea
          value={recordForm.diagnostico || ""}
          onChange={(e) =>
            setRecordForm({ ...recordForm, diagnostico: e.target.value })
          }
          rows={4}
          className={FIELD_CLASS}
          placeholder="Escribe el diagnóstico clínico..."
        />
      </Section>

      <Section title="Plan de tratamiento" onSave={saveRecord} saveState={recordSaved}>
        <p className="mb-3 text-help text-slate-500">
          Presupuesto clínico. Al <strong className="font-medium text-slate-700">Guardar</strong>,
          cada ítem del plan activo se refleja automáticamente en{" "}
          <strong className="font-medium text-slate-700">Evolución clínica</strong> (costo oficial)
          y queda disponible en <strong className="font-medium text-slate-700">Registrar pago</strong>.
          El botón «Evolución» sirve solo si quieres forzar un ítem puntual antes de guardar.
        </p>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {planBundle.alternatives.map((alt) => (
            <button
              key={alt.id}
              type="button"
              onClick={() => setPlanBundle({ ...planBundle, active_id: alt.id })}
              className={`border px-3 py-1.5 text-xs font-semibold ${
                planBundle.active_id === alt.id
                  ? "border-slate-800 bg-slate-800 text-white"
                  : "border-slate-400 bg-white text-slate-700"
              }`}
            >
              {alt.nombre}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              const n = planBundle.alternatives.length + 1;
              const alt = newPlanAlt(`Plan ${String.fromCharCode(64 + n)}`, []);
              setPlanBundle({
                ...planBundle,
                alternatives: [...planBundle.alternatives, alt],
                active_id: alt.id,
              });
            }}
            className="border border-dashed border-slate-400 px-3 py-1.5 text-xs text-slate-600"
          >
            + Alternativa
          </button>
          <div className="ml-auto">
            <DocumentActions
              label="Presupuesto"
              documentType="presupuesto"
              downloadUrl={`/api/documents/presupuesto/${patientId}?plan_id=${planBundle.active_id}`}
              telefono={patient.telefono}
              mensaje={`Hola ${patient.nombres}, adjuntamos el presupuesto de tu plan de tratamiento. Cualquier consulta estamos a disposición. Gracias.`}
              onBeforeFetch={async () => {
                await saveRecord();
              }}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="w-14 py-2 pr-2 font-medium">Pieza</th>
                <th className="py-2 pr-3 font-medium">Tratamiento</th>
                <th className="w-16 py-2 pr-2 font-medium">Cant.</th>
                <th className="w-24 py-2 pr-2 font-medium">Costo unit.</th>
                <th className="w-24 py-2 pr-2 font-medium">A cuenta</th>
                <th className="w-24 py-2 pr-2 font-medium text-right">Subtotal</th>
                <th className="w-24 py-2 pr-2 font-medium text-right">Saldo</th>
                <th className="w-28 py-2 pr-2 font-medium">Estado</th>
                <th className="w-28 py-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {planItems.map((it, idx) => {
                const sub = itemSubtotal(it);
                const saldo = itemSaldo(it);
                return (
                  <tr key={it.id || idx} className="border-b border-slate-100">
                    <td className="py-2 pr-2 align-top">
                      <input
                        value={it.pieza_fdi || ""}
                        onChange={(e) => updateItem(idx, "pieza_fdi", e.target.value)}
                        placeholder="—"
                        className="w-14 rounded-lg border border-slate-200 px-1.5 py-1.5 text-center text-sm tabular-nums focus:border-brand-600 focus:outline-none"
                      />
                      {it.origen === "odontogram" && (
                        <span className="mt-0.5 block text-[9px] text-emerald-700">Odonto</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 align-top">
                      <TreatmentAutocomplete
                        label=""
                        value={it.item}
                        onChange={(v) => updateItem(idx, "item", v)}
                        onSelect={(t) => {
                          setPlanItems(
                            planItems.map((row, i) =>
                              i === idx
                                ? {
                                    ...row,
                                    item: t.nombre,
                                    costo_unitario:
                                      !row.costo_unitario && t.precio_referencial
                                        ? t.precio_referencial
                                        : row.costo_unitario,
                                  }
                                : row
                            )
                          );
                        }}
                        placeholder="Ej: curación, endodoncia…"
                        compact
                        inputClassName="border-slate-200"
                      />
                    </td>
                    <td className="py-2 pr-2 align-top">
                      <input
                        type="number"
                        min={1}
                        value={it.cantidad}
                        onChange={(e) =>
                          updateItem(idx, "cantidad", parseInt(e.target.value) || 1)
                        }
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-brand-600 focus:outline-none"
                      />
                    </td>
                    <td className="py-2 pr-2 align-top">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={it.costo_unitario ?? 0}
                        onChange={(e) =>
                          updateItem(
                            idx,
                            "costo_unitario",
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-brand-600 focus:outline-none"
                      />
                    </td>
                    <td className="py-2 pr-2 align-top">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={it.a_cuenta ?? 0}
                        onChange={(e) => {
                          const subNow = itemSubtotal(it);
                          const raw = parseFloat(e.target.value) || 0;
                          updateItem(idx, "a_cuenta", Math.min(raw, subNow));
                        }}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-brand-600 focus:outline-none"
                      />
                    </td>
                    <td className="py-2 pr-2 text-right align-top font-medium tabular-nums text-slate-700">
                      S/ {sub.toFixed(2)}
                    </td>
                    <td
                      className={`py-2 pr-2 text-right align-top font-medium tabular-nums ${
                        saldo > 0 ? "text-warning-600" : "text-success-600"
                      }`}
                    >
                      S/ {saldo.toFixed(2)}
                    </td>
                    <td className="py-2 pr-2 align-top">
                      <select
                        value={normalizeEstado(it.estado)}
                        onChange={(e) => updateItem(idx, "estado", e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:border-brand-600 focus:outline-none"
                      >
                        <option value="pendiente">Pendiente</option>
                        <option value="en_proceso">En proceso</option>
                        <option value="completado">Completado</option>
                      </select>
                      {it.evolution_entry_id && (
                        <span className="mt-0.5 block text-[9px] text-brand-700">En evolución</span>
                      )}
                    </td>
                    <td className="py-2 align-top">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => registerPlanItemInEvolution(idx)}
                          disabled={Boolean(it.evolution_entry_id)}
                          className="inline-flex items-center gap-0.5 rounded-lg px-1.5 py-1 text-[10px] font-medium text-brand-700 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40"
                          title="Registrar atención en evolución clínica"
                        >
                          <ArrowRight className="h-3 w-3" />
                          Evolución
                        </button>
                        <button
                          type="button"
                          onClick={() => removeItemRow(idx)}
                          className="rounded p-1 text-slate-400 hover:bg-danger-50 hover:text-danger-600"
                          title="Eliminar fila"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <Button variant="secondary" onClick={addItemRow} icon={<Plus className="h-4 w-4" />}>
            Agregar fila
          </Button>
          <div className="min-w-[220px] rounded-lg bg-surface-subtle px-4 py-3 text-sm">
            <div className="flex justify-between gap-6 text-slate-600">
              <span>Total del plan</span>
              <span className="font-semibold tabular-nums text-slate-800">
                S/ {planTotals.subtotal.toFixed(2)}
              </span>
            </div>
            <div className="mt-1 flex justify-between gap-6 text-success-700">
              <span>A cuenta</span>
              <span className="font-medium tabular-nums">
                S/ {planTotals.a_cuenta.toFixed(2)}
              </span>
            </div>
            <div className="mt-1 flex justify-between gap-6 border-t border-slate-200 pt-1 font-semibold text-slate-800">
              <span>Saldo</span>
              <span
                className={`tabular-nums ${
                  planTotals.saldo > 0 ? "text-warning-600" : "text-success-600"
                }`}
              >
                S/ {planTotals.saldo.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
        <p className="mt-2 text-help text-slate-400">
          Guardar el plan sincroniza Evolución y habilita destinos en Registrar pago (Caja).
          Un abono parcial (ej. S/ 100 de S/ 120) actualiza «A cuenta» y deja el saldo
          restante en el mismo ítem para la siguiente cita.
        </p>
      </Section>

      <Section title="Observaciones" onSave={saveRecord} saveState={recordSaved}>
        <textarea
          value={recordForm.observaciones || ""}
          onChange={(e) =>
            setRecordForm({ ...recordForm, observaciones: e.target.value })
          }
          rows={3}
          className={FIELD_CLASS}
          placeholder="Notas adicionales..."
        />
        {record.updated_at && (
          <p className="mt-2 text-help text-slate-400">
            Última actualización:{" "}
            {formatDateTime(record.updated_at)}
          </p>
        )}
      </Section>

      <Section title="Consentimiento informado" noSave>
        <div className="space-y-4">
          <div className="rounded-lg bg-surface-subtle p-4 text-sm leading-relaxed tracking-normal text-slate-600">
            {consentText}
          </div>

          <p className="text-help text-slate-400">
            Odontólogo: <span className="font-medium text-slate-600">{doctorDisplay}</span>
            {" · "}
            Paciente:{" "}
            <span className="font-medium text-slate-600">
              {patient.nombres} {patient.apellidos}
            </span>
          </p>
          <p className="text-help text-slate-500">
            Las firmas del odontólogo y del paciente se realizan en la hoja impresa.
          </p>

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={toggleConsentimiento}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-smooth ${
                record.consentimiento_firmado
                  ? "bg-success-50 text-success-700"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded ${
                  record.consentimiento_firmado
                    ? "bg-success-500 text-white"
                    : "border border-slate-300"
                }`}
              >
                {record.consentimiento_firmado ? "✓" : ""}
              </span>
              {record.consentimiento_firmado
                ? "Consentimiento firmado"
                : "Marcar como firmado"}
            </button>
            {record.consentimiento_fecha && (
              <span className="text-sm text-slate-400">
                {formatDateTime(record.consentimiento_fecha)}
              </span>
            )}
          </div>

          <DocumentActions
            label="Consentimiento"
            documentType="consentimiento"
            downloadUrl={`/api/documents/consentimiento/${patientId}`}
            telefono={patient.telefono}
            mensaje={`Hola ${patient.nombres}, adjuntamos el consentimiento informado para tu tratamiento. Gracias.`}
            markSentUrl={`/api/documents/whatsapp-sent/${record.id}`}
          />
        </div>
      </Section>

      <Section title="Pruebas complementarias" noSave>
        <PruebasComplementarias patientId={patientId} />
      </Section>
    </div>
  );
}