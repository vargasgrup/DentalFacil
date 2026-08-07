"use client";

import { FICHA_TABS } from "./constants";
import type { FichaTab } from "./types";

interface FichaTabNavProps {
  activeTab: FichaTab;
  onTabChange: (tab: FichaTab) => void;
}

/**
 * Tres opciones independientes de la ficha (no un solo "segment control").
 * Cada bloque se lee como sección distinta del expediente.
 */
export function FichaTabNav({ activeTab, onTabChange }: FichaTabNavProps) {
  return (
    <nav aria-label="Secciones de la ficha clínica">
      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-3"
        role="tablist"
      >
        {FICHA_TABS.map((tab, index) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              id={`ficha-tab-${tab.id}`}
              aria-controls={`ficha-panel-${tab.id}`}
              title={tab.description}
              onClick={() => onTabChange(tab.id)}
              className={[
                "group relative flex min-h-[4.5rem] flex-col items-start justify-center rounded-xl border-2 px-4 py-3 text-left transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
                active
                  ? "border-brand-600 bg-brand-600 text-white shadow-md shadow-brand-600/25"
                  : "border-slate-200 bg-white text-slate-800 shadow-sm hover:border-brand-300 hover:bg-brand-50/40",
              ].join(" ")}
            >
              <span
                className={[
                  "mb-1 inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-md px-1.5 text-[11px] font-bold tabular-nums",
                  active
                    ? "bg-white/20 text-white"
                    : "bg-slate-100 text-slate-500 group-hover:bg-brand-100 group-hover:text-brand-700",
                ].join(" ")}
              >
                {index + 1}
              </span>
              <span className="block text-sm font-bold leading-tight tracking-tight">
                {tab.label}
              </span>
              <span
                className={[
                  "mt-1 block text-[11px] font-medium leading-snug",
                  active ? "text-white/90" : "text-slate-500",
                ].join(" ")}
              >
                {tab.description}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
