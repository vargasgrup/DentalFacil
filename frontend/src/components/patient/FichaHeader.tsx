"use client";

import { useState } from "react";
import { Pencil, UserX, UserCheck } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatFichaCode } from "@/lib/ficha";
import {
  PatientEditModal,
  type PatientAdmin,
} from "@/components/patient/PatientEditModal";
import type { Patient } from "./types";

interface FichaHeaderProps {
  patient: Patient;
  onBack: () => void;
  onPatientUpdated?: (patient: Patient) => void;
}

export function FichaHeader({ patient, onBack, onPatientUpdated }: FichaHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const inactive = patient.activo === false;

  const toggleActivo = async () => {
    const nextActive = inactive;
    const ok = window.confirm(
      nextActive
        ? `¿Reactivar a ${patient.nombres} ${patient.apellidos}?`
        : `¿Dar de baja a ${patient.nombres} ${patient.apellidos}?\nLa historia clínica se conserva.`
    );
    if (!ok) return;
    setBusy(true);
    setMsg("");
    try {
      const path = nextActive
        ? `/api/patients/${patient.id}/reactivate`
        : `/api/patients/${patient.id}/deactivate`;
      const updated = await apiFetch<Patient>(path, { method: "POST" });
      onPatientUpdated?.(updated);
      setMsg(nextActive ? "Paciente reactivado." : "Paciente dado de baja.");
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : "No se pudo actualizar el estado.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-slate-400">
            <button type="button" onClick={onBack} className="hover:text-brand-600">
              Pacientes
            </button>
            <span className="mx-1.5">/</span>
            <span className="font-medium text-slate-600">Ficha clínica</span>
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-page-title tracking-normal text-slate-800">
              {patient.nombres} {patient.apellidos}
            </h1>
            <Badge variant="brand" className="font-mono tracking-wide">
              {formatFichaCode(patient.numero_ficha)}
            </Badge>
            {inactive && <Badge variant="neutral">Inactivo</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            icon={<Pencil className="h-3.5 w-3.5" />}
            onClick={() => setEditing(true)}
          >
            Editar datos
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            icon={
              inactive ? (
                <UserCheck className="h-3.5 w-3.5" />
              ) : (
                <UserX className="h-3.5 w-3.5" />
              )
            }
            onClick={() => void toggleActivo()}
          >
            {inactive ? "Reactivar" : "Dar de baja"}
          </Button>
        </div>
      </div>

      {msg && <p className="mt-2 text-sm text-slate-500">{msg}</p>}

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

      {editing && (
        <PatientEditModal
          patient={patient as PatientAdmin}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            onPatientUpdated?.(updated as Patient);
            setMsg("Datos actualizados.");
          }}
        />
      )}
    </div>
  );
}
