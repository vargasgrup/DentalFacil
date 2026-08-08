"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  normalizePlans,
  setActiveItems,
  activeItems,
  blankPlanItem,
  normalizeEstado,
  planMoneyTotals,
  type PlanItem,
  type TreatmentPlans,
} from "@/lib/treatmentPlans";
import { CONSENT_TEXT } from "../constants";
import { buildOdontoText, calcEdad, parseHabitos } from "../utils";
import type {
  ClinicalRecord,
  EvolutionEntry,
  FinancialSummary,
  FichaTab,
  Patient,
  PaymentTx,
  SaveState,
} from "../types";

export function useFichaClinica(patientId: string) {

  const { user } = useAuth();

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
    pieza_fdi: "",
    cantidad: "1",
    costo_unitario: "",
    a_cuenta: "",
    estado: "pendiente",
  });
  const [showEvoForm, setShowEvoForm] = useState(false);

  const [allergyInput, setAllergyInput] = useState("");
  const [fichaTab, setFichaTab] = useState<FichaTab>("historia");
  const [hasOdontogramSnapshot, setHasOdontogramSnapshot] = useState<boolean | null>(null);

  const refreshMigratedSnapshotFlag = useCallback(async (migrated: boolean) => {
    if (!migrated) {
      setHasOdontogramSnapshot(null);
      return;
    }
    try {
      const snaps = await apiFetch<{ id: string }[]>(
        `/api/odontogram/${patientId}/snapshots`
      );
      setHasOdontogramSnapshot(snaps.length > 0);
    } catch {
      setHasOdontogramSnapshot(false);
    }
  }, [patientId]);

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
      if (p.es_migrado) {
        await refreshMigratedSnapshotFlag(true);
      } else {
        setHasOdontogramSnapshot(null);
      }
      setPatientForm({
        ...p,
        fecha_nacimiento: p.fecha_nacimiento
          ? p.fecha_nacimiento.slice(0, 10)
          : "",
        especialidades: Array.isArray(p.especialidades)
          ? p.especialidades
          : p.especialidad
            ? [p.especialidad]
            : [],
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
  }, [patientId, loadPayments, refreshMigratedSnapshotFlag]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (fichaTab === "evaluacion" && patient?.es_migrado) {
      void refreshMigratedSnapshotFlag(true);
    }
  }, [fichaTab, patient?.es_migrado, refreshMigratedSnapshotFlag]);

  const refreshFinancial = async () => {
    try {
      const f = await apiFetch<FinancialSummary>(`/api/clinical/${patientId}/financial`);
      setFinancial(f);
      await loadPayments();
    } catch {
      /* ignore */
    }
  };

  const refreshClinicalMoney = async () => {
    const [evo, fin, pays] = await Promise.all([
      apiFetch<EvolutionEntry[]>(`/api/clinical/${patientId}/evolution`),
      apiFetch<FinancialSummary>(`/api/clinical/${patientId}/financial`),
      apiFetch<PaymentTx[]>(`/api/cash/transactions/patient/${patientId}`).catch(
        () => [] as PaymentTx[]
      ),
    ]);
    setEvolution(evo);
    setFinancial(fin);
    setPayments(pays);
    try {
      const r = await apiFetch<ClinicalRecord>(
        `/api/clinical/${patientId}/record`
      );
      setRecord(r);
      setPlanBundle(normalizePlans(r.plan_tratamiento));
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const onMoney = (e: Event) => {
      const detail = (e as CustomEvent<{ patientId?: string }>).detail;
      if (detail?.patientId && detail.patientId !== patientId) return;
      void refreshClinicalMoney();
    };
    window.addEventListener("dentalfacil:clinical-money-updated", onMoney);
    return () =>
      window.removeEventListener("dentalfacil:clinical-money-updated", onMoney);
  }, [patientId]);

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
      const especialidades = Array.isArray(patientForm.especialidades)
        ? patientForm.especialidades
        : patientForm.especialidad
          ? [patientForm.especialidad]
          : [];
      // Never send "" for optional dates/fields (422 from Pydantic)
      const emptyToNull = (v: unknown) =>
        v === undefined || v === null || (typeof v === "string" && !v.trim())
          ? null
          : v;
      const updated = await apiFetch<Patient>(`/api/patients/${patientId}`, {
        method: "PATCH",
        body: JSON.stringify({
          nombres: patientForm.nombres,
          apellidos: patientForm.apellidos,
          tipo_documento: patientForm.tipo_documento,
          numero_documento: emptyToNull(patientForm.numero_documento),
          fecha_nacimiento: emptyToNull(patientForm.fecha_nacimiento),
          telefono: emptyToNull(tel || patientForm.telefono),
          email: emptyToNull(patientForm.email),
          direccion: emptyToNull(patientForm.direccion),
          contacto_emergencia: emptyToNull(patientForm.contacto_emergencia),
          alergias: emptyToNull(patientForm.alergias),
          lugar_nacimiento: emptyToNull(patientForm.lugar_nacimiento),
          ocupacion: emptyToNull(patientForm.ocupacion),
          estado_civil: emptyToNull(patientForm.estado_civil),
          sexo: emptyToNull(patientForm.sexo),
          nombre_responsable: emptyToNull(patientForm.nombre_responsable),
          parentesco_responsable: emptyToNull(patientForm.parentesco_responsable),
          telefono_responsable: emptyToNull(patientForm.telefono_responsable),
          documento_responsable: emptyToNull(patientForm.documento_responsable),
          especialidades,
          especialidad: especialidades[0] || null,
          es_migrado: patientForm.es_migrado,
          fecha_ingreso_clinica: emptyToNull(patientForm.fecha_ingreso_clinica),
          resumen_historia_previa: emptyToNull(patientForm.resumen_historia_previa),
        }),
      });
      setPatient(updated);
      setPatientForm({
        ...updated,
        fecha_nacimiento: updated.fecha_nacimiento
          ? updated.fecha_nacimiento.slice(0, 10)
          : "",
        especialidades: Array.isArray(updated.especialidades)
          ? updated.especialidades
          : updated.especialidad
            ? [updated.especialidad]
            : [],
      });
      setPatientSaved("saved");
      setTimeout(() => setPatientSaved("idle"), 2000);
    } catch (err: any) {
      setError(err.message);
      setPatientSaved("idle");
    }
  };

  const saveRecord = async () => {
    if (patient?.activo === false) {
      setError("Paciente inactivo. Reactívalo antes de editar la ficha clínica.");
      return;
    }
    setRecordSaved("saving");
    setError("");
    const odontoText = buildOdontoText(habitos, odonNotes);
    try {
      // Persist ids/economics before PATCH so sync backend ↔ UI is stable
      const plansToSave = normalizePlans(planBundle);
      setPlanBundle(plansToSave);
      const updated = await apiFetch<ClinicalRecord>(
        `/api/clinical/${patientId}/record`,
        {
          method: "PATCH",
          body: JSON.stringify({
            ...recordForm,
            antecedentes_odontologicos: odontoText,
            plan_tratamiento: plansToSave,
            doctor_responsable_id:
              record?.doctor_responsable_id || user?.id || null,
          }),
        }
      );
      setRecord(updated);
      setPlanBundle(normalizePlans(updated.plan_tratamiento));
      setRecordForm({
        ...recordForm,
        antecedentes_odontologicos: odontoText,
      });
      // Refresh evolución + resumen financiero (plan save auto-syncs)
      const [evo, fin] = await Promise.all([
        apiFetch<EvolutionEntry[]>(`/api/clinical/${patientId}/evolution`),
        apiFetch<FinancialSummary>(`/api/clinical/${patientId}/financial`),
      ]);
      setEvolution(evo);
      setFinancial(fin);
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
    if (patient?.activo === false) {
      setError("Paciente inactivo. Reactívalo antes de registrar evolución.");
      return;
    }
    try {
      const cantidad = Math.max(1, parseFloat(newEvo.cantidad) || 1);
      const costo_unitario = parseFloat(newEvo.costo_unitario) || 0;
      await apiFetch(`/api/clinical/${patientId}/evolution`, {
        method: "POST",
        body: JSON.stringify({
          tratamiento_descripcion: newEvo.tratamiento_descripcion,
          especialidad: newEvo.especialidad || null,
          pieza_fdi: newEvo.pieza_fdi || null,
          cantidad,
          costo_unitario,
          a_cuenta: parseFloat(newEvo.a_cuenta) || 0,
          estado: normalizeEstado(newEvo.estado),
          doctor_id: user?.id || null,
        }),
      });
      setNewEvo({
        tratamiento_descripcion: "",
        especialidad: "",
        pieza_fdi: "",
        cantidad: "1",
        costo_unitario: "",
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

  const deleteEvolution = async (entryId: string) => {
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

  const updateEvolutionEstado = async (entryId: string, estado: string) => {
    try {
      await apiFetch(`/api/clinical/evolution/${entryId}`, {
        method: "PATCH",
        body: JSON.stringify({ estado: normalizeEstado(estado) }),
      });
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const updateEvolutionField = async (
    entryId: string,
    patch: Record<string, string | number | null>
  ) => {
    try {
      await apiFetch(`/api/clinical/evolution/${entryId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const registerPlanItemInEvolution = async (idx: number) => {
    const it = planItems[idx];
    if (!it?.item?.trim()) {
      setError("Completa el tratamiento del ítem antes de registrarlo en evolución.");
      return;
    }
    if (it.evolution_entry_id) {
      setError("Este ítem ya está vinculado a una entrada de evolución.");
      return;
    }
    setError("");
    try {
      await saveRecord();
      const cantidad = Math.max(1, Number(it.cantidad) || 1);
      const costo_unitario = Number(it.costo_unitario) || 0;
      const created = await apiFetch<EvolutionEntry>(
        `/api/clinical/${patientId}/evolution`,
        {
          method: "POST",
          body: JSON.stringify({
            tratamiento_descripcion: it.pieza_fdi
              ? `${it.item} (pieza ${it.pieza_fdi})`
              : it.item,
            pieza_fdi: it.pieza_fdi || null,
            cantidad,
            costo_unitario,
            a_cuenta: Number(it.a_cuenta) || 0,
            estado: normalizeEstado(it.estado),
            plan_item_id: it.id || null,
            doctor_id: user?.id || null,
          }),
        }
      );
      const nextItems = planItems.map((row, i) =>
        i === idx
          ? {
              ...row,
              evolution_entry_id: created.id,
              estado: normalizeEstado(created.estado),
              a_cuenta: Number(created.a_cuenta) || 0,
            }
          : row
      );
      const nextBundle = setActiveItems(planBundle, nextItems);
      setPlanBundle(nextBundle);
      await apiFetch(`/api/clinical/${patientId}/record`, {
        method: "PATCH",
        body: JSON.stringify({ plan_tratamiento: nextBundle }),
      });
      await loadData();
    } catch (err: any) {
      setError(err.message || "No se pudo registrar en evolución");
    }
  };

  const addItemRow = () => setPlanItems([...planItems, blankPlanItem()]);

  const addPlanFromOdontogram = async (item: PlanItem) => {
    const nextItems = [
      ...planItems,
      {
        ...blankPlanItem(),
        ...item,
        a_cuenta: Number(item.a_cuenta) || 0,
        origen: item.origen || "odontogram",
        estado: normalizeEstado(item.estado),
      },
    ];
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
  const planTotals = useMemo(() => planMoneyTotals(planItems), [planItems]);
  const evoTotals = useMemo(() => {
    const subtotal = evolution.reduce((s, e) => s + (Number(e.costo) || 0), 0);
    const a_cuenta = evolution.reduce((s, e) => s + (Number(e.a_cuenta) || 0), 0);
    return { subtotal, a_cuenta, saldo: Math.max(0, subtotal - a_cuenta) };
  }, [evolution]);

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

  const consentText =
    patient && record
      ? CONSENT_TEXT(
          `${patient.nombres} ${patient.apellidos}`,
          patient.numero_documento || "N/A",
          doctorDisplay
        )
      : "";

  return {
    patient, record, evolution, financial, payments, loading, error,
    patientForm, setPatientForm, recordForm, setRecordForm,
    patientSaved, recordSaved, planBundle, setPlanBundle, planItems, setPlanItems,
    habitos, odonNotes, setOdonNotes, newEvo, setNewEvo, showEvoForm, setShowEvoForm,
    allergyInput, setAllergyInput, fichaTab, setFichaTab, hasOdontogramSnapshot,
    savePatient, saveRecord, toggleConsentimiento, allergyTags, addAllergyTag, removeAllergyTag,
    addEvolution, deleteEvolution, updateEvolutionEstado, updateEvolutionField,
    registerPlanItemInEvolution, addItemRow, addPlanFromOdontogram, removeItemRow, updateItem,
    toggleHabito, edad, planTotals, evoTotals, doctorDisplay, estadoColors, consentText,
    applyPatientUpdate: (updated: Patient) => {
      setPatient(updated);
      setPatientForm({
        ...updated,
        fecha_nacimiento: updated.fecha_nacimiento
          ? updated.fecha_nacimiento.slice(0, 10)
          : "",
      });
    },
  };
}
