"use client";

import { format12hToHHmm, parseHHmmTo12h, type DayPeriod } from "@/lib/datetime";

const selectClass =
  "rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm transition-smooth focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600";

interface Time12hSelectProps {
  label: string;
  value: string; // HH:MM 24h (API)
  onChange: (hhmm: string) => void;
  required?: boolean;
  disabled?: boolean;
  id?: string;
}

/**
 * Selector fijo de 12 horas (a. m. / p. m.) para Perú.
 * Internamente guarda HH:MM en 24h para Agenda y API.
 */
export function Time12hSelect({
  label,
  value,
  onChange,
  required,
  disabled,
  id,
}: Time12hSelectProps) {
  const parts = parseHHmmTo12h(value);

  const emit = (hour12: number, minute: number, period: DayPeriod) => {
    onChange(format12hToHHmm(hour12, minute, period));
  };

  return (
    <label className="block" id={id}>
      <span className="mb-1 block text-label text-slate-700">
        {label}
        {required ? " *" : ""}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={`${label} hora`}
          value={parts.hour12}
          required={required}
          disabled={disabled}
          onChange={(e) => emit(Number(e.target.value), parts.minute, parts.period)}
          className={`${selectClass} w-[4.5rem] disabled:cursor-not-allowed disabled:bg-slate-50`}
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <span className="text-slate-400" aria-hidden>
          :
        </span>
        <select
          aria-label={`${label} minutos`}
          value={parts.minute}
          required={required}
          disabled={disabled}
          onChange={(e) => emit(parts.hour12, Number(e.target.value), parts.period)}
          className={`${selectClass} w-[4.5rem] disabled:cursor-not-allowed disabled:bg-slate-50`}
        >
          {Array.from({ length: 60 }, (_, m) => m).map((m) => (
            <option key={m} value={m}>
              {String(m).padStart(2, "0")}
            </option>
          ))}
        </select>
        <select
          aria-label={`${label} periodo`}
          value={parts.period}
          required={required}
          disabled={disabled}
          onChange={(e) => emit(parts.hour12, parts.minute, e.target.value as DayPeriod)}
          className={`${selectClass} min-w-[5.5rem] disabled:cursor-not-allowed disabled:bg-slate-50`}
        >
          <option value="am">a. m.</option>
          <option value="pm">p. m.</option>
        </select>
      </div>
      <p className="mt-1 text-help text-slate-400">Formato 12 horas (Perú)</p>
    </label>
  );
}
