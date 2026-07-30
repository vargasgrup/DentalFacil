"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, FileText, Scale } from "lucide-react";
import { DocumentActions } from "@/components/DocumentActions";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import type { ClinicalRecord, Patient } from "./types";

type ConsentTipo = {
  id: string;
  label: string;
  title: string;
  preview?: string;
};

type Props = {
  patient: Patient;
  patientId: string;
  record: ClinicalRecord;
  doctorDisplay: string;
  inactive: boolean;
  toggleConsentimiento: () => void;
};

export function ConsentimientoInformadoPanel({
  patient,
  patientId,
  record,
  doctorDisplay,
  inactive,
  toggleConsentimiento,
}: Props) {
  const [tipos, setTipos] = useState<ConsentTipo[]>([]);
  const [tipoId, setTipoId] = useState("exodoncia_simple");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await apiFetch<ConsentTipo[]>("/api/documents/consentimiento-tipos");
        if (cancelled) return;
        setTipos(data);
        if (data.length && !data.some((t) => t.id === tipoId)) {
          setTipoId(data[0].id);
        }
      } catch {
        if (!cancelled) setLoadError("No se pudo cargar el catálogo de consentimientos.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carga única al montar
  }, []);

  const selected = useMemo(
    () => tipos.find((t) => t.id === tipoId) ?? null,
    [tipos, tipoId],
  );

  const downloadUrl = `/api/documents/consentimiento/${patientId}?tipo=${encodeURIComponent(tipoId)}`;
  const patientName = `${patient.nombres} ${patient.apellidos}`.trim();

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-gradient-to-br from-slate-50 via-white to-brand-50/40 shadow-sm">
        <div className="flex items-start gap-3 border-b border-slate-100 px-4 py-3.5">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
            <Scale className="h-4 w-4" aria-hidden strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold tracking-tight text-slate-800">
              Consentimientos oficiales COP
            </p>
            <p className="mt-0.5 text-help leading-snug text-slate-500">
              Textos del Colegio Odontológico del Perú, con membrete y datos de
              Configuración, paciente y odontólogo emisor.
            </p>
          </div>
        </div>

        <div className="space-y-3 px-4 py-4">
          <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
            Tipo de consentimiento
          </label>
          <div className="relative">
            <FileText
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-600"
              aria-hidden
            />
            <select
              value={tipoId}
              onChange={(e) => setTipoId(e.target.value)}
              disabled={loading || inactive || tipos.length === 0}
              className="w-full appearance-none rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-10 text-sm font-medium text-slate-800 shadow-sm transition-smooth focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Seleccionar consentimiento informado"
            >
              {loading && <option value={tipoId}>Cargando catálogo…</option>}
              {!loading &&
                tipos.map((t) => (
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

          {!loading && tipos.length > 0 && (
            <div
              className="flex flex-wrap gap-1.5"
              role="listbox"
              aria-label="Acceso rápido a consentimientos"
            >
              {tipos.map((t) => {
                const active = t.id === tipoId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    disabled={inactive}
                    onClick={() => setTipoId(t.id)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-smooth disabled:cursor-not-allowed disabled:opacity-50 ${
                      active
                        ? "bg-brand-600 text-white shadow-sm"
                        : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-slate-800"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          )}

          {loadError && (
            <p className="text-sm text-danger-600" role="alert">
              {loadError}
            </p>
          )}

          {selected && (
            <div className="rounded-lg border border-slate-200 bg-white/90 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-700">
                Vista previa del texto oficial
              </p>
              <h3 className="mt-1.5 text-sm font-semibold leading-snug text-slate-900">
                {selected.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 [text-align:justify]">
                {selected.preview ||
                  "El documento PDF incluirá el texto normativo completo con justificación tipográfica, listo para impresión."}
              </p>
              <p className="mt-3 border-t border-slate-100 pt-2 text-help text-slate-400">
                Odontólogo:{" "}
                <span className="font-medium text-slate-600">{doctorDisplay}</span>
                {" · "}
                Paciente:{" "}
                <span className="font-medium text-slate-600">{patientName}</span>
              </p>
            </div>
          )}
        </div>
      </div>

      <p className="text-help text-slate-500">
        Las firmas del odontólogo y del paciente se realizan en la hoja impresa. El PDF
        usa el logo y datos del centro desde Configuración.
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
        label={selected ? `Consentimiento · ${selected.label}` : "Consentimiento"}
        documentType="consentimiento"
        downloadUrl={downloadUrl}
        defaultFormat="A4"
        telefono={patient.telefono}
        mensaje={`Hola ${patient.nombres}, adjuntamos el consentimiento informado${
          selected ? ` de ${selected.label}` : ""
        } para tu tratamiento. Gracias.`}
        markSentUrl={`/api/documents/whatsapp-sent?patient_id=${patientId}&tipo=consentimiento`}
      />
    </div>
  );
}
