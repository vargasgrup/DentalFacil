"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Users,
  Search,
  Plus,
  FileText,
  Phone,
  IdCard,
  Stethoscope,
  MoreVertical,
  Pencil,
  CalendarPlus,
  UserX,
  UserCheck,
  Trash2,
} from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAppRefresh } from "@/hooks/useAppRefresh";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/ui/PageContainer";
import { ModuleHeader } from "@/components/ui/ModuleHeader";
import { PacienteFichaLink } from "@/components/PacienteFichaLink";
import {
  PatientEditModal,
  type PatientAdmin,
} from "@/components/patient/PatientEditModal";
import { formatFichaCode } from "@/lib/ficha";
import { ESPECIALIDADES_ODONTOLOGICAS, especialidadShort } from "@/lib/especialidades";
import {
  bandFromAge,
  bandLabel,
  calcAgeYears,
  docTipoLabel,
} from "@/lib/patientAge";

type EstadoFilter = "activos" | "inactivos" | "todos";

export default function PacientesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.rol === "ADMIN";

  const [patients, setPatients] = useState<PatientAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [especialidadFilter, setEspecialidadFilter] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>("activos");
  const [specialtyOptions, setSpecialtyOptions] = useState<string[]>([
    ...ESPECIALIDADES_ODONTOLOGICAS,
  ]);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [editing, setEditing] = useState<PatientAdmin | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch<{ items: string[] }>("/api/config/especialidades")
      .then((data) => {
        if (Array.isArray(data.items) && data.items.length > 0) {
          setSpecialtyOptions(data.items);
        }
      })
      .catch(() => {});
  }, []);

  const load = async () => {
    setLoading(true);
    setLoadError("");
    const params = new URLSearchParams();
    params.set("estado", estadoFilter);
    if (especialidadFilter) params.set("especialidad", especialidadFilter);
    try {
      const data = await apiFetch<PatientAdmin[]>(`/api/patients?${params.toString()}`);
      setPatients(data);
    } catch (err) {
      setPatients([]);
      setLoadError(
        err instanceof ApiError
          ? err.message
          : "No se pudieron cargar los pacientes. Revisa la conexión e intenta de nuevo."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [especialidadFilter, estadoFilter]);

  useAppRefresh(() => {
    void load();
  });

  useEffect(() => {
    if (!menuId) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuId(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuId(null);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuId]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const filtered = useMemo(() => {
    if (!search.trim()) return patients;
    const q = search.toLowerCase();
    return patients.filter((p) =>
      `${p.nombres} ${p.apellidos} ${p.numero_documento || ""} ${p.numero_ficha} ${formatFichaCode(p.numero_ficha)} ${p.especialidad || ""}`
        .toLowerCase()
        .includes(q)
    );
  }, [search, patients]);

  const hasFilters = Boolean(search.trim() || especialidadFilter || estadoFilter !== "activos");

  const showMsg = (type: "ok" | "err", text: string) => setToast({ type, text });

  const openEdit = async (p: PatientAdmin) => {
    setMenuId(null);
    setBusyId(p.id);
    try {
      const full = await apiFetch<PatientAdmin>(`/api/patients/${p.id}`);
      setEditing(full);
    } catch (err) {
      showMsg(
        "err",
        err instanceof ApiError ? err.message : "No se pudo cargar el paciente."
      );
    } finally {
      setBusyId(null);
    }
  };

  const deactivate = async (p: PatientAdmin) => {
    setMenuId(null);
    const ok = window.confirm(
      `¿Dar de baja a ${p.nombres} ${p.apellidos} (${formatFichaCode(p.numero_ficha)})?\n\nLa ficha clínica se conserva y podrás reactivarlo desde «Inactivos».`
    );
    if (!ok) return;
    setBusyId(p.id);
    try {
      await apiFetch(`/api/patients/${p.id}/deactivate`, { method: "POST" });
      showMsg("ok", "Paciente dado de baja.");
      await load();
    } catch (err) {
      showMsg("err", err instanceof ApiError ? err.message : "No se pudo dar de baja.");
    } finally {
      setBusyId(null);
    }
  };

  const reactivate = async (p: PatientAdmin) => {
    setMenuId(null);
    setBusyId(p.id);
    try {
      await apiFetch(`/api/patients/${p.id}/reactivate`, { method: "POST" });
      showMsg("ok", "Paciente reactivado.");
      await load();
    } catch (err) {
      showMsg("err", err instanceof ApiError ? err.message : "No se pudo reactivar.");
    } finally {
      setBusyId(null);
    }
  };

  const deletePermanent = async (p: PatientAdmin) => {
    setMenuId(null);
    const code = formatFichaCode(p.numero_ficha);
    const typed = window.prompt(
      `ELIMINACIÓN PERMANENTE\n\nSe borrará la ficha clínica, evoluciones, citas y archivos de ${p.nombres} ${p.apellidos}.\nLos pagos de caja se conservan sin vínculo al paciente.\n\nEscribe ${code} para confirmar:`
    );
    if (!typed || typed.trim().toUpperCase() !== code.toUpperCase()) {
      if (typed !== null) showMsg("err", "Confirmación incorrecta. No se eliminó nada.");
      return;
    }
    setBusyId(p.id);
    try {
      await apiFetch(`/api/patients/${p.id}?permanent=true`, { method: "DELETE" });
      showMsg("ok", "Paciente eliminado permanentemente.");
      await load();
    } catch (err) {
      showMsg(
        "err",
        err instanceof ApiError ? err.message : "No se pudo eliminar el paciente."
      );
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <PageContainer>
        <div className="skeleton h-9 w-48 rounded-lg" />
        <div className="skeleton h-11 w-full rounded-lg" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="skeleton h-40 rounded-card" />
          ))}
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <ModuleHeader
        crumbs={[
          { label: "Inicio", href: "/dashboard" },
          { label: "Pacientes" },
        ]}
        title="Pacientes"
        description={
          `${filtered.length} ${filtered.length === 1 ? "paciente" : "pacientes"}${
            hasFilters
              ? " encontrados"
              : " registrados · administra o abre su ficha clínica"
          }`
        }
        actions={
          <Link href="/pacientes/nuevo">
            <Button icon={<Plus className="h-4 w-4" />}>Nuevo paciente</Button>
          </Link>
        }
      />

      {toast && (
        <p
          role="status"
          className={`rounded-lg border px-3 py-2 text-sm ${
            toast.type === "ok"
              ? "border-success-200 bg-success-50 text-success-800"
              : "border-danger-200 bg-danger-50 text-danger-700"
          }`}
        >
          {toast.text}
        </p>
      )}

      {loadError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700"
        >
          <span>{loadError}</span>
          <Button type="button" variant="secondary" onClick={() => void load()}>
            Reintentar
          </Button>
        </div>
      )}

      <div className="app-main-sticky py-2" data-sticky-chrome="pacientes-filters">
        <div className="module-surface-muted flex flex-col gap-3 p-3.5 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, DNI, ficha o especialidad..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm transition-smooth focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
          />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex w-full shrink-0 items-center gap-2 sm:w-44">
            <select
              value={estadoFilter}
              onChange={(e) => setEstadoFilter(e.target.value as EstadoFilter)}
              aria-label="Filtrar por estado"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3 text-sm shadow-sm transition-smooth focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
            >
              <option value="activos">Activos</option>
              <option value="inactivos">Inactivos</option>
              <option value="todos">Todos</option>
            </select>
          </label>
          <label className="flex w-full shrink-0 items-center gap-2 sm:w-72">
            <Stethoscope className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            <select
              value={especialidadFilter}
              onChange={(e) => setEspecialidadFilter(e.target.value)}
              aria-label="Filtrar por especialidad"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3 text-sm shadow-sm transition-smooth focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
            >
              <option value="">Todas las especialidades</option>
              {specialtyOptions.map((esp) => (
                <option key={esp} value={esp}>
                  {esp}
                </option>
              ))}
            </select>
          </label>
        </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users className="h-7 w-7" />}
          title={hasFilters ? "No se encontraron pacientes" : "Sin pacientes aún"}
          description={
            hasFilters
              ? "Prueba con otro término o cambia los filtros de estado/especialidad"
              : "Crea tu primer paciente para empezar a usar la Ficha Clínica."
          }
          action={
            !hasFilters ? (
              <Link href="/pacientes/nuevo">
                <Button icon={<Plus className="h-4 w-4" />}>Nuevo paciente</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => {
            const initials = `${p.nombres[0] || ""}${p.apellidos[0] || ""}`.toUpperCase();
            const inactive = p.activo === false;
            const menuOpen = menuId === p.id;
            return (
              <Card
                key={p.id}
                className={`relative h-full transition-smooth hover:border-brand-200 hover:shadow-card-hover ${
                  inactive ? "opacity-80" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <PacienteFichaLink
                    patientId={p.id}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700 transition-smooth hover:bg-brand-100"
                  >
                    {initials}
                  </PacienteFichaLink>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <PacienteFichaLink
                            patientId={p.id}
                            className="truncate text-sm font-semibold text-slate-800 hover:text-brand-700"
                          >
                            {p.nombres} {p.apellidos}
                          </PacienteFichaLink>
                          <Badge variant="brand" className="font-mono tracking-wide">
                            {formatFichaCode(p.numero_ficha)}
                          </Badge>
                          {(() => {
                            const age = calcAgeYears(p.fecha_nacimiento);
                            const band = bandFromAge(age);
                            if (age === null || !band) return null;
                            return (
                              <Badge variant="neutral">
                                {bandLabel(band)} · {age}a
                              </Badge>
                            );
                          })()}
                          {inactive && <Badge variant="neutral">Inactivo</Badge>}
                        </div>
                      </div>
                      <div className="relative shrink-0" ref={menuOpen ? menuRef : undefined}>
                        <button
                          type="button"
                          aria-label={`Administrar ${p.nombres} ${p.apellidos}`}
                          aria-haspopup="menu"
                          aria-expanded={menuOpen}
                          disabled={busyId === p.id}
                          onClick={() => setMenuId(menuOpen ? null : p.id)}
                          className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition-smooth hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                        {menuOpen && (
                          <div
                            role="menu"
                            className="absolute right-0 z-40 mt-1 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-dropdown"
                          >
                            <PacienteFichaLink
                              role="menuitem"
                              patientId={p.id}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-brand-50 hover:text-brand-800"
                              onClick={() => setMenuId(null)}
                            >
                              <FileText className="h-3.5 w-3.5" />
                              Abrir ficha clínica
                            </PacienteFichaLink>
                            <button
                              type="button"
                              role="menuitem"
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-brand-50 hover:text-brand-800"
                              onClick={() => void openEdit(p)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Editar datos
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-brand-50 hover:text-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={inactive}
                              onClick={() => {
                                setMenuId(null);
                                if (inactive) {
                                  showMsg("err", "Reactiva al paciente antes de agendar una cita.");
                                  return;
                                }
                                router.push(`/agenda?nueva=1&patient_id=${p.id}`);
                              }}
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />
                              Nueva cita
                            </button>
                            <div className="my-1 border-t border-slate-100" />
                            {inactive ? (
                              <button
                                type="button"
                                role="menuitem"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-success-700 hover:bg-success-50"
                                onClick={() => void reactivate(p)}
                              >
                                <UserCheck className="h-3.5 w-3.5" />
                                Reactivar
                              </button>
                            ) : (
                              <button
                                type="button"
                                role="menuitem"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-warning-700 hover:bg-warning-50"
                                onClick={() => void deactivate(p)}
                              >
                                <UserX className="h-3.5 w-3.5" />
                                Dar de baja
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                type="button"
                                role="menuitem"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger-700 hover:bg-danger-50"
                                onClick={() => void deletePermanent(p)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Eliminar permanente
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <PacienteFichaLink patientId={p.id} className="mt-1.5 block">
                      {p.especialidad ? (
                        <p className="flex items-center gap-1.5 text-xs font-medium text-brand-700">
                          <Stethoscope className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          <span className="truncate" title={p.especialidad}>
                            {especialidadShort(p.especialidad)}
                          </span>
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400">Sin especialidad asignada</p>
                      )}
                      <ul className="mt-3 space-y-1.5 text-sm text-slate-500">
                        <li className="flex items-center gap-2">
                          <IdCard className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <span>
                            {p.numero_documento
                              ? `${docTipoLabel(p.tipo_documento)} ${p.numero_documento}`
                              : p.tipo_documento
                                ? docTipoLabel(p.tipo_documento)
                                : "Sin documento"}
                          </span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <span>{p.telefono || "Sin teléfono"}</span>
                        </li>
                      </ul>
                    </PacienteFichaLink>

                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                      <span className="text-help text-slate-400">
                        {new Date(p.created_at).toLocaleDateString("es-PE", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void openEdit(p)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-brand-700"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Editar
                        </button>
                        <PacienteFichaLink
                          patientId={p.id}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          Ficha
                        </PacienteFichaLink>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {editing && (
        <PatientEditModal
          patient={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setPatients((prev) =>
              prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x))
            );
            showMsg("ok", "Datos del paciente actualizados.");
          }}
        />
      )}
    </PageContainer>
  );
}
