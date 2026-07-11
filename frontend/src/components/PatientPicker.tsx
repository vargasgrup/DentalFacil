"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatFichaCode } from "@/lib/ficha";

export interface PickedPatient {
  id: number;
  numero_ficha: number;
  nombres: string;
  apellidos: string;
  telefono?: string | null;
  numero_documento?: string | null;
}

interface PatientPickerProps {
  value: PickedPatient | null;
  onChange: (patient: PickedPatient | null) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  /** Compact selected chip (filters) */
  compact?: boolean;
  className?: string;
  inputClassName?: string;
  /** Auto-focus search input when mounted */
  autoFocus?: boolean;
}

/**
 * Búsqueda inteligente de pacientes (global):
 * nombre, apellido, DNI y nº de ficha (FC-00005).
 * Selecciona sin navegar — usar en formularios y filtros.
 */
export function PatientPicker({
  value,
  onChange,
  label = "Paciente",
  placeholder = "Buscar: nombre, apellido, DNI o FC-00005…",
  required = false,
  compact = false,
  className = "",
  inputClassName = "",
  autoFocus = false,
}: PatientPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickedPatient[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (value) return;
    const q = query.trim();
    if (q.length < 1) {
      setResults([]);
      setOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await apiFetch<PickedPatient[]>(
          `/api/patients/search?q=${encodeURIComponent(q)}`
        );
        setResults(data);
        setOpen(true);
      } catch {
        setResults([]);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [query, value]);

  if (value) {
    return (
      <div className={className}>
        {label && (
          <span className="mb-1 block text-label text-slate-700">
            {label}
            {required ? " *" : ""}
          </span>
        )}
        <div
          className={`flex items-center justify-between gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 ${
            compact ? "py-1.5" : "py-2"
          }`}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-800">
              {value.nombres} {value.apellidos}
            </p>
            <p className="truncate text-xs text-slate-500">
              {formatFichaCode(value.numero_ficha)}
              {value.numero_documento ? ` · DNI ${value.numero_documento}` : ""}
              {value.telefono ? ` · ${value.telefono}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setQuery("");
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
            className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-slate-700"
            aria-label="Quitar paciente"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <span className="mb-1 block text-label text-slate-700">
          {label}
          {required ? " *" : ""}
        </span>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (results.length > 0 || query.trim().length > 0) setOpen(true);
          }}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          className={`w-full rounded-lg border border-slate-300 py-2 pl-9 pr-9 text-sm transition-smooth focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 ${inputClassName}`}
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
        )}
      </div>
      {open && query.trim().length > 0 && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-dropdown">
          {loading && results.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-slate-400">Buscando…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-slate-500">No se encontraron pacientes</p>
          ) : (
            results.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onChange(p);
                  setQuery("");
                  setOpen(false);
                  setResults([]);
                }}
                className="flex w-full items-start justify-between gap-2 border-b border-slate-50 px-3 py-2.5 text-left text-sm last:border-0 hover:bg-brand-50"
              >
                <span className="min-w-0">
                  <span className="block font-medium text-slate-800">
                    {p.nombres} {p.apellidos}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    <span className="font-mono tracking-wide">{formatFichaCode(p.numero_ficha)}</span>
                    {p.numero_documento ? ` · DNI ${p.numero_documento}` : ""}
                    {p.telefono ? ` · ${p.telefono}` : ""}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
