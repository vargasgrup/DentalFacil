"use client";

import { forwardRef, useEffect, useState } from "react";
import { Check } from "lucide-react";
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
 * Multi-select de especialidades: chips en flow (sin caja con scroll).
 * Responsive: se reacomoda al ancho disponible en escritorio y móvil.
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
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <span className="text-label text-slate-700">{label}</span>
            <span className="text-[11px] font-medium tabular-nums text-slate-400">
              {selected.length === 0
                ? "Opcional · ninguna elegida"
                : selected.length === 1
                  ? "1 elegida"
                  : `${selected.length} elegidas`}
            </span>
          </div>
        ) : null}

        <div
          role="group"
          aria-label={label || "Especialidades"}
          className="flex flex-wrap gap-2"
        >
          {catalog.map((esp) => {
            const on = selected.includes(esp);
            return (
              <button
                key={esp}
                type="button"
                aria-pressed={on}
                disabled={disabled}
                onClick={() => toggle(esp)}
                className={[
                  "inline-flex max-w-full items-center gap-1.5 rounded-lg border px-3 py-2 text-left text-[13px] font-medium leading-snug transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1",
                  on
                    ? "border-brand-600 bg-brand-600 text-white shadow-sm shadow-brand-600/20"
                    : "border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50/60",
                  disabled ? "cursor-not-allowed opacity-55" : "cursor-pointer",
                ].join(" ")}
              >
                <span
                  className={[
                    "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                    on
                      ? "border-white/40 bg-white/20 text-white"
                      : "border-slate-300 bg-slate-50 text-transparent",
                  ].join(" ")}
                  aria-hidden
                >
                  <Check className="h-2.5 w-2.5 stroke-[3]" />
                </span>
                <span className="min-w-0">{esp}</span>
              </button>
            );
          })}
        </div>

        {hint ? <p className="mt-2 text-help text-slate-500">{hint}</p> : null}
      </div>
    );
  }
);
