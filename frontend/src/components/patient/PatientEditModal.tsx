"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { SpecialtyMultiSelect } from "@/components/SpecialtyMultiSelect";
import { formatFichaCode } from "@/lib/ficha";
import { resolvePatientEspecialidades } from "@/lib/especialidades";

export interface PatientAdmin {
  id: string;
  numero_ficha: number;
  nombres: string;
  apellidos: string;
  tipo_documento?: string;
  numero_documento?: string | null;
  fecha_nacimiento?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  contacto_emergencia?: string | null;
  alergias?: string | null;
  lugar_nacimiento?: string | null;
  ocupacion?: string | null;
  estado_civil?: string | null;
  sexo?: string | null;
  nombre_responsable?: string | null;
  parentesco_responsable?: string | null;
  telefono_responsable?: string | null;
  documento_responsable?: string | null;
  especialidad?: string | null;
  especialidades?: string[] | null;
  activo?: boolean;
  created_at: string;
}

const FIELD =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600";

const DOC_TIPOS = [
  "DNI",
  "CE",
  "PASAPORTE",
  "EN_TRAMITE",
  "SIN_DOC",
  "OTRO",
] as const;

interface PatientEditModalProps {
  patient: PatientAdmin;
  onClose: () => void;
  onSaved: (patient: PatientAdmin) => void;
}

