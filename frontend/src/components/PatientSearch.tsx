"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { formatFichaCode } from "@/lib/ficha";

interface SearchResult {
  id: number;
  numero_ficha: number;
  nombres: string;
  apellidos: string;
  telefono?: string;
  numero_documento?: string;
}

export function PatientSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
    if (query.trim().length < 1) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await apiFetch<SearchResult[]>(
          `/api/patients/search?q=${encodeURIComponent(query)}`
        );
        setResults(data);
        setOpen(true);
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const selectPatient = (p: SearchResult) => {
    router.push(`/pacientes/${p.id}`);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Buscar paciente por nombre, DNI o nº ficha..."
        className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
      />
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {results.map((p) => (
            <button
              key={p.id}
              onClick={() => selectPatient(p)}
              className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-brand-50"
            >
              <span>
                <span className="font-medium">{p.nombres} {p.apellidos}</span>
                <span className="ml-2 font-mono text-xs tracking-wide text-slate-400">
                  {formatFichaCode(p.numero_ficha)}
                </span>
              </span>
              <span className="text-xs text-slate-400">{p.telefono || p.numero_documento || ""}</span>
            </button>
          ))}
        </div>
      )}
      {open && !loading && results.length === 0 && query.trim().length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-400 shadow-lg">
          No se encontraron pacientes
        </div>
      )}
    </div>
  );
}
