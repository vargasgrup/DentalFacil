"use client";

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type MutableRefObject,
} from "react";
import { Check, ChevronDown, X } from "lucide-react";
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
 * Desplegable multi-selección de especialidades (ficha / alta).
 * La especialidad por visita (cita o evolución en una fecha) sigue en Agenda/Evolución.
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
    const listId = `${fieldId}-listbox`;
    const rootRef = useRef<HTMLDivElement | null>(null);
    const [options, setOptions] = useState<string[]>([...ESPECIALIDADES_ODONTOLOGICAS]);
    const [open, setOpen] = useState(false);
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
          /* fallback */
        });
      return () => {
        cancelled = true;
      };
    }, []);

    useEffect(() => {
      if (!open) return;
      const onDoc = (e: globalThis.MouseEvent) => {
        const el = rootRef.current;
        if (el && e.target instanceof Node && !el.contains(e.target)) {
          setOpen(false);
        }
      };
      const onKey = (e: globalThis.KeyboardEvent) => {
        if (e.key === "Escape") setOpen(false);
      };
      document.addEventListener("mousedown", onDoc);
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("mousedown", onDoc);
        document.removeEventListener("keydown", onKey);
      };
    }, [open]);

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

    const remove = (esp: string, e: MouseEvent) => {
      e.stopPropagation();
      if (disabled) return;
      onChange(selected.filter((x) => x !== esp));
    };

    const summary =
      selected.length === 0
        ? "Seleccionar especialidades…"
        : selected.length === 1
          ? selected[0]
          : `${selected.length} especialidades`;

    const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setOpen(true);
      }
    };

    const setRefs = (node: HTMLDivElement | null) => {
      rootRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as MutableRefObject<HTMLDivElement | null>).current = node;
    };

    return (
      <div ref={setRefs} className={`block ${className}`} id={fieldId}>
        {label ? (
          <span className="mb-1 block text-label text-slate-700">{label}</span>
        ) : null}

        <div className="relative">
          <button
            type="button"
            id={`${fieldId}-trigger`}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={listId}
            disabled={disabled}
            onClick={() => !disabled && setOpen((v) => !v)}
            onKeyDown={onTriggerKey}
            className={[
              "flex w-full min-h-[2.625rem] items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2 text-left text-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1",
              open
                ? "border-brand-500 ring-1 ring-brand-500/30"
                : "border-slate-300 hover:border-slate-400",
              disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
            ].join(" ")}
          >
            <span
              className={[
                "min-w-0 flex-1 truncate font-medium",
                selected.length ? "text-slate-800" : "text-slate-400 font-normal",
              ].join(" ")}
            >
              {summary}
            </span>
            <ChevronDown
              className={[
                "h-4 w-4 shrink-0 text-slate-400 transition-transform",
                open ? "rotate-180 text-brand-600" : "",
              ].join(" ")}
              aria-hidden
            />
          </button>

          {open && (
            <div
              id={listId}
              role="listbox"
              aria-multiselectable="true"
              aria-labelledby={`${fieldId}-trigger`}
              className="absolute left-0 right-0 z-40 mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg shadow-slate-900/10"
            >
              {catalog.map((esp) => {
                const on = selected.includes(esp);
                return (
                  <button
                    key={esp}
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => toggle(esp)}
                    className={[
                      "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors",
                      on
                        ? "bg-brand-50 text-brand-900"
                        : "text-slate-700 hover:bg-slate-50",
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
                      {on ? <Check className="h-3 w-3 stroke-[3]" /> : null}
                    </span>
                    <span className="min-w-0 leading-snug">{esp}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {selected.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {selected.map((esp) => (
              <span
                key={esp}
                className="inline-flex max-w-full items-center gap-1 rounded-md border border-brand-100 bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-800"
              >
                <span className="min-w-0 truncate">{esp}</span>
                {!disabled ? (
                  <button
                    type="button"
                    className="rounded p-0.5 text-brand-600/70 hover:bg-brand-100 hover:text-brand-900"
                    aria-label={`Quitar ${esp}`}
                    onClick={(e) => remove(esp, e)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </span>
            ))}
          </div>
        ) : null}

        {hint ? <p className="mt-1.5 text-help text-slate-500">{hint}</p> : null}
      </div>
    );
  }
);
