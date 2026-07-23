"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUp,
  Calendar,
  CalendarPlus,
  Cake,
  Check,
  Clock,
  Coins,
  CreditCard,
  FileText,
  LockOpen,
  MessageCircle,
  Plus,
  Stethoscope,
  UserPlus,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { formatTime } from "@/lib/datetime";
import { canAccessModule } from "@/lib/roles";
import { openWhatsAppText, isValidPhone } from "@/lib/whatsapp";
import { PageContainer } from "@/components/ui";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import {
  moneyPE,
  type DashboardHome,
  type DashboardReminder,
} from "@/components/dashboard/types";

function greetingForHour(h: number): string {
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

function estadoPill(estado: string): { cls: string; label: string } {
  const e = (estado || "").toLowerCase();
  if (e === "completada") {
    return { cls: "bg-success-50 text-success-600", label: "Completada" };
  }
  if (e === "cancelada") {
    return { cls: "bg-danger-50 text-danger-600", label: "Cancelada" };
  }
  return { cls: "bg-brand-50 text-brand-600", label: "Programada" };
}

function progressTone(i: number): string {
  const tones = ["bg-brand-500", "bg-success-500", "bg-warning-500"];
  return tones[i % tones.length];
}

function progressTextTone(i: number): string {
  const tones = ["text-brand-600", "text-success-600", "text-warning-600"];
  return tones[i % tones.length];
}

function activityIcon(type: string) {
  if (type === "cita_completada") {
    return (
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-success-100 text-success-600">
        <Check className="h-4 w-4" />
      </span>
    );
  }
  if (type === "nuevo_paciente") {
    return (
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-brand-600">
        <UserPlus className="h-4 w-4" />
      </span>
    );
  }
  if (type === "cobro") {
    return (
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-warning-100 text-warning-600">
        <FileText className="h-4 w-4" />
      </span>
    );
  }
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-info-100 text-info-600">
      <Stethoscope className="h-4 w-4" />
    </span>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardHome | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sendingId, setSendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const home = await apiFetch<DashboardHome>("/api/dashboard/home");
      setData(home);
      setError("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const markReminderSent = async (id: string) => {
    try {
      await apiFetch(`/api/appointments/reminders/${id}/send`, { method: "POST" });
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo marcar el recordatorio");
    }
  };

  const sendReminderWa = async (r: DashboardReminder) => {
    setSendingId(r.id);
    try {
      if (r.patient_telefono && isValidPhone(r.patient_telefono)) {
        openWhatsAppText(r.patient_telefono, r.mensaje_sugerido || "");
      }
      await markReminderSent(r.id);
    } finally {
      setSendingId(null);
    }
  };

  const firstName = user?.nombre?.split(" ")[0] || "Usuario";
  const now = new Date();
  const dateLabel = now.toLocaleDateString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const canCaja = canAccessModule(user?.rol, "caja");
  const canAgenda = canAccessModule(user?.rol, "agenda");
  const canPacientes = canAccessModule(user?.rol, "pacientes");
  const canReportes = canAccessModule(user?.rol, "reportes");

  if (loading) {
    return (
      <PageContainer width="full" className="space-y-6">
        <div className="skeleton h-16 w-full max-w-xl rounded-2xl" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-36 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="skeleton h-[28rem] rounded-2xl xl:col-span-2" />
          <div className="skeleton h-[28rem] rounded-2xl" />
        </div>
      </PageContainer>
    );
  }

  if (!data) {
    return (
      <PageContainer>
        <div className="rounded-2xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-600">
          {error || "Sin datos del dashboard"}
        </div>
      </PageContainer>
    );
  }

  const { cash, kpis, citas_hoy, reminders, deudas, tratamientos_activos } = data;
  const ingresosPct = cash.open
    ? Math.min(
        100,
        Math.round(
          (cash.ingresos_hoy / Math.max(cash.ingresos_hoy || 1, cash.monto_inicial || 500)) *
            100
        )
      )
    : 0;

  return (
    <PageContainer width="full" className="!space-y-6 pb-8">
      {error && (
        <div className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-600">
          {error}
        </div>
      )}

      <div className="dash-fade-in flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">
            {greetingForHour(now.getHours())}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Hoy es{" "}
            <span className="font-semibold capitalize text-slate-700">{dateLabel}</span>. Tienes{" "}
            <span className="font-semibold text-brand-600">
              {kpis.citas_hoy} {kpis.citas_hoy === 1 ? "cita" : "citas"}
            </span>{" "}
            programadas y la caja{" "}
            {cash.open ? (
              <span className="font-semibold text-success-600">está abierta</span>
            ) : (
              <span className="font-semibold text-warning-600">aún no está abierta</span>
            )}
            .
          </p>
        </div>
        {canCaja && (
          <div className="flex flex-wrap items-center gap-3">
            <div
              className={`flex items-center gap-2 rounded-xl border px-4 py-2 ${
                cash.open
                  ? "border-success-200 bg-success-50"
                  : "border-warning-200 bg-warning-50"
              }`}
            >
              {cash.open ? (
                <Check className="h-4 w-4 text-success-600" />
              ) : (
                <Clock className="h-4 w-4 text-warning-500" />
              )}
              <span
                className={`text-sm font-medium ${
                  cash.open ? "text-success-700" : "text-warning-700"
                }`}
              >
                {cash.open ? "Caja abierta" : "Caja cerrada"}
              </span>
            </div>
            <Link
              href="/caja"
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-200 transition-colors hover:bg-brand-700"
            >
              <LockOpen className="h-3.5 w-3.5" />
              {cash.open ? "Ir a Caja" : "Abrir Caja"}
            </Link>
          </div>
        )}
      </div>

      <div className="dash-slide-up grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href={canCaja ? "/caja" : "/dashboard"}
          className="dash-kpi dash-kpi-brand dash-card-hover rounded-2xl bg-white p-5 shadow-card"
        >
          <div className="relative z-[1] flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Ingresos Hoy
              </p>
              <h3 className="mt-1 text-2xl font-bold text-slate-800">
                {moneyPE(kpis.ingresos_hoy)}
              </h3>
              <p className="mt-2 text-xs text-slate-400">
                {cash.open ? `Saldo sesión ${moneyPE(cash.saldo)}` : "Caja sin abrir"}
              </p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50">
              <Coins className="h-5 w-5 text-brand-600" />
            </div>
          </div>
          <div className="relative z-[1] mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="dash-progress-fill h-full rounded-full bg-brand-500"
              style={{ width: `${ingresosPct}%` }}
            />
          </div>
        </Link>

        <Link
          href={canAgenda ? "/agenda" : "/dashboard"}
          className="dash-kpi dash-kpi-success dash-card-hover rounded-2xl bg-white p-5 shadow-card"
        >
          <div className="relative z-[1] flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Citas Hoy
              </p>
              <h3 className="mt-1 text-2xl font-bold text-slate-800">{kpis.citas_hoy}</h3>
              <div className="mt-2 flex items-center gap-1">
                {kpis.citas_delta_vs_ayer >= 0 ? (
                  <>
                    <ArrowUp className="h-3 w-3 text-success-500" />
                    <span className="text-xs font-medium text-success-600">
                      +{kpis.citas_delta_vs_ayer} vs ayer
                    </span>
                  </>
                ) : (
                  <span className="text-xs font-medium text-slate-500">
                    {kpis.citas_delta_vs_ayer} vs ayer
                  </span>
                )}
              </div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-success-50">
              <Calendar className="h-5 w-5 text-success-600" />
            </div>
          </div>
          <div className="relative z-[1] mt-4 flex gap-1">
            <div className="h-1.5 flex-1 rounded-full bg-success-500" />
            <div
              className={`h-1.5 flex-1 rounded-full ${
                kpis.citas_pendientes > 0 ? "bg-success-200" : "bg-slate-100"
              }`}
            />
            <div className="h-1.5 flex-1 rounded-full bg-slate-100" />
          </div>
        </Link>

        <Link
          href={canPacientes ? "/pacientes" : "/dashboard"}
          className="dash-kpi dash-kpi-info dash-card-hover rounded-2xl bg-white p-5 shadow-card"
        >
          <div className="relative z-[1] flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Pacientes Nuevos
              </p>
              <h3 className="mt-1 text-2xl font-bold text-slate-800">
                {kpis.pacientes_nuevos_mes}
              </h3>
              <div className="mt-2 flex items-center gap-1">
                {kpis.pacientes_nuevos_delta >= 0 ? (
                  <>
                    <ArrowUp className="h-3 w-3 text-success-500" />
                    <span className="text-xs font-medium text-success-600">
                      +{kpis.pacientes_nuevos_delta} este mes
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-slate-400">vs mes anterior</span>
                )}
              </div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-info-50">
              <UserPlus className="h-5 w-5 text-info-600" />
            </div>
          </div>
          <div className="relative z-[1] mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="dash-progress-fill h-full rounded-full bg-info-500"
              style={{ width: `${Math.min(100, kpis.pacientes_nuevos_mes * 8)}%` }}
            />
          </div>
        </Link>

        <Link
          href={canPacientes ? "/pacientes" : "/dashboard"}
          className="dash-kpi dash-kpi-danger dash-card-hover rounded-2xl bg-white p-5 shadow-card"
        >
          <div className="relative z-[1] flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Deuda Pendiente
              </p>
              <h3 className="mt-1 text-2xl font-bold text-slate-800">
                {moneyPE(kpis.deuda_total)}
              </h3>
              <p className="mt-2 text-xs text-slate-400">
                {kpis.deuda_pacientes}{" "}
                {kpis.deuda_pacientes === 1 ? "paciente" : "pacientes"} con saldo
              </p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-danger-50">
              <CreditCard className="h-5 w-5 text-danger-600" />
            </div>
          </div>
          <div className="relative z-[1] mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="dash-progress-fill h-full rounded-full bg-danger-500"
              style={{ width: `${Math.min(100, kpis.deuda_pacientes * 10 || 0)}%` }}
            />
          </div>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <div className="rounded-2xl bg-white p-5 shadow-card">
            <h3 className="mb-4 text-sm font-bold text-slate-700">Acciones Rápidas</h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {canPacientes && (
                <Link
                  href="/pacientes/nuevo"
                  className="group flex flex-col items-center gap-2 rounded-xl border border-brand-100 bg-brand-50 p-4 transition-all hover:bg-brand-100"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600 text-white transition-transform group-hover:scale-110">
                    <UserPlus className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-semibold text-brand-700">Nuevo Paciente</span>
                </Link>
              )}
              {canAgenda && (
                <Link
                  href="/agenda?nueva=1"
                  className="group flex flex-col items-center gap-2 rounded-xl border border-success-100 bg-success-50 p-4 transition-all hover:bg-success-100"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success-600 text-white transition-transform group-hover:scale-110">
                    <CalendarPlus className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-semibold text-success-700">Agendar Cita</span>
                </Link>
              )}
              {canCaja && (
                <Link
                  href="/caja"
                  className="group flex flex-col items-center gap-2 rounded-xl border border-warning-100 bg-warning-50 p-4 transition-all hover:bg-warning-100"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning-500 text-white transition-transform group-hover:scale-110">
                    <Wallet className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-semibold text-warning-700">
                    {cash.open ? "Ir a Caja" : "Abrir Caja"}
                  </span>
                </Link>
              )}
              {canPacientes && (
                <Link
                  href="/pacientes"
                  className="group flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 transition-all hover:bg-slate-100"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-600 text-white transition-transform group-hover:scale-110">
                    <FileText className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-semibold text-slate-600">Ver Fichas</span>
                </Link>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl bg-white shadow-card">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div>
                <h3 className="text-base font-bold text-slate-800">Agenda del Día</h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  {kpis.citas_hoy} programadas · {kpis.citas_completadas} completada
                  {kpis.citas_completadas === 1 ? "" : "s"} · {kpis.citas_pendientes} pendiente
                  {kpis.citas_pendientes === 1 ? "" : "s"}
                </p>
              </div>
              {canAgenda && (
                <Link
                  href="/agenda"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700"
                >
                  Ver agenda completa <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>

            {citas_hoy.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <Calendar className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-3 text-sm font-medium text-slate-500">Sin citas para hoy</p>
                {canAgenda && (
                  <Link
                    href="/agenda?nueva=1"
                    className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600"
                  >
                    <Plus className="h-4 w-4" /> Agendar nueva cita
                  </Link>
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {citas_hoy.map((a) => {
                  const pill = estadoPill(a.estado);
                  const time = a.fecha_hora ? formatTime(a.fecha_hora) : "—";
                  const detail = [
                    a.especialidad || a.notas || "Consulta",
                    a.doctor_nombre !== "—" ? a.doctor_nombre : null,
                    `${a.duracion_minutos} min`,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <div key={a.id} className="dash-appt flex items-center gap-4 p-4">
                      <div className="flex min-w-[3.75rem] flex-col items-center">
                        <span
                          className={`text-lg font-bold ${
                            a.estado === "completada" ? "text-slate-700" : "text-brand-600"
                          }`}
                        >
                          {time.replace(/\s*(a\.?\s*m\.?|p\.?\s*m\.?)/i, "").trim() || time}
                        </span>
                        <span className="text-[0.65rem] uppercase text-slate-400">
                          {/p\.?\s*m\.?/i.test(time) ? "PM" : "AM"}
                        </span>
                      </div>
                      <div className="h-10 w-px bg-slate-200" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="truncate text-sm font-semibold text-slate-700">
                            {a.patient_nombre}
                          </h4>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${pill.cls}`}
                          >
                            {pill.label}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">{detail}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Link
                          href={`/pacientes/${a.patient_id}`}
                          title="Ver ficha"
                          className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-brand-600"
                        >
                          <FileText className="h-4 w-4" />
                        </Link>
                        {a.patient_telefono && isValidPhone(a.patient_telefono) && (
                          <button
                            type="button"
                            title="WhatsApp"
                            onClick={() =>
                              openWhatsAppText(
                                a.patient_telefono!,
                                `Hola ${a.patient_nombre.split(" ")[0]}, le escribimos de la clínica.`
                              )
                            }
                            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-success-600"
                          >
                            <MessageCircle className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {canAgenda && citas_hoy.length > 0 && (
              <div className="border-t border-slate-100 bg-slate-50 p-3 text-center">
                <Link
                  href="/agenda?nueva=1"
                  className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
                >
                  <Plus className="h-3.5 w-3.5" /> Agendar nueva cita
                </Link>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="rounded-2xl bg-white p-5 shadow-card lg:col-span-3">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-800">Tendencia de Ingresos</h3>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Últimos 7 días · Comparativa con semana anterior
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    <span className="h-2 w-2 rounded-full bg-brand-500" /> Esta semana
                  </span>
                  <span className="flex items-center gap-1 text-xs text-slate-400">
                    <span className="h-2 w-2 rounded-full bg-slate-300" /> Semana pasada
                  </span>
                </div>
              </div>
              <RevenueChart
                labels={data.revenue_chart.labels}
                thisWeek={data.revenue_chart.this_week}
                lastWeek={data.revenue_chart.last_week}
              />
            </div>

            <div className="flex flex-col gap-6 lg:col-span-2">
              <div className="flex-1 rounded-2xl bg-white p-5 shadow-card">
                <h3 className="text-base font-bold text-slate-800">Especialidades</h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  Pacientes por especialidad de atención
                </p>
                {data.especialidades.length === 0 ? (
                  <p className="mt-6 text-sm text-slate-400">
                    Aún no hay especialidades asignadas en fichas.
                  </p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {data.especialidades.map((esp) => (
                      <li key={esp.nombre}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="truncate font-medium text-slate-700">{esp.nombre}</span>
                          <span className="ml-2 shrink-0 text-xs font-semibold text-brand-600">
                            {esp.count}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="dash-progress-fill h-full rounded-full bg-brand-500"
                            style={{ width: `${esp.pct}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-2xl bg-white p-5 shadow-card">
                <div className="mb-3 flex items-center gap-2">
                  <Cake className="h-4 w-4 text-brand-600" />
                  <h3 className="text-base font-bold text-slate-800">Cumpleaños</h3>
                </div>
                <p className="text-xs text-slate-400">Próximos 14 días</p>
                {data.cumpleanos.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-400">Sin cumpleaños próximos</p>
                ) : (
                  <ul className="mt-3 divide-y divide-slate-50">
                    {data.cumpleanos.map((c) => (
                      <li key={c.patient_id}>
                        <Link
                          href={`/pacientes/${c.patient_id}`}
                          className="flex items-center gap-3 py-2.5 transition-colors hover:bg-slate-50"
                        >
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                            {c.initials}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-700">
                              {c.patient_nombre}
                            </p>
                            <p className="text-xs text-slate-400">
                              {c.dias === 0
                                ? "Hoy"
                                : c.dias === 1
                                  ? "Mañana"
                                  : `En ${c.dias} días`}{" "}
                              · {c.ficha}
                            </p>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="overflow-hidden rounded-2xl bg-white shadow-card">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-800">Recordatorios</h3>
                {reminders.length > 0 && (
                  <span className="rounded-full bg-danger-50 px-2 py-0.5 text-[0.7rem] font-semibold text-danger-600">
                    {reminders.length} pendiente{reminders.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            </div>
            <div className="space-y-3 p-4">
              {reminders.length === 0 ? (
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-center">
                  <Check className="mx-auto h-6 w-6 text-success-500" />
                  <p className="mt-2 text-sm text-slate-500">Sin recordatorios pendientes</p>
                </div>
              ) : (
                reminders.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-start gap-3 rounded-xl border border-warning-100 bg-warning-50 p-3"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning-100">
                      <Clock className="h-4 w-4 text-warning-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-700">{r.patient_nombre}</p>
                      <p className="text-xs text-slate-500">
                        {r.appointment_fecha
                          ? `Cita ${formatTime(r.appointment_fecha)}`
                          : "Cita"}
                        {r.especialidad ? ` · ${r.especialidad}` : ""}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={sendingId === r.id}
                          onClick={() => void sendReminderWa(r)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50"
                        >
                          <MessageCircle className="h-3.5 w-3.5" /> Enviar WA
                        </button>
                        <button
                          type="button"
                          onClick={() => void markReminderSent(r.id)}
                          className="text-xs text-slate-400 hover:text-slate-600"
                        >
                          Marcar enviado
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl bg-white shadow-card">
            <div className="border-b border-slate-100 p-5">
              <h3 className="text-base font-bold text-slate-800">Deudas Pendientes</h3>
              <p className="mt-0.5 text-xs text-slate-400">
                {kpis.deuda_pacientes}{" "}
                {kpis.deuda_pacientes === 1 ? "paciente" : "pacientes"} con saldo por cobrar
              </p>
            </div>
            {deudas.length === 0 ? (
              <p className="p-5 text-sm text-slate-400">No hay saldos pendientes</p>
            ) : (
              <>
                <div className="divide-y divide-slate-50">
                  {deudas.map((d) => (
                    <Link
                      key={d.patient_id}
                      href={`/pacientes/${d.patient_id}`}
                      className="flex items-center justify-between p-4 transition-colors hover:bg-slate-50"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger-100 text-xs font-bold text-danger-600">
                          {d.initials}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-700">
                            {d.patient_nombre}
                          </p>
                          <p className="truncate text-xs text-slate-400">
                            {d.ficha} · {d.concepto}
                          </p>
                        </div>
                      </div>
                      <span className="ml-3 shrink-0 text-sm font-bold text-danger-600">
                        {moneyPE(d.saldo)}
                      </span>
                    </Link>
                  ))}
                </div>
                {canPacientes && (
                  <div className="border-t border-slate-100 p-3 text-center">
                    <Link
                      href="/pacientes"
                      className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
                    >
                      Ver todas las deudas <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="overflow-hidden rounded-2xl bg-white shadow-card">
            <div className="border-b border-slate-100 p-5">
              <h3 className="text-base font-bold text-slate-800">Tratamientos Activos</h3>
              <p className="mt-0.5 text-xs text-slate-400">
                {tratamientos_activos.length} en progreso
              </p>
            </div>
            <div className="space-y-4 p-4">
              {tratamientos_activos.length === 0 ? (
                <p className="text-sm text-slate-400">Sin tratamientos activos con saldo</p>
              ) : (
                tratamientos_activos.map((t, i) => (
                  <Link
                    key={`${t.patient_id}-${i}`}
                    href={`/pacientes/${t.patient_id}`}
                    className="block"
                  >
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="truncate text-sm font-medium text-slate-700">{t.label}</span>
                      <span className={`ml-2 shrink-0 text-xs font-semibold ${progressTextTone(i)}`}>
                        {t.progress_pct}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`dash-progress-fill h-full rounded-full ${progressTone(i)}`}
                        style={{ width: `${t.progress_pct}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      Saldo {moneyPE(t.saldo)} de {moneyPE(t.costo)}
                    </p>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-700 p-5 text-white shadow-lg shadow-brand-200">
            <h3 className="mb-3 text-sm font-bold">Resumen Semanal</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-2xl font-bold">{data.resumen_semanal.citas_atendidas}</p>
                <p className="text-xs text-brand-100">Citas atendidas</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{moneyPE(data.resumen_semanal.ingresos)}</p>
                <p className="text-xs text-brand-100">Ingresos totales</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{data.resumen_semanal.nuevos_pacientes}</p>
                <p className="text-xs text-brand-100">Nuevos pacientes</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{data.resumen_semanal.tratamientos}</p>
                <p className="text-xs text-brand-100">Tratamientos</p>
              </div>
            </div>
            {canReportes && (
              <Link
                href="/reportes"
                className="mt-4 block w-full rounded-xl bg-white/10 py-2 text-center text-sm font-medium transition-colors hover:bg-white/20"
              >
                Ver reporte detallado
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-card">
        <div className="flex items-center justify-between border-b border-slate-100 p-5">
          <div>
            <h3 className="text-base font-bold text-slate-800">Actividad Reciente</h3>
            <p className="mt-0.5 text-xs text-slate-400">
              Últimas acciones realizadas en el sistema
            </p>
          </div>
          {canReportes && (
            <Link
              href="/reportes"
              className="text-sm font-semibold text-brand-600 hover:text-brand-700"
            >
              Ver todo
            </Link>
          )}
        </div>
        {data.actividad.length === 0 ? (
          <p className="p-6 text-sm text-slate-400">Aún no hay actividad registrada</p>
        ) : (
          <div className="divide-y divide-slate-50">
            {data.actividad.map((a, idx) => (
              <Link
                key={`${a.type}-${idx}-${a.at}`}
                href={a.href}
                className="flex items-center gap-4 p-4 transition-colors hover:bg-slate-50"
              >
                {activityIcon(a.type)}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-700">
                    <span className="font-semibold">{a.title}</span>
                    {a.detail ? ` · ${a.detail}` : ""}
                  </p>
                  <p className="text-xs text-slate-400">{a.relative}</p>
                </div>
                {a.amount != null && a.amount > 0 && (
                  <span
                    className={`shrink-0 text-sm font-semibold ${
                      a.type === "cita_completada" || a.type === "cobro"
                        ? "text-success-600"
                        : "text-slate-700"
                    }`}
                  >
                    {moneyPE(a.amount)}
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
