"use client";

import { forwardRef, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ESPECIALIDADES_ODONTOLOGICAS } from "@/lib/especialidades";

interface SpecialtyMultiSelectProps {
  value: string[];
  onChange: (value: string[]) => void;
  label?: string;
  className?: string;
  id?: string;
  hint?: string;
  disabled?: boolean;
}

/**
 * Selección múltiple de especialidades de atención del paciente
 * (catálogo del centro). Componente distinto de SpecialtySelect (cita/evolución = una).
 */
export const SpecialtyMultiSelect = forwardRef<HTMLDivElement, SpecialtyMultiSelectProps>(
  function SpecialtyMultiSelect(
    {
      value,
      onChange,
      label = "Especialidades de atención",
      className = "",
      id,
      hint,
      disabled = false,
    },
    ref
  ) {
    const [options, setOptions] = useState<string[]>([...ESPECIALIDADES_ODONTOLOGICAS]);
    const selected = Array.isArray(value) ? value : [];

    useEffect(() => {
      let cancelled = false;
      apiFetch<{ items: string[] }>("/api/config/especialidades")
        .then((data) => {
          if (!cancelled && Array.isArray(data.items) && data.items.length > 0) {
            setOptions(data.items);
          }
        })
        .catch(() => {
          /* fallback catálogo por defecto */
        });
      return () => {
        cancelled = true;
      };
    }, []);

    const catalog = [...options];
    for (const v of selected) {
      if (v && !catalog.includes(v)) catalog.push(v);
    }

    const toggle = (esp: string) => {
      if (disabled) return;
      if (selected.includes(esp)) {
        onChange(selected.filter((x) => x !== esp));
      } else {
        onChange([...selected, esp]);
      }
    };

    return (
      <div ref={ref} className={`block ${className}`} id={id}>
        {label ? (
          <span className="mb-1 block text-label text-slate-700">{label}</span>
        ) : null}
        <div
          role="group"
          aria-label={label || "Especialidades"}
          className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-300 bg-white p-2"
        >
          {catalog.map((esp) => {
            const on = selected.includes(esp);
            return (
              <label
                key={esp}
                className={[
                  "flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                  on ? "bg-brand-50 text-brand-900" : "hover:bg-slate-50 text-slate-700",
                  disabled ? "cursor-not-allowed opacity-60" : "",
                ].join(" ")}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  checked={on}
                  disabled={disabled}
                  onChange={() => toggle(esp)}
                />
                <span className="leading-snug">{esp}</span>
              </label>
            );
          })}
        </div>
        {selected.length > 0 ? (
          <p className="mt-1.5 text-xs font-medium text-slate-600">
            {selected.length === 1
              ? "1 especialidad seleccionada"
              : `${selected.length} especialidades seleccionadas`}
          </p>
        ) : (
          <p className="mt-1.5 text-xs text-slate-400">Ninguna seleccionada (opcional)</p>
        )}
        {hint ? <p className="mt-1 text-help text-slate-500">{hint}</p> : null}
      </div>
    );
  }
);
