"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CalendarRange,
  FileSpreadsheet,
  Banknote,
  Stethoscope,
  Users,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, StatCard } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/ui/PageContainer";
import { Input } from "@/components/Input";
import { DocumentActions } from "@/components/DocumentActions";
import { apiFetch, getToken } from "@/lib/api";

type ReportType = "caja" | "pacientes" | "tratamientos";

interface ReportData {
  title: string;
  fecha_inicio: string;
  fecha_fin: string;
  summary: Record<string, string>;
  rows: string[][];
  meta?: Record<string, unknown>;
}

interface ResumenData {
  fecha_inicio: string;
  fecha_fin: string;
  caja: {
    total_ingresos?: number;
    total_egresos?: number;
    neto?: number;
    por_metodo?: Record<string, number>;
  };
  pacientes: {
    pacientes_unicos?: number;
    atenciones?: number;
    citas?: number;
    evoluciones?: number;
    cobros_caja?: number;
  };
  tratamientos: {
    atenciones?: number;
    costo_total?: number;
    a_cuenta?: number;
    saldo?: number;
  };
}

const REPORT_TYPES: {
  id: ReportType;
  label: string;
  description: string;
  icon: typeof Banknote;
}[] = [
  {
    id: "caja",
    label: "Caja",
    description: "Ingresos, egresos y métodos de pago",
    icon: Banknote,
  },
  {
    id: "pacientes",
    label: "Pacientes atendidos",
    description: "Citas + evolución clínica + cobros",
    icon: Users,
  },
  {
    id: "tratamientos",
    label: "Tratamientos",
    description: "Evolución, costos, a cuenta y saldo",
    icon: Stethoscope,
  },
];

function toLocalDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function rangePreset(kind: "hoy" | "semana" | "mes"): { start: string; end: string } {
  const now = new Date();
  const end = toLocalDateInput(now);
  if (kind === "hoy") {
    return { start: end, end };
  }
  if (kind === "semana") {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    return { start: toLocalDateInput(start), end };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start: toLocalDateInput(start), end };
}

function money(n: number | undefined): string {
  return `S/ ${Number(n || 0).toFixed(2)}`;
}

