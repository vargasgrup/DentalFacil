"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, FileText, ArrowRight, Users } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatFichaCode } from "@/lib/ficha";
import { Badge } from "@/components/ui/Badge";

export interface FichaSearchHit {
  id: number;
  numero_ficha: number;
  nombres: string;
  apellidos: string;
  telefono?: string;
  numero_documento?: string;
}

export interface FichaShortcut {
  patientId: number;
  label: string;
  meta?: string;
}

interface FichaQuickOpenProps {
  /** One-click shortcuts (e.g. today's appointment patients). */
  shortcuts?: FichaShortcut[];
  autoFocus?: boolean;
  className?: string;
}

/**
 * Primary entry to Ficha Clínica: search → open /pacientes/:id in one click.
 * Does not invent a new route; the clinical record lives on the patient page.
 */
export function FichaQuickOpen({
  shortcuts = [],
  autoFocus = false,
  className = "",
}: FichaQuickOpenProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FichaSearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (autoFocus) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 80);
      return () => window.clearTimeout(t);
    }
  }, [autoFocus]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (query.trim().length < 1) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const data = await apiFetch<FichaSearchHit[]>(
          `/api/patients/search?q=${encodeURIComponent(query.trim())}`
        );
        setResults(data);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  const openFicha = (patientId: number) => {
    setQuery("");
    setOpen(false);
    router.push(`/pacientes/${patientId}`);
  };

  const uniqueShortcuts = shortcuts.filter(
    (s, i, arr) => arr.findIndex((x) => x.patientId === s.patientId) === i
  );

  return (
    <section
      className={`rounded-card border border-brand-200 bg-white shadow-card ${className}`}
      aria-labelledby="ficha-access-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-50 px-5 py-4">
        <div className="min-w-0 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <FileText className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-600">
              Núcleo del sistema
            </p>
            <h2 id="ficha-access-title" className="text-section-title text-slate-800">
              Ficha clínica
            </h2>
            <p className="mt-0.5 max-w-xl text-sm text-slate-500">
              Busca por nombre, DNI o código FC-##### y abre la historia en un clic.
            </p>
          </div>
        </div>
        <Link
          href="/pacientes"
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          Ver pacientes
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="space-y-4 px-5 py-4">
        <div ref={boxRef} className="relative">
          <div className="relative flex items-center">
            <Search
              className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-400"
              aria-hidden
            />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => results.length > 0 && setOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && results[0]) {
                  e.preventDefault();
                  openFicha(results[0].id);
                }
              }}
              placeholder="Abrir ficha: nombre, DNI o FC-00005…"
              autoComplete="off"
              className="h-11 w-full rounded-lg border border-slate-200 bg-surface-subtle pl-10 pr-24 text-sm text-slate-800 transition-smooth placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
              aria-label="Buscar y abrir ficha clínica"
              aria-autocomplete="list"
              aria-expanded={open}
            />
            <span className="pointer-events-none absolute right-3 text-help text-slate-400">
              {loading ? "Buscando…" : "Enter"}
            </span>
          </div>

          {open && results.length > 0 && (
            <ul
              role="listbox"
              className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-dropdown"
            >
              {results.map((p) => (
                <li key={p.id} role="option">
                  <button
                    type="button"
                    onClick={() => openFicha(p.id)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-smooth hover:bg-brand-50"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                      {(p.nombres[0] || "").toUpperCase()}
                      {(p.apellidos[0] || "").toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">
                        {p.nombres} {p.apellidos}
                      </span>
                      <span className="block truncate text-help text-slate-400">
                        {[p.numero_documento && `DNI ${p.numero_documento}`, p.telefono]
                          .filter(Boolean)
                          .join(" · ") || "Sin documento"}
                      </span>
                    </span>
                    <Badge variant="brand" className="shrink-0 font-mono tracking-wide">
                      {formatFichaCode(p.numero_ficha)}
                    </Badge>
                    <span className="hidden shrink-0 text-xs font-semibold text-brand-600 sm:inline">
                      Abrir
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {open && !loading && query.trim().length > 0 && results.length === 0 && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1.5 rounded-lg border border-slate-200 bg-white p-4 shadow-dropdown">
              <p className="text-sm text-slate-500">No hay pacientes con ese criterio.</p>
              <Link
                href="/pacientes/nuevo"
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                <Users className="h-3.5 w-3.5" />
                Registrar nuevo paciente
              </Link>
            </div>
          )}
        </div>

        {uniqueShortcuts.length > 0 && (
          <div>
            <p className="mb-2 text-help font-medium text-slate-400">
              Acceso rápido · pacientes de hoy
            </p>
            <div className="flex flex-wrap gap-2">
              {uniqueShortcuts.slice(0, 6).map((s) => (
                <button
                  key={s.patientId}
                  type="button"
                  onClick={() => openFicha(s.patientId)}
                  className="inline-flex max-w-full items-center gap-2 rounded-lg border border-slate-200 bg-surface-subtle px-3 py-2 text-left transition-smooth hover:border-brand-300 hover:bg-brand-50"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0 text-brand-500" aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-800">
                      {s.label}
                    </span>
                    {s.meta && (
                      <span className="block truncate text-help text-slate-400">{s.meta}</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
