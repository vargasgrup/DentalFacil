"use client";

import { Calendar } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/Input";
import { Section } from "@/components/clinical/Section";
import { formatFichaCode } from "@/lib/ficha";
import { FIELD_CLASS, HABITOS } from "../constants";
import type { ClinicalRecord, Patient, SaveState } from "../types";

export interface HistoriaTabProps {
  patient: Patient;
  patientId: string;
  patientForm: Partial<Patient>;
  setPatientForm: (form: Partial<Patient>) => void;
  recordForm: Partial<ClinicalRecord>;
  setRecordForm: (form: Partial<ClinicalRecord>) => void;
  edad: number | null;
  allergyTags: string[];
  allergyInput: string;
  setAllergyInput: (v: string) => void;
  addAllergyTag: () => void;
  removeAllergyTag: (idx: number) => void;
  habitos: string[];
  odonNotes: string;
  setOdonNotes: (v: string) => void;
  toggleHabito: (key: string) => void;
  savePatient: () => void;
  saveRecord: () => void;
  patientSaved: SaveState;
  recordSaved: SaveState;
  onAgendarCita: () => void;
}

export function HistoriaTab({
  patient,
  patientForm,
  setPatientForm,
  recordForm,
  setRecordForm,
  edad,
  allergyTags,
  allergyInput,
  setAllergyInput,
  addAllergyTag,
  removeAllergyTag,
  habitos,
  odonNotes,
  setOdonNotes,
  toggleHabito,
  savePatient,
  saveRecord,
  patientSaved,
  recordSaved,
  onAgendarCita,
}: HistoriaTabProps) {
  return (
    <div
      id="ficha-panel-historia"
      role="tabpanel"
      aria-labelledby="ficha-tab-historia"
      className="space-y-5"
    >
      <Section title="Datos de identificación" onSave={savePatient} saveState={patientSaved}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-subtle px-4 py-3">
          <div>
            <span className="text-help tracking-wide text-slate-400">Nº de ficha</span>
            <p className="font-mono text-lg font-bold tracking-wide text-slate-800">
              {formatFichaCode(patient.numero_ficha)}
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={onAgendarCita}
            icon={<Calendar className="h-4 w-4" />}
          >
            Agendar cita
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Nombres"
            value={patientForm.nombres || ""}
            onChange={(e) => setPatientForm({ ...patientForm, nombres: e.target.value })}
          />
          <Input
            label="Apellidos"
            value={patientForm.apellidos || ""}
            onChange={(e) => setPatientForm({ ...patientForm, apellidos: e.target.value })}
          />
          <label className="block">
            <span className="mb-1 block text-label tracking-wide text-slate-700">Tipo documento</span>
            <select
              value={patientForm.tipo_documento || "DNI"}
              onChange={(e) =>
                setPatientForm({ ...patientForm, tipo_documento: e.target.value })
              }
              className={FIELD_CLASS}
            >
              <option value="DNI">DNI</option>
              <option value="CE">CE</option>
              <option value="Pasaporte">Pasaporte</option>
            </select>
          </label>
          <Input
            label="Nº documento"
            value={patientForm.numero_documento || ""}
            onChange={(e) =>
              setPatientForm({ ...patientForm, numero_documento: e.target.value })
            }
          />
          <Input
            label="Fecha de nacimiento"
            type="date"
            value={patientForm.fecha_nacimiento || ""}
            onChange={(e) =>
              setPatientForm({ ...patientForm, fecha_nacimiento: e.target.value })
            }
          />
          <Input
            label="Edad"
            value={edad !== null ? `${edad} años` : "—"}
            disabled
          />
          <Input
            label="Lugar de nacimiento / procedencia"
            value={patientForm.lugar_nacimiento || ""}
            onChange={(e) =>
              setPatientForm({ ...patientForm, lugar_nacimiento: e.target.value })
            }
          />
          <Input
            label="Ocupación / profesión"
            value={patientForm.ocupacion || ""}
            onChange={(e) =>
              setPatientForm({ ...patientForm, ocupacion: e.target.value })
            }
          />
          <label className="block">
            <span className="mb-1 block text-label tracking-wide text-slate-700">Estado civil</span>
            <select
              value={patientForm.estado_civil || ""}
              onChange={(e) =>
                setPatientForm({ ...patientForm, estado_civil: e.target.value })
              }
              className={FIELD_CLASS}
            >
              <option value="">—</option>
              <option value="Soltero">Soltero/a</option>
              <option value="Casado">Casado/a</option>
              <option value="Conviviente">Conviviente</option>
              <option value="Divorciado">Divorciado/a</option>
              <option value="Viudo">Viudo/a</option>
            </select>
          </label>
          <Input
            label="Email"
            type="email"
            value={patientForm.email || ""}
            onChange={(e) => setPatientForm({ ...patientForm, email: e.target.value })}
          />
          <Input
            label="Teléfono / celular"
            value={patientForm.telefono || ""}
            onChange={(e) => setPatientForm({ ...patientForm, telefono: e.target.value })}
            placeholder="9XXXXXXXX"
          />
          <Input
            label="Contacto de emergencia"
            value={patientForm.contacto_emergencia || ""}
            onChange={(e) =>
              setPatientForm({ ...patientForm, contacto_emergencia: e.target.value })
            }
          />
          <Input
            label="Dirección"
            value={patientForm.direccion || ""}
            onChange={(e) => setPatientForm({ ...patientForm, direccion: e.target.value })}
          />
          <Input
            label="Padre/madre/tutor (si aplica)"
            value={patientForm.nombre_responsable || ""}
            onChange={(e) =>
              setPatientForm({ ...patientForm, nombre_responsable: e.target.value })
            }
            placeholder="Nombre del responsable"
          />
        </div>

        <label className="mt-4 block">
          <span className="mb-1 block text-label tracking-wide text-slate-700">
            Alergias
          </span>
          <div className="mb-2 flex flex-wrap gap-2">
            {allergyTags.map((tag, idx) => (
              <span
                key={`${tag}-${idx}`}
                className="inline-flex items-center gap-1 rounded-pill border border-warning-200 bg-warning-50 px-2.5 py-1 text-xs font-medium text-warning-800"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeAllergyTag(idx)}
                  className="text-warning-600 hover:text-danger-600"
                  aria-label={`Quitar ${tag}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={allergyInput}
              onChange={(e) => setAllergyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addAllergyTag();
                }
              }}
              placeholder="Ej: Látex — Enter para agregar"
              className={FIELD_CLASS}
            />
            <Button type="button" variant="secondary" onClick={addAllergyTag}>
              Agregar
            </Button>
          </div>
          <span className="mt-1 block text-help text-slate-400">
            Escribe cada alergia y pulsa Enter (ej. Látex, penicilina).
          </span>
        </label>
      </Section>

      <Section title="Antecedentes" onSave={saveRecord} saveState={recordSaved}>
        <div className="space-y-5">
          <div>
            <span className="mb-1 block text-label tracking-wide text-slate-700">
              a. Antecedentes médicos
            </span>
            <textarea
              value={recordForm.antecedentes_medicos || ""}
              onChange={(e) =>
                setRecordForm({ ...recordForm, antecedentes_medicos: e.target.value })
              }
              rows={4}
              className={FIELD_CLASS}
              placeholder="Enfermedades crónicas, medicación actual, cirugías previas, etc."
            />
          </div>
          <div>
            <span className="mb-2 block text-label tracking-wide text-slate-700">
              b. Antecedentes odontológicos
            </span>
            <div className="mb-3 flex flex-wrap gap-2">
              {HABITOS.map((h) => {
                const on = habitos.includes(h.key);
                return (
                  <button
                    key={h.key}
                    type="button"
                    onClick={() => toggleHabito(h.key)}
                    className={`rounded-pill border px-3 py-1.5 text-xs font-medium transition-smooth ${
                      on
                        ? "border-brand-300 bg-brand-50 text-brand-700"
                        : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {on ? "✓ " : ""}
                    {h.label}
                  </button>
                );
              })}
            </div>
            <textarea
              value={odonNotes}
              onChange={(e) => setOdonNotes(e.target.value)}
              rows={3}
              className={FIELD_CLASS}
              placeholder="Tratamientos previos, higiene oral y otras observaciones..."
            />
          </div>
        </div>
      </Section>
    </div>
  );
}
