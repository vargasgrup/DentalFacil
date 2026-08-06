"use client";

import { Monitor, Rows2, Rows3 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  useUiPreferences,
  type UiDensity,
} from "@/lib/uiPreferences";
import { useSidebar, type SidebarMode } from "@/components/SidebarContext";

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
    help: "Oculta la barra; se superpone al tocar el botón de menú (útil en tablets).",
  },
];

export function UiAppearancePanel() {
  const { density, setDensity, resetUiPreferences } = useUiPreferences();
  const { mode, setMode } = useSidebar();

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
              Ajuste local a este equipo. Se aplica al instante y se guarda en el
              navegador.
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
        <h3 className="text-sm font-semibold text-slate-800">
          Barra de navegación
        </h3>
        <p className="mt-0.5 text-help text-slate-500">
          Expandida, compacta (íconos) o flotante. Preferencia por equipo (
          <code className="text-xs">nk-ds:ui:panel:sidebar</code>).
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

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" onClick={resetUiPreferences}>
          Restaurar preferencias de interfaz
        </Button>
        <p className="text-help text-slate-400">
          No afecta datos clínicos ni sesión de usuario.
        </p>
      </div>
    </div>
  );
}
