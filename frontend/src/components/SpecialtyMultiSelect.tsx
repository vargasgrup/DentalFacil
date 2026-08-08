"use client";

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MutableRefObject,
} from "react";
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
 * Selector múltiple de especialidades (ficha / alta).
 * Todas las opciones visibles en chips/toggle — sin listbox con scrollbar.
 * La especialidad por visita sigue en Agenda / Evolución.
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
    const autoId = useId();
    const fieldId = id || autoId;
    const panelId = `${fieldId}-options`;
    const rootRef = useRef<HTMLDivElement | null>(null);
    const firstBtnRef = useRef<HTMLButtonElement | null>(null);
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
          /* catálogo por defecto */
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

    const setRefs = (node: HTMLDivElement | null) => {
      rootRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as MutableRefObject<HTMLDivElement | null>).current = node;
      // Focus del “siguiente campo” en el alta: enfocar primera opción
      if (node) {
        Object.defineProperty(node, "focus", {
          configurable: true,
          value: () => firstBtnRef.current?.focus(),
        });
      }
    };

    const onChipKey = (e: KeyboardEvent<HTMLButtonElement>, esp: string, index: number) => {
      if (disabled) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle(esp);
        return;
      }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        const next = rootRef.current?.querySelectorAll<HTMLButtonElement>(
          "button[data-specialty-chip]"
        );
        next?.[Math.min(index + 1, (next?.length || 1) - 1)]?.focus();
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        const prev = rootRef.current?.querySelectorAll<HTMLButtonElement>(
          "button[data-specialty-chip]"
        );
        prev?.[Math.max(index - 1, 0)]?.focus();
      }
    };

    return (
      <div ref={setRefs} className={`block ${className}`} id={fieldId}>
        {label ? (
          <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
            <span className="text-label text-slate-700" id={`${fieldId}-label`}>
              {label}
            </span>
            <span className="text-[11px] tabular-nums text-slate-400" aria-live="polite">
              {selected.length === 0
                ? "Ninguna marcada"
                : selected.length === 1
                  ? "1 marcada"
                  : `${selected.length} marcadas`}
            </span>
          </div>
        ) : null}

        <div
          id={panelId}
          role="group"
          aria-labelledby={label ? `${fieldId}-label` : undefined}
          aria-multiselectable="true"
          className={[
            "rounded-xl border border-slate-200 bg-slate-50/80 p-2.5 sm:p-3",
            disabled ? "opacity-60" : "",
          ].join(" ")}
        >
          <div className="flex flex-wrap gap-2">
            {catalog.map((esp, index) => {
              const on = selected.includes(esp);
              return (
                <button
                  key={esp}
                  ref={index === 0 ? firstBtnRef : undefined}
                  type="button"
                  data-specialty-chip
                  role="checkbox"
                  aria-checked={on}
                  disabled={disabled}
                  onClick={() => toggle(esp)}
                  onKeyDown={(e) => onChipKey(e, esp, index)}
                  className={[
                    "inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-[13px] leading-snug transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1",
                    on
                      ? "border-brand-500 bg-brand-50 font-medium text-brand-900 shadow-sm shadow-brand-900/5"
                      : "border-slate-200 bg-white font-normal text-slate-700 hover:border-slate-300 hover:bg-white",
                    disabled ? "cursor-not-allowed" : "cursor-pointer",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      on
                        ? "border-brand-600 bg-brand-600 text-white"
                        : "border-slate-300 bg-white",
                    ].join(" ")}
                    aria-hidden
                  >
                    {on ? <Check className="h-2.5 w-2.5 stroke-[3]" /> : null}
                  </span>
                  <span className="min-w-0">{esp}</span>
                </button>
              );
            })}
          </div>
        </div>

        {hint ? <p className="mt-1.5 text-help text-slate-500">{hint}</p> : null}
      </div>
    );
  }
);
