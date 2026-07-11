"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ChevronsUpDown } from "lucide-react";
import {
  searchTratamientos,
  type TratamientoOdontologico,
} from "@/lib/tratamientos";

export interface TreatmentAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  /** Se dispara al elegir una sugerencia del catálogo (útil para autofill) */
  onSelect?: (tratamiento: TratamientoOdontologico) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  inputClassName?: string;
  /** Menú más compacto (filas de tabla) */
  compact?: boolean;
  id?: string;
  /** Contenido debajo del input (p. ej. VoiceDictation) */
  footer?: ReactNode;
  autoFocus?: boolean;
}

/**
 * Autocompletado predictivo de tratamientos odontológicos (catálogo Perú).
 * Permite texto libre: el usuario puede escribir algo fuera del catálogo.
 */
export function TreatmentAutocomplete({
  value,
  onChange,
  onSelect,
  label = "Tratamiento",
  placeholder = "Ej: curación, endodoncia, limpieza…",
  required = false,
  disabled = false,
  error,
  hint,
  className = "",
  inputClassName = "",
  compact = false,
  id: idProp,
  footer,
  autoFocus = false,
}: TreatmentAutocompleteProps) {
  const autoId = useId();
  const inputId = idProp || autoId;
  const listId = `${inputId}-list`;
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [menuBox, setMenuBox] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [mounted, setMounted] = useState(false);

  const matches = searchTratamientos(value, compact ? 8 : 10);
  const showList = open && !disabled && matches.length > 0 && mounted;

  useEffect(() => setMounted(true), []);

  const updateMenuBox = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setMenuBox({
      top: r.bottom + 4,
      left: r.left,
      width: Math.max(r.width, compact ? 260 : 280),
    });
  }, [compact]);

  useLayoutEffect(() => {
    if (!open) {
      setMenuBox(null);
      return;
    }
    updateMenuBox();
    window.addEventListener("scroll", updateMenuBox, true);
    window.addEventListener("resize", updateMenuBox);
    return () => {
      window.removeEventListener("scroll", updateMenuBox, true);
      window.removeEventListener("resize", updateMenuBox);
    };
  }, [open, value, updateMenuBox]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        const t = e.target as HTMLElement | null;
        if (t?.closest?.(`[data-treatment-menu="${listId}"]`)) return;
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [listId]);

  useEffect(() => {
    setHighlight(0);
  }, [value, open]);

  const pick = useCallback(
    (t: TratamientoOdontologico) => {
      onChange(t.nombre);
      onSelect?.(t);
      setOpen(false);
      inputRef.current?.blur();
    },
    [onChange, onSelect]
  );

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!showList) {
      if (e.key === "ArrowDown" && matches.length) {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && matches[highlight]) {
      e.preventDefault();
      pick(matches[highlight].tratamiento);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const menu =
    showList && menuBox
      ? createPortal(
          <ul
            id={listId}
            data-treatment-menu={listId}
            role="listbox"
            style={{
              position: "fixed",
              top: menuBox.top,
              left: menuBox.left,
              width: menuBox.width,
              zIndex: 80,
            }}
            className={`max-h-60 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg ${
              compact ? "text-xs" : "text-sm"
            }`}
          >
            {matches.map((m, i) => {
              const t = m.tratamiento;
              const active = i === highlight;
              return (
                <li
                  key={t.id}
                  id={`${listId}-${t.id}`}
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setHighlight(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(t);
                  }}
                  className={`cursor-pointer px-3 py-2 ${
                    active
                      ? "bg-brand-50 text-brand-900"
                      : "text-slate-800 hover:bg-slate-50"
                  }`}
                >
                  <div className="font-medium leading-snug">{t.nombre}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
                    <span>{t.especialidad}</span>
                    {typeof t.precio_referencial === "number" &&
                      t.precio_referencial > 0 && (
                        <span className="tabular-nums">
                          ref. S/ {t.precio_referencial.toFixed(0)}
                        </span>
                      )}
                  </div>
                </li>
              );
            })}
            {value.trim() && (
              <li className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-400">
                Puedes dejar el texto escrito si no eliges una sugerencia
              </li>
            )}
          </ul>,
          document.body
        )
      : null;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label ? (
        <label htmlFor={inputId} className="mb-1 block text-label text-slate-700">
          {label}
          {required ? " *" : ""}
        </label>
      ) : null}
      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            showList && matches[highlight]
              ? `${listId}-${matches[highlight].tratamiento.id}`
              : undefined
          }
          value={value}
          disabled={disabled}
          required={required}
          autoFocus={autoFocus}
          autoComplete="off"
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={`w-full rounded-lg border bg-white px-3 py-2 pr-9 text-sm transition-smooth focus:outline-none focus:ring-1 ${
            error
              ? "border-danger-500 focus:border-danger-500 focus:ring-danger-500"
              : "border-slate-300 focus:border-brand-500 focus:ring-brand-500"
          } ${compact ? "py-1.5" : ""} ${inputClassName}`}
        />
        <ChevronsUpDown
          className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
      </div>

      {menu}

      {error ? (
        <span className="mt-1 block text-help text-danger-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-help text-slate-500">{hint}</span>
      ) : null}

      {footer}
    </div>
  );
}
