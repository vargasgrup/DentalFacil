"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Wallet,
  Calendar,
  Users,
  BarChart3,
  Plus,
  Bell,
  CheckCircle2,
  ArrowRight,
  FileText,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { formatTime } from "@/lib/datetime";
import { Card, EmptyState, PageContainer } from "@/components/ui";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FichaQuickOpen } from "@/components/FichaQuickOpen";

interface CashSession {
  id: string;
  monto_inicial: number;
  estado: string;
  abierta_en: string;
}

interface CashTransaction {
  id: string;
  tipo: string;
  monto: number;
}

interface Appointment {
  id: string;
  patient_id: string;
  patient_nombre?: string;
  fecha_hora: string;
  duracion_minutos: number;
  estado: string;
}

const estadoBadge: Record<string, { variant: "info" | "success" | "danger"; label: string }> = {
  programada: { variant: "info", label: "Programada" },
  completada: { variant: "success", label: "Completada" },
  cancelada: { variant: "danger", label: "Cancelada" },
};

function greetingForHour(h: number): string {
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

function KpiCard({
  href,
  label,
  value,
  subtext,
  icon,
  iconClass,
}: {
  href: string;
  label: string;
  value: string;
  subtext?: string;
  icon: React.ReactNode;
  iconClass: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-card border border-slate-200 bg-white p-5 shadow-card transition-smooth hover:border-brand-200 hover:shadow-card-hover"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {label}
        </p>
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconClass}`}>
          {icon}
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold tracking-normal text-slate-800">{value}</p>
      {subtext && <p className="mt-1 text-sm text-slate-500">{subtext}</p>}
    </Link>
  );
}

function QuickPill({
  href,
  icon,
  children,
  primary,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 rounded-pill border px-4 py-2 text-sm font-medium transition-smooth ${
        primary
          ? "border-brand-600 bg-brand-600 text-white shadow-sm hover:bg-brand-700"
          : "border-slate-200 bg-white text-slate-700 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
      }`}
    >
      {icon}
      {children}
    </Link>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [cashSession, setCashSession] = useState<CashSession | null>(null);
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [todayAppts, setTodayAppts] = useState<Appointment[]>([]);
  const [reminderCount, setReminderCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    Promise.all([
      apiFetch<CashSession | null>("/api/cash/session").catch(() => null),
      apiFetch<Appointment[]>(
        `/api/appointments?start=${start.toISOString()}&end=${end.toISOString()}`
      ).catch(() => []),
      apiFetch<{ id: string }[]>("/api/appointments/reminders/pending").catch(() => []),
    ]).then(async ([cs, appts, rems]) => {
      setCashSession(cs);
      setTodayAppts(
        [...appts].sort(
          (a, b) => new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime()
        )
      );
      setReminderCount(rems.length);
      if (cs) {
        try {
          const txs = await apiFetch<CashTransaction[]>("/api/cash/transactions");
          setTransactions(txs);
        } catch {
          setTransactions([]);
        }
      }
      setLoading(false);
    });
  }, []);

  const cashTotals = useMemo(() => {
    const ingresos = transactions
      .filter((t) => t.tipo === "ingreso")
      .reduce((s, t) => s + Number(t.monto), 0);
    const egresos = transactions
      .filter((t) => t.tipo === "egreso")
      .reduce((s, t) => s + Number(t.monto), 0);
    const inicial = cashSession?.monto_inicial ?? 0;
    return {
      ingresos,
      egresos,
      saldo: inicial + ingresos - egresos,
    };
  }, [transactions, cashSession]);

  const activeAppts = todayAppts.filter((a) => a.estado !== "cancelada");
  const nextAppt = activeAppts.find((a) => new Date(a.fecha_hora) >= new Date()) || activeAppts[0];
  const firstName = user?.nombre?.split(" ")[0] || "Usuario";
  const now = new Date();
  const dateLabel = now.toLocaleDateString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  if (loading) {
    return (
      <PageContainer>
        <div className="skeleton h-10 w-72 rounded-lg" />
        <div className="skeleton h-40 w-full rounded-card" />
        <div className="skeleton h-10 w-full max-w-xl rounded-pill" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-28 rounded-card" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="skeleton h-72 rounded-card lg:col-span-2" />
          <div className="skeleton h-72 rounded-card" />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      {/* Header: greeting + day summary (N&K pattern) */}
      <header className="space-y-2">
        <p className="text-sm font-medium tracking-wide text-slate-400">Inicio</p>
        <h1 className="text-page-title tracking-normal text-slate-800">
          {greetingForHour(now.getHours())}, {firstName}
        </h1>
        <p className="max-w-3xl text-[0.9375rem] leading-relaxed tracking-normal text-slate-500">
          Hoy es{" "}
          <span className="font-semibold capitalize tracking-normal text-slate-700">
            {dateLabel}
          </span>
          . Tienes{" "}
          <span className="font-semibold tracking-normal text-slate-700">
            {activeAppts.length}
          </span>{" "}
          {activeAppts.length === 1 ? "cita agendada" : "citas agendadas"}
          {reminderCount > 0 && (
            <>
              {" "}
              y{" "}
              <span className="font-semibold tracking-normal text-warning-600">
                {reminderCount}
              </span>{" "}
              {reminderCount === 1 ? "recordatorio pendiente" : "recordatorios pendientes"}
            </>
          )}
          {cashSession
            ? `. Caja abierta con inicial S/ ${cashSession.monto_inicial.toFixed(2)}.`
            : ". La caja aún no está abierta."}
        </p>
      </header>

      {/* Heart of the system: open clinical record in ≤2 clicks */}
      <FichaQuickOpen
        autoFocus
        shortcuts={activeAppts.map((a) => ({
          patientId: a.patient_id,
          label: a.patient_nombre || "Paciente",
          meta: `${formatTime(a.fecha_hora)} · cita de hoy`,
        }))}
      />

      {/* Secondary quick actions */}
      <div className="flex flex-wrap gap-2">
        <QuickPill href="/pacientes" icon={<FileText className="h-4 w-4" />} primary>
          Listado de fichas
        </QuickPill>
        <QuickPill href="/pacientes/nuevo" icon={<Users className="h-4 w-4" />}>
          Nuevo paciente
        </QuickPill>
        <QuickPill href="/agenda" icon={<Calendar className="h-4 w-4" />}>
          Agendar cita
        </QuickPill>
        <QuickPill href="/reportes" icon={<BarChart3 className="h-4 w-4" />}>
          Ver reportes
        </QuickPill>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          href="/caja"
          label="Caja"
          value={cashSession ? "Abierta" : "Sin abrir"}
          subtext={
            cashSession
              ? `Inicial: S/ ${cashSession.monto_inicial.toFixed(2)}`
              : "Abre caja para registrar pagos"
          }
          icon={<Wallet className="h-4 w-4" />}
          iconClass={
            cashSession
              ? "bg-success-50 text-success-600"
              : "bg-surface-subtle text-slate-400"
          }
        />
        <KpiCard
          href="/agenda"
          label="Citas hoy"
          value={String(activeAppts.length)}
          subtext={
            nextAppt
              ? `Próxima: ${formatTime(nextAppt.fecha_hora)}`
              : "Sin citas activas"
          }
          icon={<Calendar className="h-4 w-4" />}
          iconClass="bg-brand-50 text-brand-600"
        />
        <KpiCard
          href="/agenda"
          label="Recordatorios"
          value={String(reminderCount)}
          subtext={
            reminderCount > 0 ? "Pendientes de enviar" : "Todo al día"
          }
          icon={<Bell className="h-4 w-4" />}
          iconClass={
            reminderCount > 0
              ? "bg-warning-50 text-warning-600"
              : "bg-surface-subtle text-slate-400"
          }
        />
      </div>

      {/* Main grid: citas + atención */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Citas de hoy — hero */}
        <Card padding="none" className="overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-section-title text-slate-800">Citas de hoy</h2>
              <p className="text-help text-slate-400">Agenda del día en curso</p>
            </div>
            <Link
              href="/agenda"
              className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              Ver agenda
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {activeAppts.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<Calendar className="h-7 w-7" />}
                title="Agenda libre por ahora"
                description="No hay citas programadas para hoy. Agenda la siguiente desde aquí."
                action={
                  <Link href="/agenda">
                    <Button variant="primary" icon={<Plus className="h-4 w-4" />}>
                      Agendar cita
                    </Button>
                  </Link>
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-slate-50">
              {todayAppts.map((a) => {
                const est = estadoBadge[a.estado] || estadoBadge.programada;
                const initials = (a.patient_nombre || "?")
                  .split(" ")
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase();
                return (
                  <li key={a.id}>
                    <div className="flex items-center gap-3 px-5 py-3.5 transition-smooth hover:bg-brand-50/40 sm:gap-4">
                      <div className="w-14 shrink-0 text-center">
                        <p className="text-sm font-bold text-slate-800">
                          {formatTime(a.fecha_hora)}
                        </p>
                        <p className="text-[10px] text-slate-400">{a.duracion_minutos} min</p>
                      </div>
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-slate-800">
                          {a.patient_nombre || "Paciente"}
                        </p>
                        <p className="text-help text-slate-400">Cita · {est.label}</p>
                      </div>
                      <Badge variant={est.variant} className="hidden sm:inline-flex">
                        {est.label}
                      </Badge>
                      <Link
                        href={`/pacientes/${a.patient_id}`}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700 transition-smooth hover:border-brand-300 hover:bg-brand-100"
                      >
                        <FileText className="h-3.5 w-3.5" aria-hidden />
                        <span className="hidden xs:inline sm:inline">Abrir ficha</span>
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Tu día — atención (solo módulos M&D) */}
        <Card padding="none" className="overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-section-title text-slate-800">Tu día</h2>
            <p className="text-help text-slate-400">Lo que requiere atención</p>
          </div>
          <ul className="divide-y divide-slate-50">
            <li className="flex items-center gap-3 px-5 py-3.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <FileText className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-700">Ficha clínica</p>
                <p className="text-help text-slate-400">
                  Historia, odontograma, plan y pagos
                </p>
              </div>
              <Link href="/pacientes" className="text-xs font-semibold text-brand-600">
                Abrir
              </Link>
            </li>
            <li className="flex items-center gap-3 px-5 py-3.5">
              {reminderCount === 0 ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-success-500" />
              ) : (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-warning-500 text-[10px] font-bold text-white">
                  {reminderCount}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-700">Recordatorios</p>
                <p className="text-help text-slate-400">
                  {reminderCount === 0
                    ? "Sin pendientes por enviar"
                    : `${reminderCount} listo(s) para WhatsApp`}
                </p>
              </div>
              {reminderCount > 0 && (
                <Link href="/agenda" className="text-xs font-semibold text-brand-600">
                  Enviar
                </Link>
              )}
            </li>
            <li className="flex items-center gap-3 px-5 py-3.5">
              {cashSession ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-success-500" />
              ) : (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-danger-500 text-[10px] font-bold text-white">
                  !
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-700">Caja del día</p>
                <p className="text-help text-slate-400">
                  {cashSession ? "Sesión abierta" : "Aún no abierta"}
                </p>
              </div>
              <Link href="/caja" className="text-xs font-semibold text-brand-600">
                {cashSession ? "Ver" : "Abrir"}
              </Link>
            </li>
            <li className="flex items-center gap-3 px-5 py-3.5">
              <FileText className="h-5 w-5 shrink-0 text-brand-600" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-700">Reportes</p>
                <p className="text-help text-slate-400">Caja, pacientes y tratamientos</p>
              </div>
              <Link href="/reportes" className="text-xs font-semibold text-brand-600">
                Ir
              </Link>
            </li>
          </ul>
          <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-3">
            <Link
              href="/pacientes"
              className="rounded-pill bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100"
            >
              Fichas
            </Link>
            <Link
              href="/caja"
              className="rounded-pill bg-surface-subtle px-3 py-1 text-xs font-medium text-slate-600 hover:bg-brand-50 hover:text-brand-700"
            >
              Caja
            </Link>
            <Link
              href="/agenda"
              className="rounded-pill bg-surface-subtle px-3 py-1 text-xs font-medium text-slate-600 hover:bg-brand-50 hover:text-brand-700"
            >
              Agenda
            </Link>
            <Link
              href="/reportes"
              className="rounded-pill bg-surface-subtle px-3 py-1 text-xs font-medium text-slate-600 hover:bg-brand-50 hover:text-brand-700"
            >
              Reportes
            </Link>
          </div>
        </Card>
      </div>

      {/* Bottom: Caja del día + Próximas */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-section-title text-slate-800">Caja del día</h2>
              <p className="text-help text-slate-400">Resumen de la sesión actual</p>
            </div>
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                cashSession ? "bg-success-50 text-success-600" : "bg-surface-subtle text-slate-400"
              }`}
            >
              <Wallet className="h-4 w-4" />
            </span>
          </div>
          {cashSession ? (
            <>
              <p className="mt-4 text-3xl font-bold tracking-normal text-slate-800">
                S/ {cashTotals.saldo.toFixed(2)}
              </p>
              <div className="mt-3 flex gap-4 text-sm">
                <span className="text-success-600">
                  + S/ {cashTotals.ingresos.toFixed(2)}
                </span>
                <span className="text-danger-500">
                  − S/ {cashTotals.egresos.toFixed(2)}
                </span>
              </div>
              <Link href="/caja" className="mt-4 inline-block">
                <Button variant="primary" className="w-full sm:w-auto">
                  Ver movimientos
                </Button>
              </Link>
            </>
          ) : (
            <>
              <p className="mt-4 text-sm text-slate-500">
                No hay caja abierta. Ábrela para registrar ingresos y egresos del día.
              </p>
              <Link href="/caja" className="mt-4 inline-block">
                <Button variant="secondary" icon={<Wallet className="h-4 w-4" />}>
                  Abrir caja
                </Button>
              </Link>
            </>
          )}
        </Card>

        <Card>
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-section-title text-slate-800">Próximas citas</h2>
              <p className="text-help text-slate-400">Siguientes del día</p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Calendar className="h-4 w-4" />
            </span>
          </div>
          {nextAppt ? (
            <div className="mt-4 space-y-3">
              {activeAppts
                .filter((a) => new Date(a.fecha_hora) >= new Date() || a.id === nextAppt.id)
                .slice(0, 3)
                .map((a) => (
                  <Link
                    key={a.id}
                    href={`/pacientes/${a.patient_id}`}
                    className="flex items-center justify-between gap-2 rounded-lg bg-surface-subtle px-3 py-2.5 transition-smooth hover:bg-brand-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {a.patient_nombre || "Paciente"}
                      </p>
                      <p className="text-help text-slate-400">
                        {formatTime(a.fecha_hora)} · {a.duracion_minutos} min
                      </p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-600">
                      <FileText className="h-3.5 w-3.5" />
                      Ficha
                    </span>
                  </Link>
                ))}
              <Link
                href="/agenda"
                className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                Ver agenda completa
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            <div className="mt-6 text-center">
              <Calendar className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-500">Sin próximas citas</p>
              <Link href="/agenda" className="mt-4 inline-block">
                <Button variant="primary" icon={<Plus className="h-4 w-4" />}>
                  Agendar cita
                </Button>
              </Link>
            </div>
          )}
        </Card>
      </div>
    </PageContainer>
  );
}
