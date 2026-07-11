"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { Calendar, Plus, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/datetime";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/Input";
import { Odontograma } from "@/components/Odontograma";
import { Periodontograma } from "@/components/periodontogram/Periodontograma";
import { VoiceDictation } from "@/components/VoiceDictation";
import {
  normalizePlans,
  setActiveItems,
  activeItems,
  newPlanAlt,
  planEstimate,
  type PlanItem,
  type TreatmentPlans,
} from "@/lib/treatmentPlans";
import { DocumentActions } from "@/components/DocumentActions";
import { SpecialtySelect } from "@/components/SpecialtySelect";
import { TreatmentAutocomplete } from "@/components/TreatmentAutocomplete";
import { PageContainer } from "@/components/ui/PageContainer";
import { formatFichaCode } from "@/lib/ficha";
import { especialidadShort } from "@/lib/especialidades";

/* ─── types ─────────────────────────────────────────────── */

interface Patient {
  id: number;
  numero_ficha: number;
  nombres: string;
  apellidos: string;
  tipo_documento: string;
  numero_documento?: string;
  fecha_nacimiento?: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  contacto_emergencia?: string;
  alergias?: string;
  lugar_nacimiento?: string;
  ocupacion?: string;
  estado_civil?: string;
  nombre_responsable?: string;
  created_at: string;
}

interface ClinicalRecord {
  id: number;
  patient_id: number;
  motivo_consulta?: string;
  antecedentes_medicos?: string;
  antecedentes_odontologicos?: string;
  diagnostico?: string;
  plan_tratamiento?: string | PlanItem[];
  observaciones?: string;
  doctor_responsable_id?: number;
  consentimiento_firmado: boolean;
  consentimiento_fecha?: string;
  firma_odontologo?: string;
  firma_paciente?: string;
  updated_at?: string;
}

interface EvolutionEntry {
  id: number;
  patient_id: number;
  doctor_id?: number;
  especialidad?: string;
  tratamiento_descripcion: string;
  costo: number;
  a_cuenta: number;
  estado: string;
  proxima_cita_fecha?: string;
  fecha: string;
  created_at: string;
}

interface FinancialSummary {
  costo_total: number;
  pagado_total: number;
  saldo: number;
}

interface PaymentTx {
  id: number;
  concepto: string;
  monto: number;
  metodo_pago: string;
  created_at: string;
}

type SaveState = "idle" | "saving" | "saved";

const HABITOS = [
  { key: "cepillado", label: "Cepillado regular" },
  { key: "hilo", label: "Uso de hilo dental" },
  { key: "bruxismo", label: "Bruxismo" },
  { key: "fumar", label: "Fuma" },
  { key: "ortodoncia", label: "Ortodoncia previa" },
] as const;

const CONSENT_TEXT = (patientName: string, documentNum: string, doctorName: string) =>
  `Yo, ${patientName}, identificado(a) con DNI ${documentNum}, declaro que he sido informado(a) sobre mi diagnóstico odontológico y el plan de tratamiento propuesto por el/la Dr.(a) ${doctorName}. He comprendido los beneficios, riesgos y alternativas del tratamiento, así como las consecuencias de no recibirlo. Autorizo al profesional mencionado a realizar los procedimientos necesarios para mi atención odontológica.`;

function calcEdad(fecha?: string | null): number | null {
  if (!fecha) return null;
  const born = new Date(fecha);
  if (isNaN(born.getTime())) return null;
  return Math.floor((Date.now() - born.getTime()) / (365.25 * 24 * 3600 * 1000));
}

function parseHabitos(text: string): { selected: string[]; notes: string } {
  const match = text.match(/^\[Hábitos:\s*([^\]]*)\]\s*\n?/i);
  if (!match) return { selected: [], notes: text };
  const selected = match[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const notes = text.slice(match[0].length);
  return { selected, notes };
}

