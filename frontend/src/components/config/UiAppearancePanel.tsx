"use client";

import { useMemo, useState } from "react";
import {
  Keyboard,
  Monitor,
  Rows2,
  Rows3,
  Type,
  Contrast,
  PersonStanding,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  useUiPreferences,
  type ContrastMode,
  type FontScale,
  type UiDensity,
} from "@/lib/uiPreferences";
import { useSidebar, type SidebarMode } from "@/components/SidebarContext";
import {
  SHORTCUT_DEFS,
  findShortcutConflicts,
  loadShortcutMap,
  resetShortcutMap,
  resolveCombo,
  saveShortcutMap,
  type ShortcutId,
  type ShortcutMap,
} from "@/lib/shortcuts";

const DENSITY: { id: UiDensity; label: string; help: string }[] = [
  {
    id: "comfortable",
    label: "Cómoda",
    help: "Espaciado actual del sistema (recomendada en monitores de escritorio).",
  },
  {
    id: "compact",
    label: "Compacta",
    help: "Más filas visibles en tablas (pacientes, caja, agenda).",
  },
];

const SIDEBAR: { id: SidebarMode; label: string; help: string }[] = [
  {
    id: "expanded",
    label: "Expandida",
    help: "Barra con texto e íconos (por defecto).",
  },
  {
    id: "collapsed",
    label: "Compacta",
    help: "Solo íconos: gana espacio de trabajo.",
  },
  {
    id: "floating",
    label: "Flotante",
    help: "Oculta la barra; se superpone al tocar el botón de menú.",
  },
];

const SCALES: { id: FontScale; label: string }[] = [
  { id: "90", label: "90%" },
  { id: "100", label: "100%" },
  { id: "115", label: "115%" },
  { id: "130", label: "130%" },
];

function ComboCapture({
  value,
  onChange,
}: {
  value: string;
  onChange: (combo: string) => void;
}) {
  return (
    <input
      type="text"
      readOnly
      value={value}
      onKeyDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const parts: string[] = [];
        if (e.ctrlKey || e.metaKey) parts.push("ctrl");
        if (e.altKey) parts.push("alt");
        if (e.shiftKey) parts.push("shift");
        const key = e.key.toLowerCase();
        if (["control", "alt", "shift", "meta"].includes(key)) return;
        parts.push(key === " " ? "space" : key);
        onChange(parts.join("+"));
      }}
      className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      placeholder="Pulse teclas…"
      aria-label="Capturar combinación de teclas"
    />
  );
}