export default function ReportesPage() {
  const month = useMemo(() => rangePreset("mes"), []);
  const [type, setType] = useState<ReportType>("pacientes");
  const [start, setStart] = useState(month.start);
  const [end, setEnd] = useState(month.end);
  const [data, setData] = useState<ReportData | null>(null);
  const [resumen, setResumen] = useState<ResumenData | null>(null);
  const [loading, setLoading] = useState(false);
  const [resumenLoading, setResumenLoading] = useState(false);
  const [error, setError] = useState("");

  const rangeQuery = useCallback(() => {
    const startIso = new Date(start + "T00:00:00").toISOString();
    const endIso = new Date(end + "T23:59:59").toISOString();
    return { startIso, endIso };
  }, [start, end]);

  const loadResumen = useCallback(async () => {
    if (!start || !end) return;
    setResumenLoading(true);
    try {
      const { startIso, endIso } = rangeQuery();
      const r = await apiFetch<ResumenData>(
        `/api/reports/resumen?start=${startIso}&end=${endIso}`
      );
      setResumen(r);
    } catch {
      setResumen(null);
    } finally {
      setResumenLoading(false);
    }
  }, [start, end, rangeQuery]);

  useEffect(() => {
    void loadResumen();
  }, [loadResumen]);

  const runReport = async () => {
    if (!start || !end) {
      setError("Selecciona un rango de fechas");
      return;
    }
    if (start > end) {
      setError("La fecha Desde no puede ser posterior a Hasta");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { startIso, endIso } = rangeQuery();
      const result = await apiFetch<ReportData>(
        `/api/reports/${type}?start=${startIso}&end=${endIso}`
      );
      setData(result);
      void loadResumen();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo generar el reporte");
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = () => {
    if (!start || !end) return;
    const { startIso, endIso } = rangeQuery();
    const token = getToken();
    fetch(`/api/reports/${type}?start=${startIso}&end=${endIso}&csv_export=true`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => {
        if (!r.ok) throw new Error("Error CSV");
        return r.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `reporte_${type}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => alert("Error al descargar CSV"));
  };

  const applyPreset = (kind: "hoy" | "semana" | "mes") => {
    const r = rangePreset(kind);
    setStart(r.start);
    setEnd(r.end);
    setData(null);
  };

  const detailCount = data ? Math.max(0, data.rows.length - 1) : 0;
  const porMetodo = resumen?.caja?.por_metodo || {};
  const metodoMax = Math.max(1, ...Object.values(porMetodo).map(Number), 1);

  return (
    <PageContainer width="wide">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title text-slate-800">Reportes</h1>
          <p className="mt-1 text-sm text-slate-500">
            Vista consolidada de Agenda, Ficha clínica y Caja. Los datos se actualizan al
            generar o al cambiar el período.
          </p>
        </div>
        <Button
          variant="secondary"
          icon={<RefreshCw className="h-3.5 w-3.5" />}
          loading={resumenLoading}
          onClick={() => void loadResumen()}
        >
          Actualizar KPIs
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-600">
          {error}
        </div>
      )}

      {/* Filtros */}
      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <CalendarRange className="h-4 w-4 text-brand-600" />
          <span className="text-label text-slate-700">Período</span>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["hoy", "Hoy"],
                ["semana", "7 días"],
                ["mes", "Este mes"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => applyPreset(k)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 transition-smooth hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            label="Desde"
            type="date"
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              setData(null);
            }}
          />
          <Input
            label="Hasta"
            type="date"
            value={end}
            onChange={(e) => {
              setEnd(e.target.value);
              setData(null);
            }}
          />
          <div className="flex items-end sm:col-span-2 lg:col-span-2">
            <Button onClick={() => void runReport()} loading={loading} className="w-full sm:w-auto">
              Generar reporte
            </Button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
          {REPORT_TYPES.map((rt) => {
            const Icon = rt.icon;
            const active = type === rt.id;
            return (
              <button
                key={rt.id}
                type="button"
                onClick={() => {
                  setType(rt.id);
                  setData(null);
                }}
                className={`rounded-xl border p-4 text-left transition-smooth ${
                  active
                    ? "border-brand-500 bg-brand-50/80 shadow-sm ring-1 ring-brand-500"
                    : "border-slate-200 bg-white hover:border-brand-300 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      active ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{rt.label}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{rt.description}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* KPIs en tiempo real del período */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<Banknote className="h-5 w-5" />}
          label="Ingresos (período)"
          value={money(resumen?.caja?.total_ingresos)}
          subtext={`Egresos ${money(resumen?.caja?.total_egresos)}`}
          variant="success"
        />
        <StatCard
          icon={<BarChart3 className="h-5 w-5" />}
          label="Neto de caja"
          value={money(resumen?.caja?.neto)}
          variant="info"
        />
        <StatCard
          icon={<Users className="h-5 w-5" />}
          label="Pacientes atendidos"
          value={String(resumen?.pacientes?.pacientes_unicos ?? 0)}
          subtext={`${resumen?.pacientes?.atenciones ?? 0} atenciones · ${resumen?.pacientes?.citas ?? 0} citas · ${resumen?.pacientes?.evoluciones ?? 0} evol.`}
          variant="default"
        />
        <StatCard
          icon={<Stethoscope className="h-5 w-5" />}
          label="Saldo clínico"
          value={money(resumen?.tratamientos?.saldo)}
          subtext={`A cuenta ${money(resumen?.tratamientos?.a_cuenta)}`}
          variant="warning"
        />
      </div>

      {Object.keys(porMetodo).length > 0 && (
        <Card>
          <p className="mb-3 text-sm font-semibold text-slate-800">
            Ingresos por método de pago
          </p>
          <div className="space-y-2.5">
            {Object.entries(porMetodo).map(([metodo, monto]) => (
              <div key={metodo}>
                <div className="mb-1 flex justify-between text-xs text-slate-600">
                  <span className="capitalize">{metodo}</span>
                  <span className="font-medium">{money(Number(monto))}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-smooth"
                    style={{
                      width: `${Math.max(4, (Number(monto) / metodoMax) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {!data && !loading && (
        <EmptyState
          icon={<BarChart3 className="h-7 w-7" />}
          title="Genera un reporte detallado"
          description="Elige el tipo (Caja, Pacientes atendidos o Tratamientos) y pulsa Generar. Incluye citas, evolución clínica y movimientos de caja del período."
        />
      )}

      {loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton h-20 rounded-card" />
            ))}
          </div>
          <div className="skeleton h-48 rounded-card" />
        </div>
      )}

      {data && !loading && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-section-title text-slate-800">{data.title}</h2>
              <p className="text-sm text-slate-500">
                {data.fecha_inicio} — {data.fecha_fin}
                {detailCount === 0
                  ? " · Sin registros en este período"
                  : ` · ${detailCount} registro${detailCount === 1 ? "" : "s"}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <DocumentActions
                label="Reporte PDF"
                documentType="reporte"
                downloadUrl={`/api/reports/${type}?start=${rangeQuery().startIso}&end=${rangeQuery().endIso}`}
                telefono={null}
                mensaje={`Reporte ${data.title} (${data.fecha_inicio} – ${data.fecha_fin}) — M&D Odontología.`}
                allowShareWithoutPhone
                defaultFormat="A4"
              />
              <Button
                variant="secondary"
                onClick={downloadCSV}
                icon={<FileSpreadsheet className="h-3.5 w-3.5" />}
                className="text-xs"
              >
                CSV
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {Object.entries(data.summary).map(([label, value]) => (
              <Card key={label} padding="sm" className="bg-slate-50/80">
                <p className="text-help text-slate-500">{label}</p>
                <p className="mt-1 text-base font-bold text-slate-800">{value}</p>
              </Card>
            ))}
          </div>

          {detailCount > 0 ? (
            <Card padding="none" className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                      {data.rows[0].map((col, i) => (
                        <th key={i} className="whitespace-nowrap px-4 py-3 font-medium">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.slice(1).map((row, i) => (
                      <tr
                        key={i}
                        className="border-b border-slate-100 transition-smooth hover:bg-brand-50/40"
                      >
                        {row.map((cell, j) => (
                          <td key={j} className="whitespace-nowrap px-4 py-2.5 text-slate-700">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            <EmptyState
              icon={<Users className="h-7 w-7" />}
              title="Sin datos para este filtro"
              description="No hay citas, evoluciones ni cobros en el rango. Prueba «Este mes» o amplía las fechas."
            />
          )}
        </div>
      )}
    </PageContainer>
  );
}