function buildOdontoText(selected: string[], notes: string): string {
  if (selected.length === 0) return notes;
  return `[Hábitos: ${selected.join(", ")}]\n${notes}`.trim();
}

export default function FichaClinicaPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const patientId = Number(params.id);

  const [patient, setPatient] = useState<Patient | null>(null);
  const [record, setRecord] = useState<ClinicalRecord | null>(null);
  const [evolution, setEvolution] = useState<EvolutionEntry[]>([]);
  const [financial, setFinancial] = useState<FinancialSummary | null>(null);
  const [payments, setPayments] = useState<PaymentTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [patientForm, setPatientForm] = useState<Partial<Patient>>({});
  const [recordForm, setRecordForm] = useState<Partial<ClinicalRecord>>({});
  const [patientSaved, setPatientSaved] = useState<SaveState>("idle");
  const [recordSaved, setRecordSaved] = useState<SaveState>("idle");

  const [planBundle, setPlanBundle] = useState<TreatmentPlans>(normalizePlans(null));
  const planItems = activeItems(planBundle);
  const setPlanItems = (items: PlanItem[] | ((prev: PlanItem[]) => PlanItem[])) => {
    setPlanBundle((prev) => {
      const current = activeItems(prev);
      const next = typeof items === "function" ? items(current) : items;
      return setActiveItems(prev, next);
    });
  };
  const [habitos, setHabitos] = useState<string[]>([]);
  const [odonNotes, setOdonNotes] = useState("");

  const [newEvo, setNewEvo] = useState({
    tratamiento_descripcion: "",
    especialidad: "",
    costo: "",
    a_cuenta: "",
    estado: "pendiente",
  });
  const [showEvoForm, setShowEvoForm] = useState(false);

  const [showPayment, setShowPayment] = useState(false);
  const [payMonto, setPayMonto] = useState("");
  const [payConcepto, setPayConcepto] = useState("");
  const [payMetodo, setPayMetodo] = useState("efectivo");
  const [allergyInput, setAllergyInput] = useState("");

  const loadPayments = useCallback(async () => {
    try {
      const txs = await apiFetch<PaymentTx[]>(
        `/api/cash/transactions/patient/${patientId}`
      );
      setPayments(txs);
    } catch {
      setPayments([]);
    }
  }, [patientId]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [p, r, e, f] = await Promise.all([
        apiFetch<Patient>(`/api/patients/${patientId}`),
        apiFetch<ClinicalRecord>(`/api/clinical/${patientId}/record`),
        apiFetch<EvolutionEntry[]>(`/api/clinical/${patientId}/evolution`),
        apiFetch<FinancialSummary>(`/api/clinical/${patientId}/financial`),
      ]);
      setPatient(p);
      setRecord(r);
      setEvolution(e);
      setFinancial(f);
      setPatientForm({
        ...p,
        fecha_nacimiento: p.fecha_nacimiento
          ? p.fecha_nacimiento.slice(0, 10)
          : "",
      });

      let items: PlanItem[] = [];
      const plans = normalizePlans(r.plan_tratamiento);
      setPlanBundle(plans);
      items = activeItems(plans);
      // keep items local sync via planBundle
      void items;

      const odonto = parseHabitos(r.antecedentes_odontologicos || "");
      setHabitos(odonto.selected);
      setOdonNotes(odonto.notes);

      setRecordForm({
        motivo_consulta: r.motivo_consulta || "",
        antecedentes_medicos: r.antecedentes_medicos || "",
        antecedentes_odontologicos: r.antecedentes_odontologicos || "",
        diagnostico: r.diagnostico || "",
        observaciones: r.observaciones || "",
      });

      await loadPayments();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [patientId, loadPayments]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const refreshFinancial = async () => {
    try {
      const f = await apiFetch<FinancialSummary>(
        `/api/clinical/${patientId}/financial`
      );
      setFinancial(f);
      await loadPayments();
    } catch { /* ignore */ }
  };

  const savePatient = async () => {
    setPatientSaved("saving");
    setError("");
    const tel = (patientForm.telefono || "").replace(/\s+/g, "");
    if (tel && !/^\+?\d{7,15}$/.test(tel)) {
      setError("Teléfono inválido. Use solo dígitos (7–15), opcionalmente con +.");
      setPatientSaved("idle");
      return;
    }
    try {
      const updated = await apiFetch<Patient>(`/api/patients/${patientId}`, {
        method: "PATCH",
        body: JSON.stringify({ ...patientForm, telefono: tel || patientForm.telefono }),
      });
      setPatient(updated);
      setPatientForm({
        ...updated,
        fecha_nacimiento: updated.fecha_nacimiento
          ? updated.fecha_nacimiento.slice(0, 10)
          : "",
      });
      setPatientSaved("saved");
      setTimeout(() => setPatientSaved("idle"), 2000);
    } catch (err: any) {
      setError(err.message);
      setPatientSaved("idle");
    }
  };

  const saveRecord = async () => {
    setRecordSaved("saving");
    setError("");
    const odontoText = buildOdontoText(habitos, odonNotes);
    try {
      const updated = await apiFetch<ClinicalRecord>(
        `/api/clinical/${patientId}/record`,
        {
          method: "PATCH",
          body: JSON.stringify({
            ...recordForm,
            antecedentes_odontologicos: odontoText,
            plan_tratamiento: planBundle,
            doctor_responsable_id:
              record?.doctor_responsable_id || user?.id || null,
          }),
        }
      );
      setRecord(updated);
      setRecordForm({
        ...recordForm,
        antecedentes_odontologicos: odontoText,
      });
      setRecordSaved("saved");
      setTimeout(() => setRecordSaved("idle"), 2000);
    } catch (err: any) {
      setError(err.message);
      setRecordSaved("idle");
    }
  };

  const toggleConsentimiento = async () => {
    if (!record) return;
    const nextFirmado = !record.consentimiento_firmado;
    try {
      if (!record.doctor_responsable_id && user?.id) {
        await apiFetch(`/api/clinical/${patientId}/record`, {
          method: "PATCH",
          body: JSON.stringify({ doctor_responsable_id: user.id }),
        });
      }
      const updated = await apiFetch<ClinicalRecord>(
        `/api/clinical/${patientId}/consentimiento`,
        {
          method: "PATCH",
          body: JSON.stringify({ firmado: nextFirmado }),
        }
      );
      setRecord(updated);
      setError("");
    } catch (err: any) {
      setError(err.message);
    }
  };

  const allergyTags = (patientForm.alergias || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const addAllergyTag = () => {
    const tag = allergyInput.trim().replace(/,/g, "");
    if (!tag) return;
    const next = [...allergyTags, tag];
    setPatientForm({ ...patientForm, alergias: next.join(", ") });
    setAllergyInput("");
  };

  const removeAllergyTag = (idx: number) => {
    const next = allergyTags.filter((_, i) => i !== idx);
    setPatientForm({ ...patientForm, alergias: next.join(", ") });
  };

  const addEvolution = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch(`/api/clinical/${patientId}/evolution`, {
        method: "POST",
        body: JSON.stringify({
          tratamiento_descripcion: newEvo.tratamiento_descripcion,
          especialidad: newEvo.especialidad || null,
          costo: parseFloat(newEvo.costo) || 0,
          a_cuenta: parseFloat(newEvo.a_cuenta) || 0,
          estado: newEvo.estado,
          doctor_id: user?.id || null,
        }),
      });
      setNewEvo({
        tratamiento_descripcion: "",
        especialidad: "",
        costo: "",
        a_cuenta: "",
        estado: "pendiente",
      });
      setShowEvoForm(false);
      await loadData();
      if (
        window.confirm(
          "¿Guardar también el estado actual del odontograma como referencia de esta cita?"
        )
      ) {
        try {
          await apiFetch(`/api/odontogram/${patientId}/snapshots`, {
            method: "POST",
            body: JSON.stringify({
              denticion: "permanente",
              label: `Evolución ${new Date().toLocaleString("es-VE")}`,
            }),
          });
        } catch {
          /* ignore */
        }
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const registerPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await apiFetch("/api/cash/transactions", {
        method: "POST",
        body: JSON.stringify({
          patient_id: patientId,
          tipo: "ingreso",
          concepto: payConcepto || "Pago de tratamiento",
          monto: parseFloat(payMonto),
          metodo_pago: payMetodo,
        }),
      });
      setShowPayment(false);
      setPayMonto("");
      setPayConcepto("");
      await refreshFinancial();
    } catch (err: any) {
      setError(
        err.message?.includes("caja")
          ? `${err.message} Ve a Caja para abrir una sesión.`
          : err.message
      );
    }
  };

  const deleteEvolution = async (entryId: number) => {
    if (!confirm("¿Eliminar esta entrada de evolución?")) return;
    try {
      await apiFetch(`/api/clinical/${patientId}/evolution/${entryId}`, {
        method: "DELETE",
      });
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const updateEvolutionEstado = async (entryId: number, estado: string) => {
    try {
      await apiFetch(`/api/clinical/evolution/${entryId}`, {
        method: "PATCH",
        body: JSON.stringify({ estado }),
      });
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const addItemRow = () =>
    setPlanItems([
      ...planItems,
      { item: "", cantidad: 1, costo_unitario: 0, estado: "pendiente", origen: "manual" },
    ]);

  const addPlanFromOdontogram = async (item: PlanItem) => {
    const nextItems = [...planItems, { ...item, origen: item.origen || "odontogram" }];
    const nextBundle = setActiveItems(planBundle, nextItems);
    setPlanBundle(nextBundle);
    try {
      const odontoText = buildOdontoText(habitos, odonNotes);
      await apiFetch(`/api/clinical/${patientId}/record`, {
        method: "PATCH",
        body: JSON.stringify({
          ...recordForm,
          antecedentes_odontologicos: odontoText,
          plan_tratamiento: nextBundle,
          doctor_responsable_id: record?.doctor_responsable_id || user?.id || null,
        }),
      });
      setRecordSaved("saved");
      setTimeout(() => setRecordSaved("idle"), 2000);
    } catch (err: any) {
      setError(err.message || "No se pudo agregar al plan");
    }
  };

  const removeItemRow = (idx: number) =>
    setPlanItems(planItems.filter((_, i) => i !== idx));

  const updateItem = (
    idx: number,
    key: keyof PlanItem,
    val: string | number
  ) => {
    setPlanItems(
      planItems.map((it, i) => (i === idx ? { ...it, [key]: val } : it))
    );
  };

  const toggleHabito = (key: string) => {
    setHabitos((prev) =>
      prev.includes(key) ? prev.filter((h) => h !== key) : [...prev, key]
    );
  };

  const edad = calcEdad(patientForm.fecha_nacimiento);
  const planEstimado = useMemo(() => planEstimate(planItems), [planItems]);

  const doctorDisplay =
    user?.nombre ||
    (record?.doctor_responsable_id
      ? `Usuario #${record.doctor_responsable_id}`
      : "el/la odontólogo(a) tratante");

  const estadoColors: Record<string, string> = {
    pendiente: "bg-warning-50 text-warning-700",
    en_proceso: "bg-brand-50 text-brand-700",
    en_curso: "bg-brand-50 text-brand-700",
    completado: "bg-success-50 text-success-700",
    finalizado: "bg-success-50 text-success-700",
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-10 w-64 rounded-lg" />
        <div className="skeleton h-48 rounded-card" />
        <div className="skeleton h-48 rounded-card" />
      </div>
    );
  }
  if (error && !patient) {
    return <p className="text-danger-600">{error}</p>;
  }
  if (!patient || !record) {
    return <p className="text-slate-400">No se encontró el paciente</p>;
  }

  const consentText = CONSENT_TEXT(
    `${patient.nombres} ${patient.apellidos}`,
    patient.numero_documento || "N/A",
    doctorDisplay
  );

  const fieldClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm tracking-normal leading-relaxed focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

  return (
    <PageContainer width="wide" className="space-y-5">
      <div>
        <p className="text-sm text-slate-400">
          <button
            type="button"
            onClick={() => router.push("/pacientes")}
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
      </div>

      {error && (
        <div className="rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-600">
          {error}
        </div>
      )}

      {/* 1. DATOS DE IDENTIFICACIÓN */}
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
            onClick={() => router.push(`/agenda?patient_id=${patientId}`)}
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
              className={fieldClass}
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
              className={fieldClass}
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
              className={fieldClass}
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

      {/* 2. ANTECEDENTES */}
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
              className={fieldClass}
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
              className={fieldClass}
              placeholder="Tratamientos previos, higiene oral y otras observaciones..."
            />
          </div>
        </div>
      </Section>

      {/* 3. ODONTOGRAMA */}
      <Section title="Odontograma" noSave>
        <Odontograma patientId={patientId} onProposeTreatment={addPlanFromOdontogram} />
      </Section>

      <Section title="Periodontograma" noSave>
        <Periodontograma patientId={patientId} />
      </Section>

      {/* 4. DIAGNÓSTICO */}
      <Section title="Diagnóstico" onSave={saveRecord} saveState={recordSaved}>
        <textarea
          value={recordForm.diagnostico || ""}
          onChange={(e) =>
            setRecordForm({ ...recordForm, diagnostico: e.target.value })
          }
          rows={4}
          className={fieldClass}
          placeholder="Escribe el diagnóstico clínico..."
        />
      </Section>

      {/* 5. PLAN DE TRATAMIENTO */}
      <Section title="Plan de tratamiento" onSave={saveRecord} saveState={recordSaved}>
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="w-16 py-2 pr-2 font-medium">Pieza</th>
                <th className="py-2 pr-3 font-medium">Tratamiento / Ítem</th>
                <th className="w-20 py-2 pr-3 font-medium">Cant.</th>
                <th className="w-28 py-2 pr-3 font-medium">Costo unit.</th>
                <th className="w-28 py-2 pr-3 font-medium text-right">Subtotal</th>
                <th className="w-32 py-2 pr-3 font-medium">Estado</th>
                <th className="w-10 py-2" />
              </tr>
            </thead>
            <tbody>
              {planItems.map((it, idx) => {
                const sub = (it.cantidad || 0) * (Number(it.costo_unitario) || 0);
                return (
                  <tr key={idx} className="border-b border-slate-100">
                    <td className="py-2 pr-2">
                      <input
                        value={it.pieza_fdi || ""}
                        onChange={(e) => updateItem(idx, "pieza_fdi", e.target.value)}
                        placeholder="—"
                        className="w-14 rounded-lg border border-slate-200 px-1.5 py-1.5 text-center text-sm tabular-nums focus:border-brand-500 focus:outline-none"
                      />
                      {it.origen === "odontogram" && (
                        <span className="mt-0.5 block text-[9px] text-emerald-700">Odonto</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
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
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        min={1}
                        value={it.cantidad}
                        onChange={(e) =>
                          updateItem(idx, "cantidad", parseInt(e.target.value) || 1)
                        }
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
                      />
                    </td>
                    <td className="py-2 pr-3">
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
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
                      />
                    </td>
                    <td className="py-2 pr-3 text-right font-medium text-slate-700">
                      S/ {sub.toFixed(2)}
                    </td>
                    <td className="py-2 pr-3">
                      <select
                        value={it.estado || "pendiente"}
                        onChange={(e) => updateItem(idx, "estado", e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
                      >
                        <option value="pendiente">Pendiente</option>
                        <option value="en_curso">En curso</option>
                        <option value="finalizado">Finalizado</option>
                      </select>
                    </td>
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => removeItemRow(idx)}
                        className="rounded p-1 text-slate-400 hover:bg-danger-50 hover:text-danger-600"
                        title="Eliminar fila"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <Button variant="secondary" onClick={addItemRow} icon={<Plus className="h-4 w-4" />}>
            Agregar fila
          </Button>
          <p className="text-sm text-slate-500">
            Estimado del plan:{" "}
            <span className="font-semibold text-slate-800">
              S/ {planEstimado.toFixed(2)}
            </span>
          </p>
        </div>
        <p className="mt-2 text-help text-slate-400">
          El costo oficial de la ficha se calcula desde la evolución clínica. El estimado del plan es referencial.
        </p>
      </Section>

      {/* 6. OBSERVACIONES */}
      <Section title="Observaciones" onSave={saveRecord} saveState={recordSaved}>
        <textarea
          value={recordForm.observaciones || ""}
          onChange={(e) =>
            setRecordForm({ ...recordForm, observaciones: e.target.value })
          }
          rows={3}
          className={fieldClass}
          placeholder="Notas adicionales..."
        />
        {record.updated_at && (
          <p className="mt-2 text-help text-slate-400">
            Última actualización:{" "}
            {formatDateTime(record.updated_at)}
          </p>
        )}
      </Section>

      {/* 7. CONSENTIMIENTO */}
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
            downloadUrl={`/api/documents/consentimiento/${patientId}`}
            telefono={patient.telefono}
            mensaje={`Hola ${patient.nombres}, adjuntamos el consentimiento informado para tu tratamiento. Gracias.`}
            markSentUrl={`/api/documents/whatsapp-sent/${record.id}`}
          />
        </div>
      </Section>

      {/* 9. EVOLUCIÓN */}
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
                  costo:
                    newEvo.costo ||
                    (t.precio_referencial ? String(t.precio_referencial) : newEvo.costo),
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <SpecialtySelect
                value={newEvo.especialidad}
                onChange={(especialidad) => setNewEvo({ ...newEvo, especialidad })}
              />
              <Input
                label="Costo (S/)"
                type="number"
                step="0.01"
                value={newEvo.costo}
                onChange={(e) => setNewEvo({ ...newEvo, costo: e.target.value })}
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
                  className={fieldClass}
                >
                  <option value="pendiente">Pendiente</option>
                  <option value="en_proceso">En proceso</option>
                  <option value="completado">Completado</option>
                </select>
              </label>
            </div>
            <p className="text-help text-slate-400">
              La fecha y hora se registran automáticamente al guardar.
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
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2 pr-4 font-medium">Fecha</th>
                  <th className="py-2 pr-4 font-medium">Tratamiento</th>
                  <th className="py-2 pr-4 font-medium">Esp.</th>
                  <th className="py-2 pr-4 font-medium text-right">Costo</th>
                  <th className="py-2 pr-4 font-medium text-right">A cuenta</th>
                  <th className="py-2 pr-4 font-medium text-right">Saldo</th>
                  <th className="py-2 pr-4 font-medium">Estado</th>
                  <th className="py-2 pr-2 font-medium">PDF</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {evolution.map((e) => {
                  const saldo = (Number(e.costo) || 0) - (Number(e.a_cuenta) || 0);
                  return (
                  <tr key={e.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 text-slate-400">
                      {formatDateTime(e.fecha)}
                    </td>
                    <td className="py-2 pr-4">{e.tratamiento_descripcion}</td>
                    <td className="py-2 pr-4 text-slate-500" title={e.especialidad || undefined}>
                      {especialidadShort(e.especialidad)}
                    </td>
                    <td className="py-2 pr-4 text-right">S/ {e.costo.toFixed(2)}</td>
                    <td className="py-2 pr-4 text-right text-success-600">
                      S/ {e.a_cuenta.toFixed(2)}
                    </td>
                    <td
                      className={`py-2 pr-4 text-right font-medium ${
                        saldo > 0 ? "text-warning-600" : "text-success-600"
                      }`}
                    >
                      S/ {saldo.toFixed(2)}
                    </td>
                    <td className="py-2 pr-4">
                      <select
                        value={e.estado}
                        onChange={(ev) =>
                          updateEvolutionEstado(e.id, ev.target.value)
                        }
                        className={`rounded-lg px-2 py-1 text-xs font-medium ${
                          estadoColors[e.estado] || ""
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
          </div>
        )}
      </Section>

      {/* 10. RESUMEN FINANCIERO */}
      <div id="resumen-financiero">
        <Section title="Resumen financiero del tratamiento" noSave>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MoneyCard label="Costo total" value={financial?.costo_total} />
            <MoneyCard label="Pagado" value={financial?.pagado_total} tone="success" />
            <MoneyCard label="Saldo" value={financial?.saldo} tone="warning" />
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              variant="secondary"
              onClick={() => setShowPayment(!showPayment)}
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
                Requiere caja abierta. El pago se sincroniza con el módulo Caja.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Input
                  label="Monto (S/)"
                  type="number"
                  step="0.01"
                  value={payMonto}
                  onChange={(e) => setPayMonto(e.target.value)}
                  required
                />
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
                    onChange={(e) => setPayMetodo(e.target.value)}
                    className={fieldClass}
                  >
                    <option value="efectivo">Efectivo</option>
                    <option value="tarjeta">Tarjeta</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="yape">Yape</option>
                    <option value="plin">Plin</option>
                  </select>
                </label>
              </div>
              <Button type="submit">Registrar</Button>
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
              downloadUrl={`/api/documents/ficha/${patientId}`}
              telefono={patient.telefono}
              mensaje={`Hola ${patient.nombres}, adjuntamos tu ficha clínica. Cualquier consulta estamos a disposición. Gracias.`}
            />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Presupuesto (plan activo)</p>
            <DocumentActions
              label="Presupuesto"
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
              downloadUrl={`/api/documents/consentimiento/${patientId}`}
              telefono={patient.telefono}
              mensaje={`Hola ${patient.nombres}, adjuntamos el consentimiento informado. Gracias.`}
              markSentUrl={`/api/documents/whatsapp-sent/${record.id}`}
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => router.push("/reportes")}>
            Ir a Reportes
          </Button>
          <Button variant="ghost" onClick={() => router.push("/caja")}>
            Ir a Caja
          </Button>
          <Button variant="ghost" onClick={() => router.push("/configuracion")}>
            Configuración
          </Button>
        </div>
      </Section>
    </PageContainer>
  );
}

function MoneyCard({
  label,
  value,
  tone,
}: {
  label: string;
  value?: number;
  tone?: "success" | "warning";
}) {
  const color =
    tone === "success"
      ? "text-success-600"
      : tone === "warning"
        ? "text-warning-600"
        : "text-slate-800";
  return (
    <div className="rounded-card border border-slate-200 bg-surface-subtle p-4">
      <p className="text-help tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-xl font-bold tracking-normal ${color}`}>
        S/ {(value ?? 0).toFixed(2)}
      </p>
    </div>
  );
}

function Section({
  title,
  children,
  onSave,
  saveState,
  action,
  noSave,
}: {
  title: string;
  children: React.ReactNode;
  onSave?: () => void;
  saveState?: SaveState;
  action?: React.ReactNode;
  noSave?: boolean;
}) {
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-section-title tracking-normal text-slate-800">{title}</h2>
        <div className="flex items-center gap-3">
          {action}
          {onSave && !noSave && (
            <Button
              onClick={onSave}
              variant={saveState === "saved" ? "secondary" : "primary"}
              disabled={saveState === "saving"}
            >
              {saveState === "saving"
                ? "Guardando..."
                : saveState === "saved"
                  ? "Guardado"
                  : "Guardar"}
            </Button>
          )}
        </div>
      </div>
      {children}
    </Card>
  );
}
