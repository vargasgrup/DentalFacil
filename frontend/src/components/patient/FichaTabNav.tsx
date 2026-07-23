"use client";

import { FICHA_TABS } from "./constants";
import type { FichaTab } from "./types";

interface FichaTabNavProps {
  activeTab: FichaTab;
  onTabChange: (tab: FichaTab) => void;
}

export function FichaTabNav({ activeTab, onTabChange }: FichaTabNavProps) {
  return (
    <div className="sticky top-0 z-20 -mx-1 border-b border-slate-200 bg-white/95 px-1 py-3 backdrop-blur-sm">
      <div
        className="flex flex-wrap gap-2"
        role="tablist"
        aria-label="Secciones de la ficha clínica"
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
              onClick={() => onTabChange(tab.id)}
              className={`min-w-[10.5rem] flex-1 rounded-lg border px-4 py-2.5 text-left transition-smooth sm:flex-none ${
                active
                  ? "border-brand-600 bg-brand-600 text-white shadow-sm"
                  : "border-slate-300 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50"
              }`}
            >
              <span className="block text-sm font-semibold tracking-normal">
                {tab.label}
              </span>
              <span
                className={`mt-0.5 block text-xs ${
                  active ? "text-brand-100" : "text-slate-500"
                }`}
              >
                {tab.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
