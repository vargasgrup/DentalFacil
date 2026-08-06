"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Baby,
  Check,
  ChevronDown,
  ChevronUp,
  HeartPulse,
  Shield,
  UserRound,
  Users,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { navigateToPacienteFicha } from "@/lib/pacienteRoutes";
import { PacienteFichaLink } from "@/components/PacienteFichaLink";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageContainer } from "@/components/ui/PageContainer";
import { Input } from "@/components/Input";
import {
  DNI_LENGTH,
  PHONE_LENGTH,
  digitsOnly,
  titleCaseName,
  validateDNI,
  validatePeruvianMobile,
  normalizePeruvianMobile,
} from "@/lib/validators";
import { formatFichaLabel } from "@/lib/ficha";
import { SpecialtySelect } from "@/components/SpecialtySelect";
import {
  AGE_BANDS,
  PARENTESCO_OPTIONS,
  type AgeBandId,
  type DocTipo,
  bandFromAge,
  calcAgeYears,
  docTipoLabel,
  formatAgeLabel,
  getAgeBand,
  isMinor,
  needsDocumentNumber,
} from "@/lib/patientAge";
import { inferSexoFromNombres } from "@/lib/nameGender";

interface Patient {
  id: string;
  numero_ficha: number;
  nombres?: string;
  apellidos?: string;
  numero_documento?: string;
}

const ESTADO_CIVIL = [
  "",
  "Soltero/a",
  "Casado/a",
  "Conviviente",
  "Divorciado/a",
  "Viudo/a",
] as const;

const selectClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm transition-smooth focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600";

function docMaxLen(tipo: DocTipo): number {
  if (tipo === "DNI") return DNI_LENGTH;
  if (tipo === "SIN_DOC" || tipo === "EN_TRAMITE") return 20;
  return 12;
}

function sanitizeDocumento(tipo: DocTipo, raw: string): string {
  if (tipo === "DNI") return digitsOnly(raw, DNI_LENGTH);
  if (tipo === "SIN_DOC" || tipo === "EN_TRAMITE") {
    return raw.replace(/[^a-zA-Z0-9\-]/g, "").slice(0, 20).toUpperCase();
  }
  return raw.replace(/[^a-zA-Z0-9]/g, "").slice(0, docMaxLen(tipo)).toUpperCase();
}

function bandIcon(id: AgeBandId) {
  switch (id) {
    case "bebe":
      return Baby;
    case "nino":
      return Users;
    case "adolescente":
      return UserRound;
    case "adulto":
      return UserRound;
    case "mayor":
      return HeartPulse;
    default:
      return UserRound;
  }
}

