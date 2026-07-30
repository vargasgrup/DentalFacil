"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ClipboardList, Scale } from "lucide-react";
import { DocumentActions } from "@/components/DocumentActions";
import {
  CONSENT_CATALOG,
  DEFAULT_CONSENT_TIPO,
} from "@/lib/consentCatalog";
import { formatDateTime } from "@/lib/datetime";
import type { PlanItem } from "@/lib/treatmentPlans";
import type { ClinicalRecord, Patient } from "./types";

type ConsentMode = "plan" | "cop";

type Props = {
  patient: Patient;
  patientId: string;
  record: ClinicalRecord;
  planItems: PlanItem[];
  doctorDisplay: string;
  inactive: boolean;
  toggleConsentimiento: () => void;
};

export function ConsentimientoInformadoPanel({
  patient,
  patientId,
  record,
  planItems,
  doctorDisplay,
  inactive,
  toggleConsentimiento,
}: Props) {
  const [mode, setMode] = useState<ConsentMode>("plan");
  const [tipoId, setTipoId] = useState(DEFAULT_CONSENT_TIPO);

  const selectedCop = useMemo(
    () => CONSENT_CATALOG.find((t) => t.id === tipoId) ?? CONSENT_CATALOG[0],
    [tipoId],
  );

  const activePlanItems = useMemo(
    () => planItems.filter((it) => (it.estado || "").toLowerCase() !== "anulado"),
    [planItems],
  );

  const downloadUrl =
    mode === "plan"
      ? `/api/documents/consentimiento/${patientId}?origen=plan`
      : `/api/documents/consentimiento/${patientId}?origen=cop&tipo=${encodeURIComponent(
          selectedCop?.id ?? DEFAULT_CONSENT_TIPO,
        )}`;

  const patientName = `${patient.nombres} ${patient.apellidos}`.trim();
  const docLabel =
    mode === "plan"
      ? "Consentimiento · Plan de tratamiento"
      : `Consentimiento · ${selectedCop?.label ?? "COP"}`;

  return (
    <div className="space-y-4">
      {/* Selector de origen: 2 modos claros */}
      <div
        className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1"
        role="tablist"
        aria-label="Tipo de consentimiento"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "plan"}
          disabled={inactive}
          onClick={() => setMode("plan")}
          className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-smooth disabled:opacity-50 ${
            mode === "plan"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-800"
          }`}
        >
          <ClipboardList className="h-4 w-4 shrink-0" aria-hidden />
          Plan de tratamiento
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "cop"}
          disabled={inactive}
          onClick={() => setMode("cop")}
          className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-smooth disabled:opacity-50 ${
            mode === "cop"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-800"
          }`}
        >
          <Scale className="h-4 w-4 shrink-0" aria-hidden />
          Oficial COP
        </button>
      </div>

      {mode === "plan" ? (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-slate-600">
            Genera el consentimiento con el diagnóstico y los ítems del{" "}
            <span className="font-medium text-slate-800">plan activo</span>. Incluye
            membrete de Configuración, paciente y odontólogo emisor.
          </p>
          {activePlanItems.length === 0 ? (
            <p
              role="status"
              className="rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-800"
            >
              El plan aún no tiene tratamientos. Puedes emitir el documento igual; el PDF
              indicará que el detalle se explicó en consulta. Agrega ítems arriba para
              listarlos automáticamente.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm">
              {activePlanItems.slice(0, 6).map((it, idx) => (
                <li
                  key={`${it.pieza_fdi ?? "x"}-${idx}`}
                  className="flex items-baseline justify-between gap-3 px-3 py-2"
                >
                  <span className="min-w-0 truncate text-slate-700">
                    <span className="font-medium tabular-nums text-slate-500">
                      {it.pieza_fdi || "—"}
                    </span>{" "}
                    {it.item || "Tratamiento"}
                  </span>
                  <span className="shrink-0 text-help capitalize text-slate-400">
                    {it.estado || "pendiente"}
                  </span>
                </li>
              ))}
              {activePlanItems.length > 6 && (
                <li className="px-3 py-2 text-help text-slate-400">
                  +{activePlanItems.length - 6} más en el PDF
                </li>
              )}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-slate-600">
            Textos oficiales del Colegio Odontológico del Perú, adaptados con datos de la
            clínica, paciente y odontólogo.
          </p>
          <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
            Procedimiento
          </label>
          <div className="relative">
            <select
              value={selectedCop?.id ?? DEFAULT_CONSENT_TIPO}
              onChange={(e) => setTipoId(e.target.value)}
              disabled={inactive}
              className="w-full appearance-none rounded-lg border border-slate-300 bg-white py-2.5 pl-3 pr-10 text-sm font-medium text-slate-800 shadow-sm transition-smooth focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 disabled:opacity-60"
              aria-label="Seleccionar consentimiento COP"
            >
              {CONSENT_CATALOG.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
          </div>
          {selectedCop && (
            <p className="text-help leading-snug text-slate-500 [text-wrap:pretty]">
              {selectedCop.preview}
            </p>
          )}
        </div>
      )}

      <p className="text-help text-slate-500">
        Odontólogo: <span className="font-medium text-slate-600">{doctorDisplay}</span>
        {" · "}
        Paciente: <span className="font-medium text-slate-600">{patientName}</span>
        {" · "}
        Firmas en la hoja impresa.
      </p>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={toggleConsentimiento}
          disabled={inactive}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-smooth disabled:cursor-not-allowed disabled:opacity-50 ${
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
        key={downloadUrl}
        label={docLabel}
        documentType="consentimiento"
        downloadUrl={downloadUrl}
        defaultFormat="A4"
        telefono={patient.telefono}
        mensaje={
          mode === "plan"
            ? `Hola ${patient.nombres}, adjuntamos el consentimiento informado de tu plan de tratamiento. Gracias.`
            : `Hola ${patient.nombres}, adjuntamos el consentimiento informado de ${
                selectedCop?.label ?? "tratamiento"
              }. Gracias.`
        }
        markSentUrl={`/api/documents/whatsapp-sent?patient_id=${patientId}&tipo=consentimiento`}
      />
    </div>
  );
}
