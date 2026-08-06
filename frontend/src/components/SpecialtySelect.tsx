"use client";

import { forwardRef, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ESPECIALIDADES_ODONTOLOGICAS } from "@/lib/especialidades";

interface SpecialtySelectProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
  className?: string;
  /** Incluye opción vacía "Seleccionar…" */
  allowEmpty?: boolean;
  id?: string;
  /** Texto de ayuda bajo el select */
  hint?: string;
}

/**
 * Selector de especialidad odontológica (catálogo del centro).
 */
export const SpecialtySelect = forwardRef<HTMLSelectElement, SpecialtySelectProps>(
  function SpecialtySelect(
    {
      value,
      onChange,
      label = "Especialidad",
      required = false,
      className = "",
      allowEmpty = true,
      id,
      hint,
    },
    ref
  ) {
    const [options, setOptions] = useState<string[]>([...ESPECIALIDADES_ODONTOLOGICAS]);

    useEffect(() => {
      let cancelled = false;
      apiFetch<{ items: string[] }>("/api/config/especialidades")
        .then((data) => {
          if (!cancelled && Array.isArray(data.items) && data.items.length > 0) {
            setOptions(data.items);
          }
        })
        .catch(() => {
          /* fallback al catálogo por defecto */
        });
      return () => {
        cancelled = true;
      };
    }, []);

    const known = options.includes(value);
    const legacy = value && !known ? value : null;

    return (
      <label className={`block ${className}`}>
        {label && (
          <span className="mb-1 block text-label text-slate-700">
            {label}
            {required ? " *" : ""}
          </span>
        )}
        <select
          ref={ref}
          id={id}
          value={value}
          required={required}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm transition-smooth focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
        >
          {allowEmpty && <option value="">Seleccionar…</option>}
          {legacy && (
            <option value={legacy}>
              {legacy} (anterior)
            </option>
          )}
          {options.map((esp) => (
            <option key={esp} value={esp}>
              {esp}
            </option>
          ))}
        </select>
        {hint ? <p className="mt-1 text-help text-slate-500">{hint}</p> : null}
      </label>
    );
  }
);
