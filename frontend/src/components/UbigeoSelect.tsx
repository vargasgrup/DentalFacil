"use client";

import ubigeo from "@/lib/ubigeo-peru.json";

type UbigeoTree = Record<string, Record<string, string[]>>;

const TREE = ubigeo.tree as UbigeoTree;
const DEPARTAMENTOS = ubigeo.departamentos as string[];

export interface UbigeoValue {
  departamento: string;
  provincia: string;
  distrito: string;
}

interface UbigeoSelectProps {
  value: UbigeoValue;
  onChange: (next: UbigeoValue) => void;
  disabled?: boolean;
  className?: string;
  /** Clase CSS compartida para los <select> */
  selectClassName?: string;
}

function selectClass(extra = "") {
  return `w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm transition-smooth focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 disabled:bg-slate-50 disabled:text-slate-400 ${extra}`;
}

/**
 * Selector en cascada UBIGEO Perú: Departamento → Provincia → Distrito.
 */
export function UbigeoSelect({
  value,
  onChange,
  disabled = false,
  className = "",
  selectClassName = "",
}: UbigeoSelectProps) {
  const provincias = value.departamento
    ? Object.keys(TREE[value.departamento] || {}).sort((a, b) =>
        a.localeCompare(b, "es")
      )
    : [];
  const distritos =
    value.departamento && value.provincia
      ? [...(TREE[value.departamento]?.[value.provincia] || [])].sort((a, b) =>
          a.localeCompare(b, "es")
        )
      : [];

  // Si hay valor legacy fuera del catálogo, se muestra como opción extra
  const depOptions = [...DEPARTAMENTOS];
  if (value.departamento && !depOptions.includes(value.departamento)) {
    depOptions.unshift(value.departamento);
  }
  const provOptions = [...provincias];
  if (value.provincia && !provOptions.includes(value.provincia)) {
    provOptions.unshift(value.provincia);
  }
  const distOptions = [...distritos];
  if (value.distrito && !distOptions.includes(value.distrito)) {
    distOptions.unshift(value.distrito);
  }

  return (
    <div className={`grid grid-cols-1 gap-3 sm:grid-cols-3 ${className}`}>
      <label className="block">
        <span className="mb-1 block text-label text-slate-700">Departamento</span>
        <select
          value={value.departamento}
          disabled={disabled}
          onChange={(e) =>
            onChange({
              departamento: e.target.value,
              provincia: "",
              distrito: "",
            })
          }
          className={selectClass(selectClassName)}
        >
          <option value="">Seleccionar…</option>
          {depOptions.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-label text-slate-700">Provincia</span>
        <select
          value={value.provincia}
          disabled={disabled || !value.departamento}
          onChange={(e) =>
            onChange({
              ...value,
              provincia: e.target.value,
              distrito: "",
            })
          }
          className={selectClass(selectClassName)}
        >
          <option value="">
            {value.departamento ? "Seleccionar…" : "Elija departamento"}
          </option>
          {provOptions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-label text-slate-700">Distrito</span>
        <select
          value={value.distrito}
          disabled={disabled || !value.provincia}
          onChange={(e) =>
            onChange({
              ...value,
              distrito: e.target.value,
            })
          }
          className={selectClass(selectClassName)}
        >
          <option value="">
            {value.provincia ? "Seleccionar…" : "Elija provincia"}
          </option>
          {distOptions.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