export default function NuevoPacientePage() {
  const router = useRouter();
  const nombresRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const fechaNacRef = useRef<HTMLInputElement>(null);
  const telRef = useRef<HTMLInputElement>(null);
  const tutorTelRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [showCaregiverOptional, setShowCaregiverOptional] = useState(false);
  const [docStatus, setDocStatus] = useState<"idle" | "checking" | "ok" | "dup">("idle");
  const [dupPatient, setDupPatient] = useState<Patient | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [ageBand, setAgeBand] = useState<AgeBandId>("adulto");
  const [bandTouched, setBandTouched] = useState(false);
  /** When true, user overrode sexo — stop auto-guess from name. */
  const [sexoManual, setSexoManual] = useState(false);

  const [form, setForm] = useState({
    nombres: "",
    apellidos: "",
    tipo_documento: "DNI" as DocTipo,
    numero_documento: "",
    fecha_nacimiento: "",
    sexo: "",
    lugar_nacimiento: "",
    ocupacion: "",
    estado_civil: "",
    especialidad: "",
    telefono: "",
    email: "",
    direccion: "",
    contacto_emergencia: "",
    nombre_responsable: "",
    parentesco_responsable: "",
    telefono_responsable: "",
    documento_responsable: "",
    alergias: "",
    es_migrado: false,
    fecha_ingreso_clinica: "",
    resumen_historia_previa: "",
    saldo_inicial_migracion: "0",
  });

  useEffect(() => {
    nombresRef.current?.focus();
  }, []);

  const age = useMemo(
    () => calcAgeYears(form.fecha_nacimiento || null),
    [form.fecha_nacimiento]
  );
  const minor = isMinor(age, ageBand);
  const bandMeta = getAgeBand(ageBand);

  // Keep age band in sync with birth date unless user explicitly overrode.
  useEffect(() => {
    if (!form.fecha_nacimiento) return;
    const derived = bandFromAge(age);
    if (derived && derived !== ageBand) {
      setAgeBand(derived);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to DOB/age
  }, [form.fecha_nacimiento, age]);

  const set = useCallback((field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const applyBand = (id: AgeBandId) => {
    setBandTouched(true);
    setAgeBand(id);
    const meta = getAgeBand(id);
    setForm((prev) => {
      const nextTipo = prev.numero_documento.trim()
        ? prev.tipo_documento
        : meta.docDefault;
      const nextDoc =
        nextTipo === "SIN_DOC" || nextTipo === "EN_TRAMITE"
          ? sanitizeDocumento(nextTipo, prev.numero_documento)
          : sanitizeDocumento(nextTipo, prev.numero_documento);
      return {
        ...prev,
        tipo_documento: nextTipo,
        numero_documento: nextDoc,
      };
    });
    if (meta.needsGuardian) {
      setShowCaregiverOptional(true);
    }
  };

  const checkDuplicate = useCallback(
    async (doc: string, tipo: DocTipo, signal?: AbortSignal) => {
      if (!needsDocumentNumber(tipo)) {
        setDocStatus("idle");
        setDupPatient(null);
        return;
      }
      if (tipo === "DNI" && !validateDNI(doc)) {
        setDocStatus("idle");
        setDupPatient(null);
        return;
      }
      if (tipo !== "DNI" && doc.length < 4) {
        setDocStatus("idle");
        setDupPatient(null);
        return;
      }
      setDocStatus("checking");
      try {
        const hits = await apiFetch<Patient[]>(
          `/api/patients/search?q=${encodeURIComponent(doc)}`,
          { signal }
        );
        if (signal?.aborted) return;
        const clash = hits.find(
          (p) => (p.numero_documento || "").trim().toLowerCase() === doc.toLowerCase()
        );
        if (clash) {
          setDupPatient(clash);
          setDocStatus("dup");
        } else {
          setDupPatient(null);
          setDocStatus("ok");
        }
      } catch (err) {
        if (
          signal?.aborted ||
          (err instanceof DOMException && err.name === "AbortError")
        ) {
          setDocStatus((prev) => (prev === "checking" ? "idle" : prev));
          return;
        }
        setDocStatus("idle");
        setDupPatient(null);
      }
    },
    []
  );

  useEffect(() => {
    const doc = form.numero_documento.trim();
    if (!needsDocumentNumber(form.tipo_documento)) {
      setDocStatus("idle");
      setDupPatient(null);
      return;
    }
    const ready =
      form.tipo_documento === "DNI" ? validateDNI(doc) : doc.length >= 4;

    if (!ready) {
      setDocStatus("idle");
      setDupPatient(null);
      return;
    }

    const ac = new AbortController();
    const t = window.setTimeout(() => {
      void checkDuplicate(doc, form.tipo_documento, ac.signal);
    }, 280);
    return () => {
      window.clearTimeout(t);
      ac.abort();
    };
  }, [form.numero_documento, form.tipo_documento, checkDuplicate]);

  const onDocumentoChange = (raw: string) => {
    const prevLen = form.numero_documento.length;
    const next = sanitizeDocumento(form.tipo_documento, raw);
    set("numero_documento", next);
    setError("");
    // Tras completar el DNI, avanzar al siguiente campo natural: fecha de nacimiento.
    if (
      form.tipo_documento === "DNI" &&
      next.length === DNI_LENGTH &&
      prevLen < DNI_LENGTH
    ) {
      requestAnimationFrame(() => fechaNacRef.current?.focus());
    }
  };

  const onTipoChange = (tipo: DocTipo) => {
    const cleaned = sanitizeDocumento(tipo, form.numero_documento);
    setForm((prev) => ({
      ...prev,
      tipo_documento: tipo,
      numero_documento: tipo === "SIN_DOC" ? "" : cleaned,
    }));
    setDocStatus("idle");
    setDupPatient(null);
    if (needsDocumentNumber(tipo)) {
      requestAnimationFrame(() => docRef.current?.focus());
    }
  };

  const onTelefonoChange = (raw: string) => {
    set("telefono", normalizePeruvianMobile(raw));
  };

  const onTutorTelChange = (raw: string) => {
    set("telefono_responsable", normalizePeruvianMobile(raw));
  };

  const applySexoFromName = useCallback(
    (nombres: string, force = false) => {
      if (sexoManual && !force) return;
      const guessed = inferSexoFromNombres(nombres);
      if (!guessed) return;
      setForm((prev) => {
        if (prev.sexo === guessed) return prev;
        if (sexoManual && !force) return prev;
        // Keep user's manual X / other; only fill empty or auto M/F
        if (prev.sexo === "X") return prev;
        if (prev.sexo && sexoManual) return prev;
        return { ...prev, sexo: guessed };
      });
    },
    [sexoManual]
  );

  const onNombresChange = (raw: string) => {
    set("nombres", raw);
    setError("");
    applySexoFromName(raw);
  };

  const blurName = (field: "nombres" | "apellidos" | "nombre_responsable") => {
    const v = form[field];
    if (!v.trim()) return;
    const titled = titleCaseName(v);
    set(field, titled);
    if (field === "nombres") applySexoFromName(titled);
  };

  const onSexoChange = (value: string) => {
    setSexoManual(true);
    set("sexo", value);
  };

  const documentFormatOk = (): boolean => {
    if (!needsDocumentNumber(form.tipo_documento)) return true;
    const doc = form.numero_documento.trim();
    if (!doc) return false;
    if (form.tipo_documento === "DNI") return validateDNI(doc);
    return doc.length >= 3;
  };

  const contactPhoneOk = (): boolean => {
    if (minor) {
      return (
        validatePeruvianMobile(form.telefono_responsable) ||
        validatePeruvianMobile(form.telefono)
      );
    }
    return validatePeruvianMobile(form.telefono);
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.nombres.trim()) errs.nombres = "Obligatorio";
    if (!form.apellidos.trim()) errs.apellidos = "Obligatorio";

    if (needsDocumentNumber(form.tipo_documento)) {
      const doc = form.numero_documento.trim();
      if (!doc) {
        errs.numero_documento = "Indique el número o elija “Sin documento”";
      } else if (form.tipo_documento === "DNI" && !validateDNI(doc)) {
        errs.numero_documento = `DNI: exactamente ${DNI_LENGTH} dígitos`;
      }
    }

    if (minor) {
      if (!form.fecha_nacimiento) {
        errs.fecha_nacimiento = "Recomendado y casi obligatorio en menores";
      }
      if (!form.nombre_responsable.trim()) {
        errs.nombre_responsable = "Indique el apoderado o tutor";
      }
      if (
        !validatePeruvianMobile(form.telefono_responsable) &&
        !validatePeruvianMobile(form.telefono)
      ) {
        errs.telefono_responsable = "Celular del tutor (9 dígitos, empieza en 9)";
      }
      if (
        form.telefono_responsable &&
        !validatePeruvianMobile(form.telefono_responsable)
      ) {
        errs.telefono_responsable = "Celular Perú: 9 dígitos empezando en 9";
      }
    } else {
      const tel = normalizePeruvianMobile(form.telefono.trim());
      if (!tel) {
        errs.telefono = "Obligatorio (9 dígitos)";
      } else if (!validatePeruvianMobile(tel)) {
        errs.telefono = "Celular Perú: 9 dígitos empezando en 9";
      }
    }

    if (form.fecha_nacimiento) {
      const today = new Date().toISOString().slice(0, 10);
      if (form.fecha_nacimiento > today) {
        errs.fecha_nacimiento = "No puede ser futura";
      }
    }

    if (docStatus === "dup") {
      errs.numero_documento = "Documento ya registrado";
    }

    if (form.es_migrado) {
      if (!form.fecha_ingreso_clinica) {
        errs.fecha_ingreso_clinica = "Obligatoria para alta retroactiva";
      } else if (form.fecha_ingreso_clinica > new Date().toISOString().slice(0, 10)) {
        errs.fecha_ingreso_clinica = "No puede ser futura";
      }
      if (form.resumen_historia_previa.length > 5000) {
        errs.resumen_historia_previa = "Máximo 5000 caracteres";
      }
      const saldo = Number(form.saldo_inicial_migracion);
      if (Number.isNaN(saldo)) {
        errs.saldo_inicial_migracion = "Monto inválido";
      }
    }

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError("");
    if (!validate()) return;
    if (docStatus === "dup") return;
    if (busy || submittingRef.current) return;
    submittingRef.current = true;

    const doc = needsDocumentNumber(form.tipo_documento)
      ? form.numero_documento.trim()
      : form.numero_documento.trim() || null;
    const tutorTel = normalizePeruvianMobile(form.telefono_responsable.trim());
    const patientTel = normalizePeruvianMobile(form.telefono.trim());
    // Primary clinic contact: tutor phone for minors when patient has none
    const primaryTel =
      patientTel ||
      (minor && validatePeruvianMobile(tutorTel) ? tutorTel : "") ||
      "";

    setBusy(true);
    const ac = new AbortController();
    const timeout = window.setTimeout(() => ac.abort(), 25000);
    let navigated = false;
    try {
      const patient = await apiFetch<Patient>("/api/patients", {
        method: "POST",
        signal: ac.signal,
        body: JSON.stringify({
          nombres: titleCaseName(form.nombres),
          apellidos: titleCaseName(form.apellidos),
          tipo_documento: form.tipo_documento,
          numero_documento: doc || null,
          fecha_nacimiento: form.fecha_nacimiento || null,
          sexo: form.sexo || null,
          telefono: primaryTel || null,
          email: form.email.trim() || null,
          direccion: form.direccion.trim() || null,
          contacto_emergencia: form.contacto_emergencia.trim() || null,
          alergias: form.alergias.trim() || null,
          lugar_nacimiento: form.lugar_nacimiento.trim() || null,
          ocupacion: form.ocupacion.trim() || null,
          estado_civil: form.estado_civil || null,
          especialidad: form.especialidad.trim() || null,
          nombre_responsable: form.nombre_responsable.trim() || null,
          parentesco_responsable: form.parentesco_responsable.trim() || null,
          telefono_responsable: tutorTel || null,
          documento_responsable: form.documento_responsable.trim() || null,
          es_migrado: form.es_migrado,
          fecha_ingreso_clinica: form.es_migrado
            ? form.fecha_ingreso_clinica || null
            : null,
          resumen_historia_previa: form.es_migrado
            ? form.resumen_historia_previa.trim() || null
            : null,
          saldo_inicial_migracion: form.es_migrado
            ? Number(form.saldo_inicial_migracion) || 0
            : 0,
        }),
      });
      if (!patient?.id) {
        throw new Error("El servidor no devolvió el paciente creado.");
      }
      navigated = true;
      navigateToPacienteFicha(patient.id);
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "No se pudo crear el paciente";
      setError(message);
    } finally {
      window.clearTimeout(timeout);
      if (!navigated) {
        submittingRef.current = false;
        setBusy(false);
      }
    }
  };

  const docHint = !needsDocumentNumber(form.tipo_documento)
    ? form.tipo_documento === "EN_TRAMITE"
      ? "Opcional: número provisional"
      : "No se exige número de documento"
    : form.tipo_documento === "DNI"
      ? `${DNI_LENGTH} dígitos fijos`
      : "Alfanumérico, hasta 12";

  const docTrailing =
    form.tipo_documento === "DNI"
      ? `${form.numero_documento.length}/${DNI_LENGTH}`
      : undefined;

  const telOk = contactPhoneOk();
  const docFormatOk = documentFormatOk();
  const docOk =
    needsDocumentNumber(form.tipo_documento) && docFormatOk && docStatus === "ok";

  const missingFields: string[] = [];
  if (!form.nombres.trim()) missingFields.push("nombres");
  if (!form.apellidos.trim()) missingFields.push("apellidos");
  if (!docFormatOk) missingFields.push("documento");
  if (minor) {
    if (!form.nombre_responsable.trim()) missingFields.push("apoderado");
    if (!telOk) missingFields.push("celular del tutor");
  } else if (!telOk) {
    missingFields.push("celular válido");
  }
  if (docStatus === "dup") {
    /* blocked below */
  }
  const canSubmit = missingFields.length === 0 && docStatus !== "dup";
  const submitBlockedReason =
    docStatus === "dup"
      ? "Este documento ya está registrado"
      : busy
        ? "Creando paciente…"
        : !canSubmit
          ? `Completa: ${missingFields.join(", ")}`
          : undefined;

  return (
    <PageContainer width="narrow">
      <div>
        <h1 className="text-page-title text-balance text-slate-800">Nuevo paciente</h1>
        <p className="mt-1 text-sm text-slate-500">
          Elija el perfil de edad y complete solo lo esencial. El resto se puede
          completar después en la ficha.
        </p>
      </div>

      {error && (
        <div
          className="rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-600"
          role="alert"
        >
          {error}
        </div>
      )}

      <Card>
        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="space-y-5"
          noValidate
        >
          {/* Perfil de edad — one click */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 className="text-section-title text-slate-800">¿Quién se atiende?</h2>
              {(age !== null || bandTouched) && (
                <p className="text-help text-slate-500">
                  {formatAgeLabel(age, ageBand)}
                  {age !== null ? ` · ${bandMeta.label}` : ""}
                </p>
              )}
            </div>
            <div
              className="grid grid-cols-2 gap-2 sm:grid-cols-5"
              role="radiogroup"
              aria-label="Perfil de edad del paciente"
            >
              {AGE_BANDS.map((band) => {
                const Icon = bandIcon(band.id);
                const selected = ageBand === band.id;
                return (
                  <button
                    key={band.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => applyBand(band.id)}
                    className={[
                      "flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition-smooth",
                      selected
                        ? "border-brand-500 bg-brand-50/80 shadow-sm ring-1 ring-brand-500/30"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                    ].join(" ")}
                  >
                    <Icon
                      className={`h-4 w-4 ${selected ? "text-brand-600" : "text-slate-400"}`}
                      aria-hidden
                    />
                    <span
                      className={`text-sm font-semibold ${selected ? "text-brand-900" : "text-slate-800"}`}
                    >
                      {band.label}
                    </span>
                    <span className="text-[11px] leading-tight text-slate-500">
                      {band.shortAges} años
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-help text-slate-500">{bandMeta.hint}</p>
          </section>

          {/* Identidad */}
          <section className="space-y-4">
            <h2 className="text-section-title text-slate-800">Identidad</h2>

            {/* 1. Nombre completo */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                ref={nombresRef}
                label="Nombres *"
                value={form.nombres}
                onChange={(e) => onNombresChange(e.target.value)}
                onBlur={() => blurName("nombres")}
                autoComplete="given-name"
                required
                error={fieldErrors.nombres}
                placeholder={minor ? "Nombre del niño/a" : "María Elena"}
                hint={
                  form.sexo === "F"
                    ? "Sexo sugerido: Femenino (puede cambiarlo)"
                    : form.sexo === "M"
                      ? "Sexo sugerido: Masculino (puede cambiarlo)"
                      : "Al escribir el nombre se sugiere el sexo"
                }
              />
              <Input
                label="Apellidos *"
                value={form.apellidos}
                onChange={(e) => set("apellidos", e.target.value)}
                onBlur={() => blurName("apellidos")}
                autoComplete="family-name"
                required
                error={fieldErrors.apellidos}
                placeholder="Pérez Gómez"
              />
            </div>

            {/* 2. Documento (tipo + número) justo bajo nombres */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-label text-slate-700">Tipo documento</span>
                <select
                  value={form.tipo_documento}
                  onChange={(e) => onTipoChange(e.target.value as DocTipo)}
                  className={selectClass}
                >
                  <option value="DNI">DNI</option>
                  <option value="CE">Carné de extranjería</option>
                  <option value="PASAPORTE">Pasaporte</option>
                  <option value="EN_TRAMITE">En trámite</option>
                  <option value="SIN_DOC">Sin documento</option>
                  <option value="OTRO">Otro</option>
                </select>
              </label>

              {needsDocumentNumber(form.tipo_documento) ? (
                <div>
                  <Input
                    ref={docRef}
                    label={`N° ${docTipoLabel(form.tipo_documento)} *`}
                    value={form.numero_documento}
                    onChange={(e) => onDocumentoChange(e.target.value)}
                    inputMode={form.tipo_documento === "DNI" ? "numeric" : "text"}
                    pattern={form.tipo_documento === "DNI" ? "\\d{8}" : undefined}
                    maxLength={docMaxLen(form.tipo_documento)}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={form.tipo_documento === "DNI" ? "12345678" : "Número"}
                    error={fieldErrors.numero_documento}
                    hint={docStatus === "checking" ? "Verificando…" : docHint}
                    trailing={docTrailing}
                    success={docOk}
                    aria-invalid={!!fieldErrors.numero_documento || docStatus === "dup"}
                  />
                  {docStatus === "ok" && (
                    <p className="mt-1 flex items-center gap-1 text-help text-success-600">
                      <Check className="h-3.5 w-3.5" aria-hidden />
                      Documento disponible
                    </p>
                  )}
                  {docStatus === "dup" && dupPatient && (
                    <p className="mt-1 text-help text-danger-600">
                      Ya registrado: {dupPatient.nombres} {dupPatient.apellidos} (
                      {formatFichaLabel(dupPatient.numero_ficha)}).{" "}
                      <PacienteFichaLink
                        patientId={dupPatient.id}
                        className="font-medium text-brand-600 underline-offset-2 hover:underline"
                      >
                        Abrir ficha
                      </PacienteFichaLink>
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-3 text-sm text-slate-600">
                  <p className="font-medium text-slate-800">
                    {docTipoLabel(form.tipo_documento)}
                  </p>
                  <p className="mt-0.5 text-help text-slate-500">
                    Sin número obligatorio. Puede completarlo después en la ficha.
                  </p>
                  {form.tipo_documento === "EN_TRAMITE" && (
                    <div className="mt-3">
                      <Input
                        label="N° provisional (opcional)"
                        value={form.numero_documento}
                        onChange={(e) => onDocumentoChange(e.target.value)}
                        autoComplete="off"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 3. Fecha de nacimiento + sexo */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                ref={fechaNacRef}
                label={minor ? "Fecha de nacimiento *" : "Fecha de nacimiento"}
                type="date"
                value={form.fecha_nacimiento}
                onChange={(e) => set("fecha_nacimiento", e.target.value)}
                autoComplete="bday"
                max={new Date().toISOString().slice(0, 10)}
                error={fieldErrors.fecha_nacimiento}
                hint={
                  age !== null ? formatAgeLabel(age, ageBand) : "Calcula la edad al instante"
                }
              />
              <label className="block">
                <span className="mb-1 block text-label text-slate-700">Sexo</span>
                <select
                  value={form.sexo}
                  onChange={(e) => onSexoChange(e.target.value)}
                  className={selectClass}
                  aria-describedby="sexo-hint"
                >
                  <option value="">— Opcional —</option>
                  <option value="F">Femenino</option>
                  <option value="M">Masculino</option>
                  <option value="X">Otro / no especifica</option>
                </select>
                <p id="sexo-hint" className="mt-1 text-help text-slate-500">
                  {sexoManual
                    ? "Definido manualmente"
                    : form.sexo
                      ? "Detectado por el nombre (editable)"
                      : "Se completa solo al reconocer el nombre"}
                </p>
              </label>
            </div>

            {/* 4. Celular — canal WhatsApp de documentos */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 sm:p-4">
              <Input
                ref={telRef}
                label={
                  minor
                    ? "Celular del paciente (WhatsApp)"
                    : "Celular del paciente * (WhatsApp)"
                }
                value={form.telefono}
                onChange={(e) => onTelefonoChange(e.target.value)}
                inputMode="numeric"
                pattern="9\\d{8}"
                maxLength={PHONE_LENGTH}
                autoComplete="tel-national"
                placeholder="987654321"
                error={fieldErrors.telefono}
                hint={
                  minor
                    ? "Comprobantes y documentos se envían por WhatsApp. Si no tiene, use el del apoderado."
                    : "Comprobantes, tiques y reportes se envían a este número por WhatsApp"
                }
                trailing={`${form.telefono.length}/${PHONE_LENGTH}`}
                success={validatePeruvianMobile(form.telefono)}
              />
            </div>
          </section>

          {/* Apoderado — minors or optional support */}
          {(minor || showCaregiverOptional || form.nombre_responsable) && (
            <section
              className={[
                "space-y-4 rounded-xl border p-4",
                minor
                  ? "border-brand-200 bg-brand-50/40"
                  : "border-slate-200 bg-surface-subtle",
              ].join(" ")}
            >
              <div className="flex items-start gap-2.5">
                <Shield
                  className={`mt-0.5 h-4 w-4 shrink-0 ${minor ? "text-brand-600" : "text-slate-500"}`}
                  aria-hidden
                />
                <div>
                  <h2 className="text-section-title text-slate-800">
                    {minor ? "Apoderado / tutor *" : "Familiar o cuidador de apoyo"}
                  </h2>
                  <p className="mt-0.5 text-help text-slate-500">
                    {minor
                      ? "Si el menor no tiene celular, los envíos por WhatsApp usan el del apoderado."
                      : "Útil en adultos mayores o pacientes que dependen de un familiar."}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label={minor ? "Nombre del apoderado *" : "Nombre del familiar"}
                  value={form.nombre_responsable}
                  onChange={(e) => set("nombre_responsable", e.target.value)}
                  onBlur={() => blurName("nombre_responsable")}
                  error={fieldErrors.nombre_responsable}
                  placeholder="Nombre completo"
                  autoComplete="name"
                />
                <label className="block">
                  <span className="mb-1 block text-label text-slate-700">Parentesco</span>
                  <select
                    value={form.parentesco_responsable}
                    onChange={(e) => set("parentesco_responsable", e.target.value)}
                    className={selectClass}
                  >
                    <option value="">— Seleccione —</option>
                    {PARENTESCO_OPTIONS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
                <Input
                  ref={tutorTelRef}
                  label={minor ? "Celular del apoderado *" : "Celular del familiar"}
                  value={form.telefono_responsable}
                  onChange={(e) => onTutorTelChange(e.target.value)}
                  inputMode="numeric"
                  maxLength={PHONE_LENGTH}
                  placeholder="987654321"
                  error={fieldErrors.telefono_responsable}
                  hint="9 dígitos, empieza en 9 · WhatsApp de respaldo"
                  trailing={`${form.telefono_responsable.length}/${PHONE_LENGTH}`}
                  success={validatePeruvianMobile(form.telefono_responsable)}
                />
                <Input
                  label="DNI del apoderado"
                  value={form.documento_responsable}
                  onChange={(e) =>
                    set("documento_responsable", digitsOnly(e.target.value, 12))
                  }
                  inputMode="numeric"
                  placeholder="Opcional"
                  autoComplete="off"
                />
              </div>
            </section>
          )}

          {!minor && !showCaregiverOptional && !form.nombre_responsable && (
            <button
              type="button"
              onClick={() => setShowCaregiverOptional(true)}
              className="text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              + Añadir familiar o cuidador de apoyo
            </button>
          )}

          {/* 5. Alergias y resto */}
          <section className="space-y-4">
            <h2 className="text-section-title text-slate-800">Salud y atención</h2>
            <label className="block">
              <span className="mb-1 block text-label text-slate-700">
                Alergias <span className="font-normal text-slate-500">(recomendado)</span>
              </span>
              <textarea
                value={form.alergias}
                onChange={(e) => set("alergias", e.target.value)}
                rows={2}
                className={selectClass}
                placeholder="Penicilina, látex… o escriba Ninguna"
              />
            </label>
            <p className="text-sm text-slate-500">
              Especialidad — ayuda a filtrar el listado (ortodoncia, pediatría, etc.).
            </p>
            <SpecialtySelect
              label="Especialidad"
              value={form.especialidad}
              onChange={(v) => set("especialidad", v)}
              allowEmpty
              required={false}
            />
          </section>

          {/* Alta retroactiva */}
          <section className="space-y-4 rounded-lg border border-slate-200 bg-surface-subtle p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={form.es_migrado}
                onChange={(e) => {
                  const on = e.target.checked;
                  setForm((prev) => ({
                    ...prev,
                    es_migrado: on,
                    ...(on
                      ? {}
                      : {
                          fecha_ingreso_clinica: "",
                          resumen_historia_previa: "",
                          saldo_inicial_migracion: "0",
                        }),
                  }));
                }}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-800">
                  Paciente ya existía antes del sistema (alta retroactiva)
                </span>
                <span className="mt-0.5 block text-help text-slate-500">
                  Carga historia previa sin distorsionar reportes del día.
                </span>
              </span>
            </label>

            {form.es_migrado && (
              <div className="space-y-4 border-t border-slate-200 pt-4">
                <Input
                  label="Fecha de ingreso a la clínica *"
                  type="date"
                  value={form.fecha_ingreso_clinica}
                  onChange={(e) => set("fecha_ingreso_clinica", e.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                  error={fieldErrors.fecha_ingreso_clinica}
                  required
                />
                <label className="block">
                  <span className="mb-1 block text-label text-slate-700">
                    Resumen de historia clínica previa{" "}
                    <span className="font-normal text-slate-500">(opcional)</span>
                  </span>
                  <textarea
                    value={form.resumen_historia_previa}
                    onChange={(e) => set("resumen_historia_previa", e.target.value)}
                    rows={3}
                    maxLength={5000}
                    className={selectClass}
                    placeholder="Antecedentes y tratamientos previos…"
                  />
                </label>
                <Input
                  label="Saldo inicial (S/)"
                  type="number"
                  step="0.01"
                  value={form.saldo_inicial_migracion}
                  onChange={(e) => set("saldo_inicial_migracion", e.target.value)}
                  error={fieldErrors.saldo_inicial_migracion}
                  hint="0 si no aplica."
                />
              </div>
            )}
          </section>

          {/* Opcionales */}
          <div className="border-t border-slate-100 pt-2">
            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              className="flex w-full items-center justify-between rounded-lg px-1 py-2 text-left text-sm font-medium text-slate-600 transition-smooth hover:bg-slate-50 hover:text-slate-800"
              aria-expanded={showMore}
            >
              <span>Más datos (opcionales)</span>
              {showMore ? (
                <ChevronUp className="h-4 w-4" aria-hidden />
              ) : (
                <ChevronDown className="h-4 w-4" aria-hidden />
              )}
            </button>

            {showMore && (
              <div className="mt-3 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input
                    label="Email"
                    type="email"
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    autoComplete="email"
                    placeholder="correo@ejemplo.com"
                  />
                  <Input
                    label="Lugar de nacimiento"
                    value={form.lugar_nacimiento}
                    onChange={(e) => set("lugar_nacimiento", e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input
                    label={minor ? "Colegio / actividad" : "Ocupación"}
                    value={form.ocupacion}
                    onChange={(e) => set("ocupacion", e.target.value)}
                    autoComplete="organization-title"
                  />
                  {!minor && (
                    <label className="block">
                      <span className="mb-1 block text-label text-slate-700">Estado civil</span>
                      <select
                        value={form.estado_civil}
                        onChange={(e) => set("estado_civil", e.target.value)}
                        className={selectClass}
                      >
                        {ESTADO_CIVIL.map((opt) => (
                          <option key={opt || "empty"} value={opt}>
                            {opt || "—"}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                <Input
                  label="Dirección"
                  value={form.direccion}
                  onChange={(e) => set("direccion", e.target.value)}
                  autoComplete="street-address"
                />
                <Input
                  label="Contacto de emergencia (otro)"
                  value={form.contacto_emergencia}
                  onChange={(e) => set("contacto_emergencia", e.target.value)}
                  placeholder="Nombre y celular adicionales"
                />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t border-slate-100 pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="submit"
                loading={busy}
                disabled={busy || docStatus === "dup"}
                title={submitBlockedReason}
              >
                Crear y abrir Ficha Clínica
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => router.back()}
                disabled={busy}
              >
                Cancelar
              </Button>
              <span className="text-help text-slate-500 sm:ml-auto">
                {docStatus === "checking"
                  ? "Verificando documento…"
                  : "Enter para crear · Tab para avanzar"}
              </span>
            </div>
            {!busy && docStatus !== "dup" && !canSubmit && (
              <p className="text-help text-amber-700" role="status">
                {submitBlockedReason}
              </p>
            )}
          </div>
        </form>
      </Card>
    </PageContainer>
  );
}
