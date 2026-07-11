"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Search, Plus, FileText, Phone, IdCard } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/ui/PageContainer";
import { formatFichaCode } from "@/lib/ficha";

interface Patient {
  id: number;
  numero_ficha: number;
  nombres: string;
  apellidos: string;
  telefono?: string;
  numero_documento?: string;
  created_at: string;
}

export default function PacientesPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [filtered, setFiltered] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    apiFetch<Patient[]>("/api/patients")
      .then((data) => {
        setPatients(data);
        setFiltered(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(patients);
      return;
    }
    const q = search.toLowerCase();
    setFiltered(
      patients.filter((p) =>
        `${p.nombres} ${p.apellidos} ${p.numero_documento || ""} ${p.numero_ficha} ${formatFichaCode(p.numero_ficha)}`
          .toLowerCase()
          .includes(q)
      )
    );
  }, [search, patients]);

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-page-title text-slate-800">Pacientes</h1>
          <p className="mt-1 text-sm text-slate-500">
            {filtered.length}{" "}
            {filtered.length === 1 ? "paciente" : "pacientes"}
            {search.trim()
              ? " encontrados"
              : " registrados · selecciona uno para abrir su ficha clínica"}
          </p>
        </div>
        <Link href="/pacientes/nuevo">
          <Button icon={<Plus className="h-4 w-4" />}>Nuevo paciente</Button>
        </Link>
      </div>

      <div className="relative w-full">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, DNI o ficha..."
          className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm transition-smooth focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users className="h-7 w-7" />}
          title={search ? "No se encontraron pacientes" : "Sin pacientes aún"}
          description={
            search
              ? "Prueba con otro término de búsqueda"
              : "Crea tu primer paciente para empezar a usar la Ficha Clínica."
          }
          action={
            !search ? (
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
            return (
              <Link key={p.id} href={`/pacientes/${p.id}`} className="group block">
                <Card className="h-full transition-smooth hover:border-brand-200 hover:shadow-card-hover">
                  <div className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700 transition-smooth group-hover:bg-brand-100">
                      {initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-sm font-semibold text-slate-800 group-hover:text-brand-700">
                          {p.nombres} {p.apellidos}
                        </h2>
                        <Badge variant="brand" className="font-mono tracking-wide">
                          {formatFichaCode(p.numero_ficha)}
                        </Badge>
                      </div>
                      <ul className="mt-3 space-y-1.5 text-sm text-slate-500">
                        <li className="flex items-center gap-2">
                          <IdCard className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <span>{p.numero_documento || "Sin documento"}</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <span>{p.telefono || "Sin teléfono"}</span>
                        </li>
                      </ul>
                      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                        <span className="text-help text-slate-400">
                          {new Date(p.created_at).toLocaleDateString("es-PE", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 opacity-80 transition-smooth group-hover:opacity-100">
                          <FileText className="h-3.5 w-3.5" />
                          Abrir ficha clínica
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
