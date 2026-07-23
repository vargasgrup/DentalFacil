"use client";

import type { Patient } from "./types";

interface FichaHeaderProps {
  patient: Patient;
  onBack: () => void;
}

export function FichaHeader({ patient, onBack }: FichaHeaderProps) {
  return (
    <div>
      <p className="text-sm text-slate-400">
        <button
          type="button"
          onClick={onBack}
          className="hover:text-brand-600"
        >
          Pacientes
        </button>
        <span className="mx-1.5">/</span>
        <span className="font-medium text-slate-600">Ficha clínica</span>
      </p>
      <h1 className="mt-1 text-page-title tracking-normal text-slate-800">
        {patient.nombres} {patient.apellidos}
      </h1>
      {patient.es_migrado && (
        <p className="mt-2 inline-flex items-center rounded-lg border border-slate-200 bg-surface-subtle px-3 py-1.5 text-sm text-slate-700">
          <span aria-hidden className="mr-1.5">
            🕓
          </span>
          Migrado — datos históricos desde{" "}
          <span className="ml-1 font-medium text-slate-900">
            {patient.fecha_ingreso_clinica
              ? new Date(`${patient.fecha_ingreso_clinica}T12:00:00`).toLocaleDateString(
                  "es-PE",
                  { day: "2-digit", month: "short", year: "numeric" }
                )
              : "fecha no registrada"}
          </span>
        </p>
      )}
    </div>
  );
}
