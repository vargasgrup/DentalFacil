"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
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
import { PacienteFichaLink } from "@/components/PacienteFichaLink";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import {
  moneyPE,
  type DashboardHome,
  type DashboardReminder,
} from "@/components/dashboard/types";
import { useAppRefresh } from "@/hooks/useAppRefresh";

function greetingForHour(h: number): string {
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

/** Superficie unificada del dashboard (border + sombra suave) */
const PANEL =
  "rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.08)]";
const PANEL_PAD = "p-4 sm:p-5";

type KpiTone = "brand" | "success" | "info" | "danger";

const KPI_TONE: Record<KpiTone, { card: string; bar: string }> = {
  brand: { card: "dash-kpi-brand", bar: "bg-brand-500" },
  success: { card: "dash-kpi-success", bar: "bg-success-500" },
  info: { card: "dash-kpi-info", bar: "bg-info-500" },
  danger: { card: "dash-kpi-danger", bar: "bg-danger-500" },
};

function KpiCard({
  href,
  label,
  value,
  meta,
  icon,
  tone,
  progress,
}: {
  href: string;
  label: string;
  value: string;
  meta: ReactNode;
  icon: ReactNode;
  tone: KpiTone;
  progress: number;
}) {
  const t = KPI_TONE[tone];
  const pct = Math.max(0, Math.min(100, Math.round(progress)));
  return (
    <Link
      href={href}
      className={`dash-kpi ${t.card} dash-card-hover flex h-full min-h-[7.5rem] flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.08)] sm:p-5`}
    >
      <div className="relative z-[1] flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            {label}
          </p>
          <p className="mt-1.5 text-2xl font-bold leading-none tracking-tight tabular-nums text-slate-900 sm:text-[1.65rem]">
            {value}
          </p>
        </div>
        <div className="dash-kpi-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
          {icon}
        </div>
      </div>
      <div className="relative z-[1] mt-3">
        <div className="mb-2 min-h-[1rem] text-xs leading-snug text-slate-500">
          {meta}
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`dash-progress-fill h-full rounded-full ${t.bar}`}
            style={{ width: `${pct}%` }}
            aria-hidden
          />
        </div>
      </div>
    </Link>
  );
}

function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight text-slate-900">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-0.5 text-xs leading-snug text-slate-500">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function EmptyLine({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-3 py-4">
      <div className="min-w-0 flex-1 text-sm text-slate-500">{children}</div>
    </div>
  );
}

