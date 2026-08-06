"use client";

import { useEffect, useState, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Plus,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatDateTime, formatTime, localDateTimeToISO, localTimeToMinutes } from "@/lib/datetime";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/Input";
import { DayGrid } from "@/components/agenda/DayGrid";
import { WeekGrid } from "@/components/agenda/WeekGrid";
import { MonthGrid } from "@/components/agenda/MonthGrid";
import { PageContainer } from "@/components/ui/PageContainer";
import { ModuleHeader } from "@/components/ui/ModuleHeader";
import { PacienteFichaLink } from "@/components/PacienteFichaLink";
import { PatientPicker, type PickedPatient } from "@/components/PatientPicker";
import { SpecialtySelect } from "@/components/SpecialtySelect";
import { TreatmentAutocomplete } from "@/components/TreatmentAutocomplete";
import { useAppRefresh } from "@/hooks/useAppRefresh";
import {
  CalendarAppointment,
  DEFAULT_CLOSE,
  DEFAULT_OPEN,
  addDays,
  dateToLocalInput,
  estadoBadgeVariant,
  formatMinutes12h,
  parseHHMM,
  getWeekStart,
} from "@/lib/calendar";


interface Patient {
  id: string;
  numero_ficha: number;
  nombres: string;
  apellidos: string;
  telefono?: string;
  numero_documento?: string;
  activo?: boolean;
}

interface Doctor {
  id: string;
  nombre: string;
}

type ViewMode = "month" | "week" | "day" | "list";

export default function AgendaPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-5 p-1">
          <div className="skeleton h-16 w-72 rounded-xl" />
          <div className="skeleton h-14 w-full rounded-xl" />
          <div className="skeleton h-[28rem] rounded-2xl" />
        </div>
      }
    >
      <AgendaPageInner />
    </Suspense>
  );
}

