"use client";

import { FICHA_TABS } from "./constants";
import type { FichaTab } from "./types";

interface FichaTabNavProps {
  activeTab: FichaTab;
  onTabChange: (tab: FichaTab) => void;
}

/**
 * Segmentos de sección — flujo de documento (no sticky / no panel fijo).
 * Diseño compacto tipo module-seg: una fila, sin tarjetas altas.
 */
export function FichaTabNav({ activeTab, onTabChange }: FichaTabNavProps) {
  return (
    <nav
      className="border-b border-slate-200 pb-3"
      aria-label="Secciones de la ficha clínica"
    >
      <div
        className="module-seg ficha-seg inline-flex max-w-full flex-wrap"
        role="tablist"
      >
        {FICHA_TABS.map((tab) => {
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
              className={`module-seg__btn ficha-seg__btn ${active ? "is-active" : ""}`}
            >
              <span className="block font-semibold leading-tight">{tab.label}</span>
              <span
                className={`mt-0.5 hidden text-[11px] font-normal leading-snug sm:block ${
                  active ? "text-white/85" : "text-slate-500"
                }`}
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