export function PatientEditModal({ patient, onClose, onSaved }: PatientEditModalProps) {
  const [form, setForm] = useState({
    nombres: patient.nombres || "",
    apellidos: patient.apellidos || "",
    tipo_documento: patient.tipo_documento || "DNI",
    numero_documento: patient.numero_documento || "",
    fecha_nacimiento: (patient.fecha_nacimiento || "").slice(0, 10),
    telefono: patient.telefono || "",
    email: patient.email || "",
    direccion: patient.direccion || "",
    contacto_emergencia: patient.contacto_emergencia || "",
    alergias: patient.alergias || "",
    lugar_nacimiento: patient.lugar_nacimiento || "",
    ocupacion: patient.ocupacion || "",
    estado_civil: patient.estado_civil || "",
    sexo: patient.sexo || "",
    nombre_responsable: patient.nombre_responsable || "",
    parentesco_responsable: patient.parentesco_responsable || "",
    telefono_responsable: patient.telefono_responsable || "",
    documento_responsable: patient.documento_responsable || "",
    especialidades: resolvePatientEspecialidades(patient),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombres.trim() || !form.apellidos.trim()) {
      setError("Nombres y apellidos son obligatorios.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const updated = await apiFetch<PatientAdmin>(`/api/patients/${patient.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          nombres: form.nombres.trim(),
          apellidos: form.apellidos.trim(),
          tipo_documento: form.tipo_documento,
          numero_documento: form.numero_documento.trim() || null,
          fecha_nacimiento: form.fecha_nacimiento || null,
          telefono: form.telefono.trim() || null,
          email: form.email.trim() || null,
          direccion: form.direccion.trim() || null,
          contacto_emergencia: form.contacto_emergencia.trim() || null,
          alergias: form.alergias.trim() || null,
          lugar_nacimiento: form.lugar_nacimiento.trim() || null,
          ocupacion: form.ocupacion.trim() || null,
          estado_civil: form.estado_civil || null,
          sexo: form.sexo || null,
          nombre_responsable: form.nombre_responsable.trim() || null,
          parentesco_responsable: form.parentesco_responsable.trim() || null,
          telefono_responsable: form.telefono_responsable.trim() || null,
          documento_responsable: form.documento_responsable.trim() || null,
          especialidades: form.especialidades,
        }),
      });
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "No se pudieron guardar los cambios."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-patient-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="edit-patient-title" className="text-base font-semibold text-slate-900">
              Editar paciente
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {formatFichaCode(patient.numero_ficha)} · Datos de identificación
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700"
              >
                {error}
              </p>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-label text-slate-700">Nombres *</span>
                <input
                  required
                  value={form.nombres}
                  onChange={(e) => set("nombres", e.target.value)}
                  className={FIELD}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-label text-slate-700">Apellidos *</span>
                <input
                  required
                  value={form.apellidos}
                  onChange={(e) => set("apellidos", e.target.value)}
                  className={FIELD}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-label text-slate-700">Tipo documento</span>
                <select
                  value={form.tipo_documento}
                  onChange={(e) => set("tipo_documento", e.target.value)}
                  className={FIELD}
                >
                  {DOC_TIPOS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-label text-slate-700">Nº documento</span>
                <input
                  value={form.numero_documento}
                  onChange={(e) => set("numero_documento", e.target.value)}
                  className={FIELD}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-label text-slate-700">Fecha de nacimiento</span>
                <input
                  type="date"
                  value={form.fecha_nacimiento}
                  onChange={(e) => set("fecha_nacimiento", e.target.value)}
                  className={FIELD}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-label text-slate-700">Sexo</span>
                <select
                  value={form.sexo}
                  onChange={(e) => set("sexo", e.target.value)}
                  className={FIELD}
                >
                  <option value="">—</option>
                  <option value="F">Femenino</option>
                  <option value="M">Masculino</option>
                  <option value="X">Otro / no especifica</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-label text-slate-700">Teléfono paciente</span>
                <input
                  value={form.telefono}
                  onChange={(e) => set("telefono", e.target.value)}
                  className={FIELD}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-label text-slate-700">Email</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  className={FIELD}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-label text-slate-700">Dirección</span>
                <input
                  value={form.direccion}
                  onChange={(e) => set("direccion", e.target.value)}
                  className={FIELD}
                />
              </label>
              <SpecialtyMultiSelect
                label="Especialidades de atención"
                value={form.especialidades}
                onChange={(especialidades) =>
                  setForm((prev) => ({ ...prev, especialidades }))
                }
                hint="Perfil de seguimiento. Las citas y evoluciones suman la especialidad de cada fecha."
              />
              <label className="block">
                <span className="mb-1 block text-label text-slate-700">Estado civil</span>
                <select
                  value={form.estado_civil}
                  onChange={(e) => set("estado_civil", e.target.value)}
                  className={FIELD}
                >
                  <option value="">—</option>
                  <option value="soltero">Soltero/a</option>
                  <option value="casado">Casado/a</option>
                  <option value="conviviente">Conviviente</option>
                  <option value="divorciado">Divorciado/a</option>
                  <option value="viudo">Viudo/a</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-label text-slate-700">Ocupación</span>
                <input
                  value={form.ocupacion}
                  onChange={(e) => set("ocupacion", e.target.value)}
                  className={FIELD}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-label text-slate-700">Lugar de nacimiento</span>
                <input
                  value={form.lugar_nacimiento}
                  onChange={(e) => set("lugar_nacimiento", e.target.value)}
                  className={FIELD}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-label text-slate-700">Contacto de emergencia</span>
                <input
                  value={form.contacto_emergencia}
                  onChange={(e) => set("contacto_emergencia", e.target.value)}
                  className={FIELD}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-label text-slate-700">Apoderado / responsable</span>
                <input
                  value={form.nombre_responsable}
                  onChange={(e) => set("nombre_responsable", e.target.value)}
                  className={FIELD}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-label text-slate-700">Parentesco</span>
                <input
                  value={form.parentesco_responsable}
                  onChange={(e) => set("parentesco_responsable", e.target.value)}
                  className={FIELD}
                  placeholder="Madre, Padre, Tutor…"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-label text-slate-700">Celular del apoderado</span>
                <input
                  value={form.telefono_responsable}
                  onChange={(e) => set("telefono_responsable", e.target.value)}
                  className={FIELD}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-label text-slate-700">Doc. del apoderado</span>
                <input
                  value={form.documento_responsable}
                  onChange={(e) => set("documento_responsable", e.target.value)}
                  className={FIELD}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-label text-slate-700">Alergias</span>
                <textarea
                  value={form.alergias}
                  onChange={(e) => set("alergias", e.target.value)}
                  rows={2}
                  className={FIELD}
                />
              </label>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" loading={saving}>
              Guardar cambios
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
