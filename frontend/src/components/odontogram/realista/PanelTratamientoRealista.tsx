"use client";

import { ODONTOGRAM_CONDITIONS, type SurfaceKey } from "@/lib/odontogramConditions";
import { Button } from "@/components/ui/Button";
import { etiquetaCondicion } from "./DienteImagenReal";
import { labelVista, NOMBRE_DIENTE } from "./mapeoDientesRealista";
import type { VistaDiente } from "./cargadorImagenes";

const SURF_LABEL: Record<SurfaceKey, string> = {
  M: "Mesial",
  D: "Distal",
  V: "Vestibular",
  L: "Lingual/Palatino",
  O: "Oclusal/Incisal",
};

export function PanelTratamientoRealista({
  pieza,
  tool,
  setTool,
  vista,
  setVista,
  estado,
  superficies,
  notas,
  setNotas,
  onSaveNotas,
  onMarcarAusente,
  onLimpiar,
  onSano,
  onProponer,
  saving,
}: {
  pieza: string | null;
  tool: string;
  setTool: (id: string) => void;
  vista: VistaDiente;
  setVista: (v: VistaDiente) => void;
  estado: string | null;
  superficies: Record<SurfaceKey, string | null>;
  notas: string;
  setNotas: (v: string) => void;
  onSaveNotas: () => void;
  onMarcarAusente: () => void;
  onLimpiar: () => void;
  onSano: () => void;
  onProponer: () => void;
  saving?: boolean;
}) {
  if (!pieza) {
    return (
      <aside className="odontograma-realista-panel rounded-card border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-card">
        Selecciona un diente para ver tratamientos y notas clínicas.
      </aside>
    );
  }

  return (
    <aside className="odontograma-realista-panel space-y-3 rounded-card border border-slate-200 bg-white p-4 shadow-card">
      <div>
        <p className="text-section-title text-slate-800">Pieza {pieza}</p>
        <p className="text-help text-slate-500">{NOMBRE_DIENTE[pieza] || "Diente"}</p>
      </div>

      <div>
        <p className="mb-1 text-label text-slate-700">Vista</p>
        <div className="flex flex-wrap gap-1">
          {(["vestibular", "lingual", "oclusal"] as VistaDiente[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVista(v)}
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-smooth ${
                vista === v
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {labelVista(v)}
            </button>
          ))}
        </div>
        <p className="mt-1 text-help text-slate-400">Doble clic en el diente también cicla la vista</p>
      </div>

      <div>
        <p className="mb-1 text-label text-slate-700">Herramienta activa</p>
        <div className="grid max-h-40 grid-cols-2 gap-1 overflow-y-auto sm:grid-cols-3">
          {ODONTOGRAM_CONDITIONS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setTool(c.id)}
              className={`rounded-lg border px-2 py-1.5 text-left text-[11px] transition-smooth ${
                tool === c.id
                  ? "border-slate-800 bg-slate-800 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
              title={c.label}
            >
              <span
                className="mr-1 inline-block h-2 w-2 rounded-full"
                style={{ background: c.color }}
                aria-hidden
              />
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg bg-surface-subtle p-2 text-help text-slate-600">
        <p>
          <strong>General:</strong> {etiquetaCondicion(estado)}
        </p>
        <ul className="mt-1 space-y-0.5">
          {(Object.keys(SURF_LABEL) as SurfaceKey[]).map((s) => (
            <li key={s}>
              {SURF_LABEL[s]}: {etiquetaCondicion(superficies[s])}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={onMarcarAusente}>
          Ausente
        </Button>
        <Button type="button" variant="secondary" onClick={onSano}>
          Sano
        </Button>
        <Button type="button" variant="ghost" onClick={onLimpiar}>
          Limpiar
        </Button>
        {estado && (
          <Button type="button" variant="primary" onClick={onProponer}>
            Proponer al plan
          </Button>
        )}
      </div>

      <div>
        <label className="mb-1 block text-label text-slate-700" htmlFor={`notas-${pieza}`}>
          Notas
        </label>
        <textarea
          id={`notas-${pieza}`}
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          placeholder="Observaciones clínicas…"
        />
        <Button
          type="button"
          className="mt-2"
          loading={saving}
          onClick={onSaveNotas}
          variant="secondary"
        >
          Guardar notas
        </Button>
      </div>
    </aside>
  );
}
