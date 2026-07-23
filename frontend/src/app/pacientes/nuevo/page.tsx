"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { apiFetch } from "@/lib/api";
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

interface Patient {
  id: string;
  numero_ficha: number;
  nombres?: string;
  apellidos?: string;
  numero_documento?: string;
}

type DocTipo = "DNI" | "CE" | "PASAPORTE";

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
  if (tipo === "CE") return 12;
  return 12;
}

function sanitizeDocumento(tipo: DocTipo, raw: string): string {
  if (tipo === "DNI") return digitsOnly(raw, DNI_LENGTH);
  return raw.replace(/[^a-zA-Z0-9]/g, "").slice(0, docMaxLen(tipo)).toUpperCase();
}

export default function NuevoPacientePage() {
  const router = useRouter();
  const nombresRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const telRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [docStatus, setDocStatus] = useState<"idle" | "checking" | "ok" | "dup">("idle");
  const [dupPatient, setDupPatient] = useState<Patient | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    nombres: "",
    apellidos: "",
    tipo_documento: "DNI" as DocTipo,
    numero_documento: "",
    fecha_nacimiento: "",
    lugar_nacimiento: "",
    ocupacion: "",
    estado_civil: "",
    telefono: "",
    email: "",
    direccion: "",
    contacto_emergencia: "",
    nombre_responsable: "",
    alergias: "",
    es_migrado: false,
    fecha_ingreso_clinica: "",
    resumen_historia_previa: "",
    saldo_inicial_migracion: "0",
  });

  useEffect(() => {
    nombresRef.current?.focus();
  }, []);

  const set = useCallback((field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const checkDuplicate = useCallback(async (doc: string, tipo: DocTipo, signal?: AbortSignal) => {
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
      if (signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) {
        setDocStatus((prev) => (prev === "checking" ? "idle" : prev));
        return;
      }
      // No bloquear el alta si el prechequeo falla (red/API): el backend valida igual.
      setDocStatus("idle");
      setDupPatient(null);
    }
  }, []);

  useEffect(() => {
    const doc = form.numero_documento.trim();
    const ready =
      form.tipo_documento === "DNI"
        ? validateDNI(doc)
        : doc.length >= 4;

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
    // Solo al completar el 8.º dígito (no al editar un DNI ya completo)
    if (
      form.tipo_documento === "DNI" &&
      next.length === DNI_LENGTH &&
      prevLen < DNI_LENGTH &&
      form.telefono.length === 0
    ) {
      requestAnimationFrame(() => telRef.current?.focus());
    }
  };

  const onTipoChange = (tipo: DocTipo) => {
    const cleaned = sanitizeDocumento(tipo, form.numero_documento);
    setForm((prev) => ({
      ...prev,
      tipo_documento: tipo,
      numero_documento: cleaned,
    }));
    setDocStatus("idle");
    setDupPatient(null);
    requestAnimationFrame(() => docRef.current?.focus());
  };

  const onTelefonoChange = (raw: string) => {
    set("telefono", normalizePeruvianMobile(raw));
  };

  const blurName = (field: "nombres" | "apellidos") => {
    const v = form[field];
    if (v.trim()) set(field, titleCaseName(v));
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.nombres.trim()) errs.nombres = "Obligatorio";
    if (!form.apellidos.trim()) errs.apellidos = "Obligatorio";

    const doc = form.numero_documento.trim();
    if (!doc) {
      errs.numero_documento = "Obligatorio";
    } else if (form.tipo_documento === "DNI" && !validateDNI(doc)) {
      errs.numero_documento = `DNI: exactamente ${DNI_LENGTH} dígitos`;
    }

    const tel = normalizePeruvianMobile(form.telefono.trim());
    if (!tel) {
      errs.telefono = "Obligatorio (9 dígitos)";
    } else if (!validatePeruvianMobile(tel)) {
      errs.telefono = "Celular Perú: 9 dígitos empezando en 9";
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

    const doc = form.numero_documento.trim();
    const tel = normalizePeruvianMobile(form.telefono.trim());
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
          telefono: tel || null,
          email: form.email.trim() || null,
          direccion: form.direccion.trim() || null,
          contacto_emergencia: form.contacto_emergencia.trim() || null,
          alergias: form.alergias.trim() || null,
          lugar_nacimiento: form.lugar_nacimiento.trim() || null,
          ocupacion: form.ocupacion.trim() || null,
          estado_civil: form.estado_civil || null,
          nombre_responsable: form.nombre_responsable.trim() || null,
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
      router.push(`/pacientes/${patient.id}`);
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "No se pudo crear el paciente";
      setError(message);
    } finally {
      window.clearTimeout(timeout);
      if (!navigated) setBusy(false);
    }
  };

  const docHint =
    form.tipo_documento === "DNI"
      ? `${DNI_LENGTH} dígitos fijos`
      : form.tipo_documento === "CE"
        ? "Hasta 12 caracteres"
        : "Hasta 12 caracteres";

  const docTrailing =
    form.tipo_documento === "DNI"
      ? `${form.numero_documento.length}/${DNI_LENGTH}`
      : undefined;

  const telOk = validatePeruvianMobile(form.telefono);
  const docFormatOk =
    form.tipo_documento === "DNI"
      ? validateDNI(form.numero_documento)
      : form.numero_documento.trim().length >= 4;
  const docOk = docFormatOk && docStatus === "ok";
  const missingFields: string[] = [];
  if (!form.nombres.trim()) missingFields.push("nombres");
  if (!form.apellidos.trim()) missingFields.push("apellidos");
  if (!docFormatOk) missingFields.push("documento");
  if (!telOk) missingFields.push("celular válido (9 dígitos, empieza en 9)");
  const canSubmit =
    missingFields.length === 0 && docStatus !== "dup";
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
        <h1 className="text-page-title text-slate-800 text-balance">Nuevo paciente</h1>
        <p className="mt-1 text-sm text-slate-500">
          Solo lo esencial para abrir la ficha en menos de 30 segundos. El resto se completa después.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-600" role="alert">
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
          {/* Identidad */}
          <section className="space-y-4">
            <h2 className="text-section-title text-slate-800">Identidad</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                ref={nombresRef}
                label="Nombres *"
                value={form.nombres}
                onChange={(e) => set("nombres", e.target.value)}
                onBlur={() => blurName("nombres")}
                autoComplete="given-name"
                required
                error={fieldErrors.nombres}
                placeholder="María Elena"
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
                </select>
              </label>
              <div>
                <Input
                  ref={docRef}
                  label="N° documento *"
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
                    <Link
                      href={`/pacientes/${dupPatient.id}`}
                      className="font-medium text-brand-600 underline-offset-2 hover:underline"
                    >
                      Abrir ficha
                    </Link>
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Contacto rápido */}
          <section className="space-y-4">
            <h2 className="text-section-title text-slate-800">Contacto</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                ref={telRef}
                label="Celular *"
                value={form.telefono}
                onChange={(e) => onTelefonoChange(e.target.value)}
                inputMode="numeric"
                pattern="9\\d{8}"
                maxLength={PHONE_LENGTH}
                autoComplete="tel-national"
                placeholder="987654321"
                error={fieldErrors.telefono}
                hint="9 dígitos, empieza en 9"
                trailing={`${form.telefono.length}/${PHONE_LENGTH}`}
                success={telOk}
              />
              <Input
                label="Fecha de nacimiento"
                type="date"
                value={form.fecha_nacimiento}
                onChange={(e) => set("fecha_nacimiento", e.target.value)}
                autoComplete="bday"
                max={new Date().toISOString().slice(0, 10)}
              />
            </div>
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
                  setFieldErrors((prev) => {
                    const next = { ...prev };
                    delete next.fecha_ingreso_clinica;
                    delete next.saldo_inicial_migracion;
                    return next;
                  });
                }}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-800">
                  Paciente ya existía antes del sistema (alta retroactiva)
                </span>
                <span className="mt-0.5 block text-help text-slate-500">
                  Carga historia previa sin distorsionar reportes de productividad del día.
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
                    placeholder="Antecedentes y tratamientos previos al sistema…"
                  />
                </label>
                <div>
                  <Input
                    label="Saldo inicial (S/)"
                    type="number"
                    step="0.01"
                    value={form.saldo_inicial_migracion}
                    onChange={(e) => set("saldo_inicial_migracion", e.target.value)}
                    error={fieldErrors.saldo_inicial_migracion}
                    hint="Positivo si el paciente tiene un saldo pendiente. Déjalo en 0 si no aplica."
                  />
                </div>
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
                    label="Ocupación"
                    value={form.ocupacion}
                    onChange={(e) => set("ocupacion", e.target.value)}
                    autoComplete="organization-title"
                  />
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
                </div>
                <Input
                  label="Dirección"
                  value={form.direccion}
                  onChange={(e) => set("direccion", e.target.value)}
                  autoComplete="street-address"
                />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input
                    label="Contacto de emergencia"
                    value={form.contacto_emergencia}
                    onChange={(e) => set("contacto_emergencia", e.target.value)}
                    placeholder="Nombre y celular"
                  />
                  <Input
                    label="Nombre del responsable"
                    value={form.nombre_responsable}
                    onChange={(e) => set("nombre_responsable", e.target.value)}
                    hint="Si el paciente es menor de edad"
                  />
                </div>
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
              <Button type="button" variant="ghost" onClick={() => router.back()} disabled={busy}>
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