function estadoPill(estado: string): { cls: string; label: string } {
  const e = (estado || "").toLowerCase();
  if (e === "completada") {
    return { cls: "bg-success-50 text-success-700", label: "Completada" };
  }
  if (e === "cancelada") {
    return { cls: "bg-danger-50 text-danger-700", label: "Cancelada" };
  }
  return { cls: "bg-brand-50 text-brand-700", label: "Programada" };
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
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-success-50 text-success-600">
        <Check className="h-4 w-4" />
      </span>
    );
  }
  if (type === "nuevo_paciente") {
    return (
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
        <UserPlus className="h-4 w-4" />
      </span>
    );
  }
  if (type === "cobro") {
    return (
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning-50 text-warning-600">
        <FileText className="h-4 w-4" />
      </span>
    );
  }
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
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

  const load = useCallback(async (_opts?: { soft?: boolean }) => {
    try {
      const home = await apiFetch<DashboardHome>("/api/dashboard/home");
      setData(home);
      setError("");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "No se pudo cargar el dashboard"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useAppRefresh(() => {
    void load({ soft: true });
  });

  useEffect(() => {
    const onReconnect = () => {
      void load({ soft: true });
    };
    const onRealtime = (ev: Event) => {
      const detail = (ev as CustomEvent<{ type?: string }>).detail;
      const t = detail?.type || "";
      if (
        t.startsWith("appointment") ||
        t.startsWith("caja") ||
        t.startsWith("patient") ||
        t.startsWith("clinical") ||
        t === "dashboard.invalidate"
      ) {
        void load({ soft: true });
      }
    };
    window.addEventListener("nk:realtime-reconnect", onReconnect);
    window.addEventListener("nk:realtime", onRealtime);
    return () => {
      window.removeEventListener("nk:realtime-reconnect", onReconnect);
      window.removeEventListener("nk:realtime", onRealtime);
    };
  }, [load]);

  const markReminderSent = async (id: string) => {
    try {
      await apiFetch(`/api/appointments/reminders/${id}/send`, {
        method: "POST",
      });
      await load();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo marcar el recordatorio"
      );
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
  const canCaja = canAccessModule(user, "caja");
  const canAgenda = canAccessModule(user, "agenda");
  const canPacientes = canAccessModule(user, "pacientes");
  const canReportes = canAccessModule(user, "reportes");

  if (loading) {
    return (
      <PageContainer width="full" className="!space-y-5 pb-8">
        <div className="skeleton h-24 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-[7.5rem] rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="skeleton h-80 rounded-xl lg:col-span-8" />
          <div className="skeleton h-80 rounded-xl lg:col-span-4" />
        </div>
      </PageContainer>
    );
  }

  if (!data) {
    return (
      <PageContainer>
        <div className="rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-600">
          {error || "Sin datos del dashboard"}
        </div>
      </PageContainer>
    );
  }

  const { cash, kpis, citas_hoy, reminders, deudas, tratamientos_activos } =
    data;

  const quickActions = [
    canPacientes && {
      href: "/pacientes/nuevo",
      label: "Nuevo paciente",
      icon: UserPlus,
      tone: "brand" as const,
    },
    canAgenda && {
      href: "/agenda?nueva=1",
      label: "Agendar cita",
      icon: CalendarPlus,
      tone: "success" as const,
    },
    canCaja && {
      href: "/caja",
      label: cash.open ? "Ir a caja" : "Abrir caja",
      icon: Wallet,
      tone: "warning" as const,
    },
    canPacientes && {
      href: "/pacientes",
      label: "Ver fichas",
      icon: FileText,
      tone: "slate" as const,
    },
  ].filter(Boolean) as {
    href: string;
    label: string;
    icon: typeof UserPlus;
    tone: "brand" | "success" | "warning" | "slate";
  }[];

  const actionTone: Record<
    string,
    { wrap: string; icon: string; text: string }
  > = {
    brand: {
      wrap: "border-brand-100 bg-brand-50/70 hover:bg-brand-50",
      icon: "bg-brand-600 text-white",
      text: "text-brand-800",
    },
    success: {
      wrap: "border-success-100 bg-success-50/70 hover:bg-success-50",
      icon: "bg-success-600 text-white",
      text: "text-success-800",
    },
    warning: {
      wrap: "border-warning-100 bg-warning-50/80 hover:bg-warning-50",
      icon: "bg-warning-500 text-white",
      text: "text-warning-900",
    },
    slate: {
      wrap: "border-slate-200 bg-slate-50/80 hover:bg-slate-100",
      icon: "bg-slate-700 text-white",
      text: "text-slate-700",
    },
  };

  return (
    <PageContainer width="full" className="dash-fade-in !space-y-5 pb-8">
      {error && (
        <div className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-600">
          {error}
        </div>
      )}

      {/* ── Hero operativo (saludo + estado caja alineados) ───────── */}
      <section
        className={`${PANEL} ${PANEL_PAD}`}
        aria-label="Resumen del día"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500">Inicio</p>
            <h1 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              {greetingForHour(now.getHours())}, {firstName}
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-500">
              <span className="capitalize text-slate-600">{dateLabel}</span>
              {" · "}
              <span className="font-medium text-brand-700">
                {kpis.citas_hoy}{" "}
                {kpis.citas_hoy === 1 ? "cita" : "citas"}
              </span>{" "}
              hoy
              {canCaja ? (
                <>
                  {" · Caja "}
                  {cash.open ? (
                    <span className="font-medium text-success-700">abierta</span>
                  ) : (
                    <span className="font-medium text-warning-700">
                      sin abrir
                    </span>
                  )}
                </>
              ) : null}
            </p>
          </div>

          {canCaja ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <div
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
                  cash.open
                    ? "border-success-200 bg-success-50 text-success-800"
                    : "border-warning-200 bg-warning-50 text-warning-800"
                }`}
              >
                {cash.open ? (
                  <Check className="h-4 w-4 shrink-0" aria-hidden />
                ) : (
                  <Clock className="h-4 w-4 shrink-0" aria-hidden />
                )}
                {cash.open ? "Caja abierta" : "Caja cerrada"}
              </div>
              <Link
                href="/caja"
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
              >
                <LockOpen className="h-3.5 w-3.5" aria-hidden />
                {cash.open ? "Ir a Caja" : "Abrir Caja"}
              </Link>
            </div>
          ) : null}
        </div>

        {quickActions.length > 0 ? (
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4 sm:grid-cols-4">
            {quickActions.map((a) => {
              const Icon = a.icon;
              const tone = actionTone[a.tone];
              return (
                <Link
                  key={a.href + a.label}
                  href={a.href}
                  className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors ${tone.wrap}`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${tone.icon}`}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className={`text-xs font-semibold sm:text-[13px] ${tone.text}`}>
                    {a.label}
                  </span>
                </Link>
              );
            })}
          </div>
        ) : null}
      </section>

      {/* ── KPIs alineados ─────────────────────────────────────────── */}
      <section
        className="dash-slide-up grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4"
        aria-label="Indicadores del día"
      >
        <KpiCard
          href={canCaja ? "/caja" : "/dashboard"}
          label="Ingresos hoy"
          value={moneyPE(kpis.ingresos_hoy)}
          meta={
            cash.open
              ? `Saldo sesión ${moneyPE(cash.saldo)}`
              : "Caja sin abrir"
          }
          icon={<Coins className="h-5 w-5" />}
          tone="success"
          progress={
            cash.open
              ? Math.min(
                  100,
                  Math.round(
                    (cash.ingresos_hoy /
                      Math.max(
                        cash.ingresos_hoy || 1,
                        cash.monto_inicial || 100
                      )) *
                      100
                  )
                )
              : 0
          }
        />
        <KpiCard
          href={canAgenda ? "/agenda" : "/dashboard"}
          label="Citas hoy"
          value={String(kpis.citas_hoy)}
          meta={
            kpis.citas_delta_vs_ayer >= 0
              ? `+${kpis.citas_delta_vs_ayer} vs ayer`
              : `${kpis.citas_delta_vs_ayer} vs ayer`
          }
          icon={<Calendar className="h-5 w-5" />}
          tone="brand"
          progress={
            kpis.citas_hoy <= 0
              ? 0
              : Math.min(
                  100,
                  Math.round(
                    ((kpis.citas_completadas || 0) /
                      Math.max(kpis.citas_hoy, 1)) *
                      100
                  ) || Math.min(100, kpis.citas_hoy * 25)
                )
          }
        />
        <KpiCard
          href={canPacientes ? "/pacientes" : "/dashboard"}
          label="Pacientes nuevos"
          value={String(kpis.pacientes_nuevos_mes)}
          meta={
            kpis.pacientes_nuevos_delta >= 0
              ? `+${kpis.pacientes_nuevos_delta} este mes`
              : "vs mes anterior"
          }
          icon={<UserPlus className="h-5 w-5" />}
          tone="info"
          progress={Math.min(100, kpis.pacientes_nuevos_mes * 8)}
        />
        <KpiCard
          href={canPacientes ? "/pacientes" : "/dashboard"}
          label="Deuda pendiente"
          value={moneyPE(kpis.deuda_total)}
          meta={`${kpis.deuda_pacientes} ${
            kpis.deuda_pacientes === 1 ? "paciente" : "pacientes"
          } con saldo`}
          icon={<CreditCard className="h-5 w-5" />}
          tone="danger"
          progress={Math.min(100, kpis.deuda_pacientes * 12)}
        />
      </section>

      {/* ── Cuerpo 12-col: trabajo (8) + rail operativo (4) ───────── */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12 lg:gap-5">
        {/* Columna principal */}
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-8">
          {/* Agenda del día — pieza hero */}
          <section className={`${PANEL} overflow-hidden`}>
            <div
              className={`flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 ${PANEL_PAD}`}
            >
              <SectionTitle
                title="Agenda del día"
                subtitle={`${kpis.citas_hoy} programadas · ${kpis.citas_completadas} completada${
                  kpis.citas_completadas === 1 ? "" : "s"
                } · ${kpis.citas_pendientes} pendiente${
                  kpis.citas_pendientes === 1 ? "" : "s"
                }`}
              />
              {canAgenda ? (
                <Link
                  href="/agenda"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700"
                >
                  Ver agenda <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              ) : null}
            </div>

            {citas_hoy.length === 0 ? (
              <div className={`${PANEL_PAD} py-8 sm:py-10`}>
                <EmptyLine>
                  <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="inline-flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-slate-400" />
                      Sin citas para hoy
                    </span>
                    {canAgenda ? (
                      <Link
                        href="/agenda?nueva=1"
                        className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600"
                      >
                        <Plus className="h-4 w-4" /> Agendar cita
                      </Link>
                    ) : null}
                  </div>
                </EmptyLine>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
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
                    <div
                      key={a.id}
                      className="dash-appt flex items-center gap-3 px-4 py-3 sm:gap-4 sm:px-5"
                    >
                      <div className="flex w-14 shrink-0 flex-col items-center sm:w-16">
                        <span
                          className={`text-base font-bold tabular-nums sm:text-lg ${
                            a.estado === "completada"
                              ? "text-slate-700"
                              : "text-brand-600"
                          }`}
                        >
                          {time
                            .replace(/\s*(a\.?\s*m\.?|p\.?\s*m\.?)/i, "")
                            .trim() || time}
                        </span>
                        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                          {/p\.?\s*m\.?/i.test(time) ? "PM" : "AM"}
                        </span>
                      </div>
                      <div className="hidden h-9 w-px bg-slate-200 sm:block" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm font-semibold text-slate-800">
                            {a.patient_nombre}
                          </h3>
                          <span
                            className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${pill.cls}`}
                          >
                            {pill.label}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {detail}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <PacienteFichaLink
                          patientId={a.patient_id}
                          title="Ver ficha"
                          className="rounded-md p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-brand-600"
                        >
                          <FileText className="h-4 w-4" />
                        </PacienteFichaLink>
                        {a.patient_telefono &&
                          isValidPhone(a.patient_telefono) && (
                            <button
                              type="button"
                              title="WhatsApp"
                              onClick={() =>
                                openWhatsAppText(
                                  a.patient_telefono!,
                                  `Hola ${a.patient_nombre.split(" ")[0]}, le escribimos de la clínica.`
                                )
                              }
                              className="rounded-md p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-success-600"
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

            {canAgenda && citas_hoy.length > 0 ? (
              <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 text-center">
                <Link
                  href="/agenda?nueva=1"
                  className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
                >
                  <Plus className="h-3.5 w-3.5" /> Agendar nueva cita
                </Link>
              </div>
            ) : null}
          </section>

          {/* Chart + laterales en subgrid alineado */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
            <section className={`${PANEL} ${PANEL_PAD} md:col-span-7`}>
              <SectionTitle
                title="Tendencia de ingresos"
                subtitle="Últimos 7 días · vs semana anterior"
                action={
                  <div className="hidden items-center gap-3 sm:flex">
                    <span className="flex items-center gap-1.5 text-[11px] text-slate-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                      Esta semana
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                      Anterior
                    </span>
                  </div>
                }
              />
              <div className="mt-3">
                <RevenueChart
                  labels={data.revenue_chart.labels}
                  thisWeek={data.revenue_chart.this_week}
                  lastWeek={data.revenue_chart.last_week}
                />
              </div>
            </section>

            <div className="flex min-w-0 flex-col gap-4 md:col-span-5">
              <section className={`${PANEL} ${PANEL_PAD} flex-1`}>
                <SectionTitle
                  title="Especialidades"
                  subtitle="Pacientes por atención"
                />
                {data.especialidades.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-500">
                    Aún no hay especialidades en las fichas.
                  </p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {data.especialidades.map((esp) => (
                      <li key={esp.nombre}>
                        <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                          <span className="truncate font-medium text-slate-700">
                            {esp.nombre}
                          </span>
                          <span className="shrink-0 text-xs font-semibold tabular-nums text-brand-600">
                            {esp.count}
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="dash-progress-fill h-full rounded-full bg-brand-500"
                            style={{ width: `${esp.pct}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className={`${PANEL} ${PANEL_PAD}`}>
                <SectionTitle
                  title="Cumpleaños"
                  subtitle="Próximos 14 días"
                  action={<Cake className="h-4 w-4 text-brand-600" aria-hidden />}
                />
                {data.cumpleanos.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">
                    Sin cumpleaños próximos
                  </p>
                ) : (
                  <ul className="mt-3 max-h-48 space-y-0 divide-y divide-slate-100 overflow-y-auto">
                    {data.cumpleanos.map((c) => (
                      <li key={c.patient_id}>
                        <PacienteFichaLink
                          patientId={c.patient_id}
                          className="-mx-1 flex items-center gap-2.5 rounded-md px-1 py-2 transition-colors hover:bg-slate-50"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-[11px] font-bold text-brand-700">
                            {c.initials}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-800">
                              {c.patient_nombre}
                            </p>
                            <p className="text-xs text-slate-500">
                              {c.dias === 0
                                ? "Hoy"
                                : c.dias === 1
                                  ? "Mañana"
                                  : `En ${c.dias} días`}{" "}
                              · {c.ficha}
                            </p>
                          </div>
                        </PacienteFichaLink>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>

          {/* Actividad bajo la columna principal (misma anchura) */}
          <section className={`${PANEL} overflow-hidden`}>
            <div
              className={`flex items-start justify-between gap-3 border-b border-slate-100 ${PANEL_PAD}`}
            >
              <SectionTitle
                title="Actividad reciente"
                subtitle="Últimas acciones del sistema"
              />
              {canReportes ? (
                <Link
                  href="/reportes"
                  className="text-sm font-semibold text-brand-600 hover:text-brand-700"
                >
                  Ver todo
                </Link>
              ) : null}
            </div>
            {data.actividad.length === 0 ? (
              <div className={PANEL_PAD}>
                <EmptyLine>Aún no hay actividad registrada</EmptyLine>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {data.actividad.map((a, idx) => (
                  <Link
                    key={`${a.type}-${idx}-${a.at}`}
                    href={a.href}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 sm:gap-4 sm:px-5"
                  >
                    {activityIcon(a.type)}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-700">
                        <span className="font-semibold text-slate-800">
                          {a.title}
                        </span>
                        {a.detail ? (
                          <span className="text-slate-500"> · {a.detail}</span>
                        ) : null}
                      </p>
                      <p className="text-xs text-slate-400">{a.relative}</p>
                    </div>
                    {a.amount != null && a.amount > 0 ? (
                      <span
                        className={`shrink-0 text-sm font-semibold tabular-nums ${
                          a.type === "cita_completada" || a.type === "cobro"
                            ? "text-success-600"
                            : "text-slate-700"
                        }`}
                      >
                        {moneyPE(a.amount)}
                      </span>
                    ) : null}
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Rail derecho — misma altura lógica, mismos paneles */}
        <aside className="flex min-w-0 flex-col gap-4 lg:col-span-4">
          <section className={`${PANEL} overflow-hidden`}>
            <div
              className={`flex items-center justify-between border-b border-slate-100 ${PANEL_PAD} !py-3.5`}
            >
              <h2 className="text-sm font-semibold text-slate-900">
                Recordatorios
              </h2>
              {reminders.length > 0 ? (
                <span className="rounded-md bg-danger-50 px-2 py-0.5 text-[11px] font-semibold text-danger-700">
                  {reminders.length}
                </span>
              ) : null}
            </div>
            <div className="space-y-2 p-3 sm:p-4">
              {reminders.length === 0 ? (
                <EmptyLine>
                  <span className="inline-flex items-center gap-2">
                    <Check className="h-4 w-4 text-success-500" />
                    Sin recordatorios pendientes
                  </span>
                </EmptyLine>
              ) : (
                reminders.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-lg border border-warning-100 bg-warning-50/80 p-3"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-warning-100">
                        <Clock className="h-4 w-4 text-warning-700" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800">
                          {r.patient_nombre}
                        </p>
                        <p className="text-xs text-slate-500">
                          {r.appointment_fecha
                            ? `Cita ${formatTime(r.appointment_fecha)}`
                            : "Cita"}
                          {r.especialidad ? ` · ${r.especialidad}` : ""}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
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
                  </div>
                ))
              )}
            </div>
          </section>

          <section className={`${PANEL} overflow-hidden`}>
            <div className={`border-b border-slate-100 ${PANEL_PAD} !py-3.5`}>
              <SectionTitle
                title="Deudas pendientes"
                subtitle={`${kpis.deuda_pacientes} ${
                  kpis.deuda_pacientes === 1 ? "paciente" : "pacientes"
                } con saldo`}
              />
            </div>
            {deudas.length === 0 ? (
              <div className={PANEL_PAD}>
                <EmptyLine>No hay saldos pendientes</EmptyLine>
              </div>
            ) : (
              <>
                <div className="divide-y divide-slate-100">
                  {deudas.map((d) => (
                    <PacienteFichaLink
                      key={d.patient_id}
                      patientId={d.patient_id}
                      className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-slate-50 sm:px-5"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-danger-50 text-xs font-bold text-danger-600">
                          {d.initials}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800">
                            {d.patient_nombre}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {d.ficha} · {d.concepto}
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 text-sm font-bold tabular-nums text-danger-600">
                        {moneyPE(d.saldo)}
                      </span>
                    </PacienteFichaLink>
                  ))}
                </div>
                {canPacientes ? (
                  <div className="border-t border-slate-100 px-4 py-2.5 text-center">
                    <Link
                      href="/pacientes"
                      className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
                    >
                      Ver fichas <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                ) : null}
              </>
            )}
          </section>

          <section className={`${PANEL} overflow-hidden`}>
            <div className={`border-b border-slate-100 ${PANEL_PAD} !py-3.5`}>
              <SectionTitle
                title="Tratamientos activos"
                subtitle={`${tratamientos_activos.length} en progreso`}
              />
            </div>
            <div className="space-y-3 p-4">
              {tratamientos_activos.length === 0 ? (
                <EmptyLine>Sin tratamientos activos con saldo</EmptyLine>
              ) : (
                tratamientos_activos.map((t, i) => (
                  <PacienteFichaLink
                    key={`${t.patient_id}-${i}`}
                    patientId={t.patient_id}
                    className="block"
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-slate-800">
                        {t.label}
                      </span>
                      <span
                        className={`shrink-0 text-xs font-semibold tabular-nums ${progressTextTone(i)}`}
                      >
                        {t.progress_pct}%
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`dash-progress-fill h-full rounded-full ${progressTone(i)}`}
                        style={{ width: `${t.progress_pct}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Saldo {moneyPE(t.saldo)} de {moneyPE(t.costo)}
                    </p>
                  </PacienteFichaLink>
                ))
              )}
            </div>
          </section>

          {/* Resumen semanal: sin bloque azul saturado — mismo lenguaje visual */}
          <section className={`${PANEL} overflow-hidden`}>
            <div className="border-b border-slate-100 bg-gradient-to-r from-brand-50/80 to-transparent px-4 py-3.5 sm:px-5">
              <h2 className="text-sm font-semibold text-slate-900">
                Resumen semanal
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Acumulado de la semana en curso
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 p-4">
              {[
                {
                  label: "Citas atendidas",
                  value: String(data.resumen_semanal.citas_atendidas),
                },
                {
                  label: "Ingresos",
                  value: moneyPE(data.resumen_semanal.ingresos),
                },
                {
                  label: "Nuevos pacientes",
                  value: String(data.resumen_semanal.nuevos_pacientes),
                },
                {
                  label: "Tratamientos",
                  value: String(data.resumen_semanal.tratamientos),
                },
              ].map((cell) => (
                <div
                  key={cell.label}
                  className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5"
                >
                  <p className="text-lg font-bold tabular-nums tracking-tight text-slate-900">
                    {cell.value}
                  </p>
                  <p className="mt-0.5 text-[11px] font-medium leading-snug text-slate-500">
                    {cell.label}
                  </p>
                </div>
              ))}
            </div>
            {canReportes ? (
              <div className="border-t border-slate-100 p-3">
                <Link
                  href="/reportes"
                  className="flex w-full items-center justify-center gap-1 rounded-lg border border-brand-100 bg-brand-50 py-2 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-100"
                >
                  Ver reporte detallado
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ) : null}
          </section>
        </aside>
      </div>
    </PageContainer>
  );
}