function AgendaPageInner() {
  const searchParams = useSearchParams();
  const [view, setView] = useState<ViewMode>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [appointments, setAppointments] = useState<CalendarAppointment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [openHHMM, setOpenHHMM] = useState(DEFAULT_OPEN);
  const [closeHHMM, setCloseHHMM] = useState(DEFAULT_CLOSE);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<CalendarAppointment | null>(null);
  const [error, setError] = useState("");
  const [estadoFilter, setEstadoFilter] = useState("todos");
  const [filterPatient, setFilterPatient] = useState<PickedPatient | null>(null);

  const [selectedPatient, setSelectedPatient] = useState<PickedPatient | null>(null);
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [duracion, setDuracion] = useState("30");
  const [notas, setNotas] = useState("");
  const [especialidad, setEspecialidad] = useState("");
  const [doctorId, setDoctorId] = useState<string | undefined>();

  // Prefill from Ficha Clínica: /agenda?patient_id=123
  // Quick create from topbar: /agenda?nueva=1
  useEffect(() => {
    const pid = searchParams.get("patient_id");
    const nueva = searchParams.get("nueva");

    if (pid) {
      apiFetch<Patient>(`/api/patients/${pid}`)
        .then((p) => {
          if (p.activo === false) {
            setError("Este paciente está dado de baja. Reactívalo antes de agendar.");
            return;
          }
          setSelectedPatient({
            id: p.id,
            numero_ficha: p.numero_ficha,
            nombres: p.nombres,
            apellidos: p.apellidos,
            telefono: p.telefono,
            numero_documento: p.numero_documento,
          });
          setFecha(dateToLocalInput(new Date()));
          setHora("09:00");
          setShowNew(true);
          setView("day");
        })
        .catch(() => {
          setError("No se pudo cargar el paciente para agendar.");
        });
      return;
    }

    if (nueva === "1") {
      setSelectedPatient(null);
      setFecha(dateToLocalInput(new Date()));
      setHora("09:00");
      setShowNew(true);
      setView("day");
    }
  }, [searchParams]);

  useEffect(() => {
    if (window.innerWidth < 768) setView("list");
  }, []);

  useEffect(() => {
    apiFetch<Doctor[]>("/api/users/doctors")
      .then(setDoctors)
      .catch(() => setDoctors([]));
    apiFetch<{ hora_apertura: string; hora_cierre: string }>("/api/config/hours")
      .then((h) => {
        setOpenHHMM(h.hora_apertura || DEFAULT_OPEN);
        setCloseHHMM(h.hora_cierre || DEFAULT_CLOSE);
      })
      .catch(() => {});
  }, []);

  const loadAppointments = useCallback(async () => {
    let start: Date;
    let end: Date;
    if (view === "month") {
      start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      start = getWeekStart(start);
      end = addDays(start, 42);
    } else if (view === "week") {
      start = getWeekStart(currentDate);
      end = addDays(start, 7);
    } else {
      start = new Date(currentDate);
      start.setHours(0, 0, 0, 0);
      end = addDays(start, 1);
    }
    try {
      const data = await apiFetch<CalendarAppointment[]>(
        `/api/appointments?start=${start.toISOString()}&end=${end.toISOString()}`
      );
      setAppointments(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [currentDate, view]);

  useEffect(() => {
    setLoading(true);
    loadAppointments();
  }, [loadAppointments]);

  useAppRefresh(() => {
    setLoading(true);
    void loadAppointments();
  });

  const filtered = useMemo(() => {
    return appointments.filter((a) => {
      if (estadoFilter !== "todos" && a.estado !== estadoFilter) return false;
      if (filterPatient && a.patient_id !== filterPatient.id) return false;
      return true;
    });
  }, [appointments, estadoFilter, filterPatient]);

  const openNewForm = (date?: Date, timeHHMM?: string, docId?: string) => {
    const d = date || currentDate;
    setFecha(dateToLocalInput(d));
    setHora(timeHHMM || "09:00");
    setDoctorId(docId);
    setDuracion("30");
    setNotas("");
    setEspecialidad("");
    setSelectedPatient(null);
    setSelected(null);
    setShowNew(true);
  };

  const createAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;
    setError("");

    const openMin = parseHHMM(openHHMM);
    const closeMin = parseHHMM(closeHHMM);
    const apptMin = localTimeToMinutes(hora);
    if (apptMin < openMin || apptMin >= closeMin) {
      setError(
        `La hora debe estar dentro del horario de atención (${formatMinutes12h(openMin)} – ${formatMinutes12h(closeMin)}). Configúralo en Configuración si necesitas otro rango.`
      );
      return;
    }

    try {
      await apiFetch("/api/appointments", {
        method: "POST",
        body: JSON.stringify({
          patient_id: selectedPatient.id,
          doctor_id: doctorId || null,
          fecha_hora: localDateTimeToISO(fecha, hora),
          duracion_minutos: parseInt(duracion),
          especialidad: especialidad || null,
          notas: notas || null,
        }),
      });
      setShowNew(false);
      setSelectedPatient(null);
      setFecha("");
      setHora("");
      setDuracion("30");
      setNotas("");
      setEspecialidad("");
      setDoctorId(undefined);
      loadAppointments();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const cancelAppointment = async (id: string) => {
    if (!confirm("¿Cancelar esta cita?")) return;
    try {
      await apiFetch(`/api/appointments/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ estado: "cancelada" }),
      });
      setSelected(null);
      loadAppointments();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const navigate = (delta: number) => {
    const d = new Date(currentDate);
    if (view === "month") d.setMonth(d.getMonth() + delta);
    else if (view === "week") d.setDate(d.getDate() + delta * 7);
    else d.setDate(d.getDate() + delta);
    setCurrentDate(d);
  };

  const periodLabel =
    view === "month"
      ? currentDate.toLocaleDateString("es-PE", { month: "long", year: "numeric" })
      : view === "week"
        ? `Semana del ${getWeekStart(currentDate).toLocaleDateString("es-PE")}`
        : currentDate.toLocaleDateString("es-PE", {
            weekday: "long",
            day: "numeric",
            month: "long",
          });

  const viewTabs: { id: ViewMode; label: string }[] = [
    { id: "month", label: "Mes" },
    { id: "week", label: "Semana" },
    { id: "day", label: "Día" },
    { id: "list", label: "Lista" },
  ];

  return (
    <PageContainer className="space-y-5">
      {error && (
        <div className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700 shadow-sm">
          {error}
        </div>
      )}

      <ModuleHeader
        crumbs={[
          { label: "Inicio", href: "/dashboard" },
          { label: "Agenda" },
        ]}
        title="Citas / Agenda"
        description="Planifique y gestione la agenda clínica con vista mes, semana, día o lista."
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="module-nav-btn"
              aria-label="Anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[10rem] rounded-lg border border-slate-200/80 bg-white/80 px-3 py-1.5 text-center text-sm font-semibold capitalize text-slate-800 shadow-sm">
              {periodLabel}
            </span>
            <button
              type="button"
              onClick={() => navigate(1)}
              className="module-nav-btn"
              aria-label="Siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setCurrentDate(new Date())}
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-700 transition-smooth hover:bg-brand-50"
            >
              Hoy
            </button>
          </div>
        }
        actions={
          <>
            <Button onClick={() => openNewForm()} icon={<Plus className="h-4 w-4" />}>
              Nueva cita
            </Button>
            <div className="module-seg" role="tablist" aria-label="Vista de agenda">
              {viewTabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={view === t.id}
                  onClick={() => setView(t.id)}
                  className={`module-seg__btn ${view === t.id ? "is-active" : ""}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </>
        }
      />

      {/* Filter bar — sticky en scrollport de main (misma regla que ficha tabs) */}
      <div className="app-main-sticky py-2" data-sticky-chrome="agenda-filters">
        <Card
          padding="sm"
          className="module-surface-muted flex flex-wrap items-end gap-3 !border-brand-100/70 !shadow-none"
        >
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Estado
          </span>
          <select
            value={estadoFilter}
            onChange={(e) => setEstadoFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
          >
            <option value="todos">Todos</option>
            <option value="programada">Programada</option>
            <option value="completada">Completada</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </label>
        <div className="block w-full min-w-0 flex-1 sm:min-w-[240px]">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Paciente
          </span>
          <PatientPicker
            value={filterPatient}
            onChange={setFilterPatient}
            label=""
            compact
            placeholder="Buscar: nombre, DNI o FC-00005…"
            inputClassName="border-slate-200"
          />
        </div>
        {(estadoFilter !== "todos" || filterPatient) && (
          <button
            type="button"
            onClick={() => {
              setEstadoFilter("todos");
              setFilterPatient(null);
            }}
            className="pb-2 text-xs font-semibold text-slate-500 transition-smooth hover:text-brand-600"
          >
            Limpiar filtros
          </button>
        )}
        </Card>
      </div>

      {/* New appointment form */}
      {showNew && (
        <Card className="module-surface border-brand-100/80">
          <form onSubmit={createAppointment} className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-section-title text-slate-800">Nueva cita</h2>
              <button
                type="button"
                onClick={() => setShowNew(false)}
                className="rounded-lg p-1.5 text-slate-400 transition-smooth hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <PatientPicker
              value={selectedPatient}
              onChange={setSelectedPatient}
              label="Paciente"
              required
              placeholder="Buscar: nombre, apellido, DNI o FC-00005…"
              autoFocus
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Input label="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
              <Input label="Hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} required step={1800} />
              <Input label="Duración (min)" type="number" value={duracion} onChange={(e) => setDuracion(e.target.value)} />
            </div>
            {doctors.length > 1 && (
              <label className="block">
                <span className="mb-1 block text-label text-slate-700">Doctor</span>
                <select
                  value={doctorId ?? ""}
                  onChange={(e) =>
                    setDoctorId(e.target.value || undefined)
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                >
                  <option value="">Asignar automáticamente</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nombre}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <SpecialtySelect
              value={especialidad}
              onChange={setEspecialidad}
              label="Especialidad"
            />
            <TreatmentAutocomplete
              label="Motivo / tratamiento"
              value={notas}
              onChange={setNotas}
              onSelect={(t) => {
                setNotas(t.nombre);
                if (!especialidad) setEspecialidad(t.especialidad);
              }}
              placeholder="Ej: control ortodoncia, limpieza…"
              hint="Opcional — predicción desde catálogo odontológico"
            />
            <div className="flex gap-3">
              <Button type="submit">Crear cita</Button>
              <Button type="button" variant="ghost" onClick={() => setShowNew(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Detail panel */}
      {selected && (
        <Card className="module-surface border-brand-200/80 bg-gradient-to-br from-brand-50/40 to-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-section-title text-slate-800">
                  {selected.patient_nombre || "Paciente"}
                </h2>
                <Badge variant={estadoBadgeVariant[selected.estado] || "info"}>
                  {selected.estado.charAt(0).toUpperCase() + selected.estado.slice(1)}
                </Badge>
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDateTime(selected.fecha_hora, {
                    weekday: "short",
                    year: undefined,
                  })}
                </span>
                <span>· {selected.duracion_minutos} min</span>
                {selected.doctor_nombre && <span>· {selected.doctor_nombre}</span>}
              </p>
              {selected.especialidad && (
                <p className="mt-1 text-sm font-medium text-slate-700">
                  {selected.especialidad}
                </p>
              )}
              {selected.notas && (
                <p className="mt-2 text-sm text-slate-500">{selected.notas}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded-lg p-1.5 text-slate-400 transition-smooth hover:bg-white hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <PacienteFichaLink patientId={selected.patient_id}>
              <Button variant="secondary" icon={<FileText className="h-3.5 w-3.5" />}>
                Ficha
              </Button>
            </PacienteFichaLink>
            {selected.estado === "programada" && (
              <Button variant="danger" onClick={() => cancelAppointment(selected.id)}>
                Cancelar cita
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* Views */}
      {loading ? (
        <div className="skeleton h-[28rem] rounded-card" />
      ) : view === "month" ? (
        <MonthGrid
          monthAnchor={currentDate}
          selectedDate={currentDate}
          appointments={filtered}
          onSelectDate={(d) => setCurrentDate(d)}
          onNavigateMonth={(delta) => {
            const d = new Date(currentDate);
            d.setMonth(d.getMonth() + delta);
            setCurrentDate(d);
          }}
          onAppointmentClick={setSelected}
          onCreateClick={() => openNewForm(currentDate)}
        />
      ) : view === "week" ? (
        <WeekGrid
          weekAnchor={currentDate}
          appointments={filtered}
          openHHMM={openHHMM}
          closeHHMM={closeHHMM}
          onSlotClick={(d, t) => openNewForm(d, t)}
          onAppointmentClick={setSelected}
        />
      ) : view === "day" ? (
        <DayGrid
          date={currentDate}
          appointments={filtered}
          doctors={doctors}
          openHHMM={openHHMM}
          closeHHMM={closeHHMM}
          onSlotClick={(d, t, docId) => openNewForm(d, t, docId)}
          onAppointmentClick={setSelected}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Calendar className="h-7 w-7" />}
          title="Sin citas en este período"
          description="Agenda una cita o cambia de vista / filtros."
          action={
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => openNewForm()}>
              Agendar cita
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => {
            const est = estadoBadgeVariant[a.estado] || "info";
            const initials = (a.patient_nombre || "?")
              .split(" ")
              .map((w) => w[0])
              .slice(0, 2)
              .join("")
              .toUpperCase();
            return (
              <Card
                key={a.id}
                padding="sm"
                className={`module-surface flex cursor-pointer flex-col gap-3 transition-smooth hover:-translate-y-0.5 hover:shadow-[0_14px_36px_-14px_rgba(28,102,232,0.22)] sm:flex-row sm:items-center sm:justify-between ${
                  a.estado === "cancelada" ? "opacity-60" : ""
                }`}
                onClick={() => setSelected(a)}
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-50 to-brand-100 text-sm font-semibold text-brand-700 ring-1 ring-brand-100">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-700">
                        {a.patient_nombre || "Paciente"}
                      </span>
                      <Badge variant={est}>
                        {a.estado.charAt(0).toUpperCase() + a.estado.slice(1)}
                      </Badge>
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-help text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTime(a.fecha_hora)}
                      </span>
                      <span>· {a.duracion_minutos} min</span>
                      {a.doctor_nombre && <span>· {a.doctor_nombre}</span>}
                    </p>
                  </div>
                </div>
                <div
                  className="flex shrink-0 items-center gap-2 self-end sm:self-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <PacienteFichaLink patientId={a.patient_id}>
                    <Button
                      variant="ghost"
                      icon={<FileText className="h-3.5 w-3.5" />}
                      className="text-xs"
                    >
                      Ficha
                    </Button>
                  </PacienteFichaLink>
                  {a.estado === "programada" && (
                    <Button
                      variant="danger"
                      onClick={() => cancelAppointment(a.id)}
                      className="text-xs"
                    >
                      Cancelar
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