export function UiAppearancePanel() {
  const {
    density,
    setDensity,
    fontScale,
    setFontScale,
    reducedMotion,
    setReducedMotion,
    contrast,
    setContrast,
    resetUiPreferences,
  } = useUiPreferences();
  const { mode, setMode } = useSidebar();
  const [map, setMap] = useState<ShortcutMap>(() => loadShortcutMap());
  const conflicts = useMemo(() => findShortcutConflicts(map), [map]);

  const setCombo = (id: ShortcutId, combo: string) => {
    const next = { ...map, [id]: combo };
    setMap(next);
    saveShortcutMap(next);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card sm:p-5">
        <div className="mb-3 flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <Monitor className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800">
              Densidad de interfaz
            </h3>
            <p className="mt-0.5 text-help text-slate-500">
              Ajuste local a este equipo. Se aplica al instante.
            </p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {DENSITY.map((d) => {
            const active = density === d.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setDensity(d.id)}
                className={`rounded-xl border px-3 py-3 text-left transition-smooth ${
                  active
                    ? "border-brand-400 bg-brand-50 shadow-sm"
                    : "border-slate-200 bg-surface-subtle hover:border-slate-300"
                }`}
                aria-pressed={active}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  {d.id === "compact" ? (
                    <Rows2 className="h-4 w-4 text-brand-600" />
                  ) : (
                    <Rows3 className="h-4 w-4 text-brand-600" />
                  )}
                  {d.label}
                </span>
                <span className="mt-1 block text-help text-slate-500">
                  {d.help}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <Type className="h-4 w-4 text-brand-600" />
          <h3 className="text-sm font-semibold text-slate-800">
            Tamaño de texto
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {SCALES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setFontScale(s.id as FontScale)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-smooth ${
                fontScale === s.id
                  ? "bg-brand-600 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
              aria-pressed={fontScale === s.id}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
          <div className="mb-2 flex items-center gap-2">
            <PersonStanding className="h-4 w-4 text-brand-600" />
            <h3 className="text-sm font-semibold text-slate-800">
              Reducir movimiento
            </h3>
          </div>
          <p className="mb-3 text-help text-slate-500">
            Desactiva animaciones (independiente del sistema operativo).
          </p>
          <button
            type="button"
            role="switch"
            aria-checked={reducedMotion}
            onClick={() => setReducedMotion(!reducedMotion)}
            className={`relative h-8 w-14 rounded-full transition-smooth ${
              reducedMotion ? "bg-brand-600" : "bg-slate-300"
            }`}
          >
            <span
              className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                reducedMotion ? "left-7" : "left-1"
              }`}
            />
          </button>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
          <div className="mb-2 flex items-center gap-2">
            <Contrast className="h-4 w-4 text-brand-600" />
            <h3 className="text-sm font-semibold text-slate-800">
              Alto contraste
            </h3>
          </div>
          <p className="mb-3 text-help text-slate-500">
            Mejora legibilidad (ratiosos AA+). No solo invierte colores.
          </p>
          <div className="flex gap-2">
            {(
              [
                ["default", "Normal"],
                ["high", "Alto"],
              ] as [ContrastMode, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setContrast(id)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                  contrast === id
                    ? "bg-brand-600 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card sm:p-5">
        <h3 className="text-sm font-semibold text-slate-800">
          Barra de navegación
        </h3>
        <p className="mt-0.5 text-help text-slate-500">
          Expandida, compacta (íconos) o flotante.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {SIDEBAR.map((s) => {
            const active = mode === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setMode(s.id)}
                className={`rounded-xl border px-3 py-3 text-left transition-smooth ${
                  active
                    ? "border-brand-400 bg-brand-50 shadow-sm"
                    : "border-slate-200 bg-surface-subtle hover:border-slate-300"
                }`}
                aria-pressed={active}
              >
                <span className="text-sm font-semibold text-slate-800">
                  {s.label}
                </span>
                <span className="mt-1 block text-help text-slate-500">
                  {s.help}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <Keyboard className="h-4 w-4 text-brand-600" />
          <h3 className="text-sm font-semibold text-slate-800">
            Atajos de teclado
          </h3>
        </div>
        <p className="mb-3 text-help text-slate-500">
          Clic en el campo y pulse la combinación. Respeta permisos de módulo.
        </p>
        {conflicts.length > 0 && (
          <p className="mb-2 text-xs text-warning-700">
            Conflictos: {conflicts.join(" · ")}
          </p>
        )}
        <ul className="divide-y divide-slate-100">
          {SHORTCUT_DEFS.map((def) => (
            <li
              key={def.id}
              className="grid grid-cols-1 items-center gap-2 py-2 sm:grid-cols-[1fr_10rem]"
            >
              <div>
                <p className="text-sm font-medium text-slate-800">{def.label}</p>
                <p className="text-help text-slate-400">
                  Por defecto: {def.defaultCombo}
                </p>
              </div>
              <ComboCapture
                value={resolveCombo(def.id, map)}
                onChange={(c) => setCombo(def.id, c)}
              />
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant="secondary"
          className="mt-3"
          onClick={() => {
            resetShortcutMap();
            setMap({});
          }}
        >
          Restaurar atajos
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" onClick={resetUiPreferences}>
          Restaurar preferencias visuales
        </Button>
        <p className="text-help text-slate-400">
          No afecta datos clínicos ni sesión.
        </p>
      </div>
    </div>
  );
}
