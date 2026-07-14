"use client";

import { useState } from "react";
import { BarChart3, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
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
}

export default function ReportesPage() {
  const [type, setType] = useState<ReportType>("caja");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const runReport = async () => {
    if (!start || !end) {
      setError("Selecciona un rango de fechas");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const startIso = new Date(start + "T00:00:00").toISOString();
      const endIso = new Date(end + "T23:59:59").toISOString();
      const result = await apiFetch<ReportData>(
        `/api/reports/${type}?start=${startIso}&end=${endIso}`
      );
      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = () => {
    if (!start || !end) return;
    const startIso = new Date(start + "T00:00:00").toISOString();
    const endIso = new Date(end + "T23:59:59").toISOString();
    const token = getToken();
    fetch(`/api/reports/${type}?start=${startIso}&end=${endIso}&csv_export=true`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.blob())
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

  return (
    <PageContainer width="narrow">
      <div>
        <h1 className="text-page-title text-slate-800">Reportes</h1>
        <p className="mt-1 text-sm text-slate-500">
          Genera resúmenes de caja, pacientes y tratamientos.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-600">
          {error}
        </div>
      )}

      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-label text-slate-700">Tipo de reporte</span>
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value as ReportType);
                setData(null);
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm transition-smooth focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="caja">Caja (ingresos/egresos)</option>
              <option value="pacientes">Pacientes atendidos</option>
              <option value="tratamientos">Tratamientos / Evolución</option>
            </select>
          </label>
          <Input
            label="Desde"
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
          <Input
            label="Hasta"
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
          <div className="sm:col-span-2">
            <Button onClick={runReport} loading={loading} className="w-full sm:w-auto">
              Generar
            </Button>
          </div>
        </div>
      </Card>

      {!data && !loading && (
        <EmptyState
          icon={<BarChart3 className="h-7 w-7" />}
          title="Selecciona un rango de fechas y genera tu primer reporte"
          description="Elige tipo de reporte, fechas Desde/Hasta y pulsa Generar. Podrás exportar a PDF o CSV."
        />
      )}

      {loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton h-20 rounded-card" />
            ))}
          </div>
          <div className="skeleton h-48 rounded-card" />
        </div>
      )}

      {data && !loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {Object.entries(data.summary).map(([label, value]) => (
              <Card key={label} padding="sm">
                <p className="text-help text-slate-400">{label}</p>
                <p className="mt-1 text-lg font-bold text-slate-700">{value}</p>
              </Card>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-slate-600">Exportar:</span>
            <DocumentActions
              label="Reporte PDF"
              downloadUrl={`/api/reports/${type}?start=${new Date(start + "T00:00:00").toISOString()}&end=${new Date(end + "T23:59:59").toISOString()}`}
              telefono={null}
              mensaje=""
              hideWhatsApp
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

          {data.rows.length > 1 ? (
            <Card padding="none" className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-surface-subtle text-left text-slate-500">
                      {data.rows[0].map((col, i) => (
                        <th key={i} className="px-4 py-3 font-medium">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.slice(1).map((row, i) => (
                      <tr
                        key={i}
                        className="border-b border-slate-100 transition-smooth hover:bg-brand-50/30"
                      >
                        {row.map((cell, j) => (
                          <td key={j} className="px-4 py-2.5 text-slate-700">
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
              icon={<BarChart3 className="h-7 w-7" />}
              title="Sin datos en el rango seleccionado"
              description="Prueba con otro rango de fechas o tipo de reporte."
            />
          )}
        </div>
      )}
    </PageContainer>
  );
}
