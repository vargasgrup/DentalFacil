"use client";

import { APP_MAIN_STICKY_CLASS } from "@/components/shell";
import { FICHA_TABS } from "./constants";
import type { FichaTab } from "./types";

interface FichaTabNavProps {
  activeTab: FichaTab;
  onTabChange: (tab: FichaTab) => void;
}

/**
 * Tabs de ficha clínica — anclados al scroll de `.app-main` (no al viewport).
 * No usan top-16: el topbar del shell no forma parte del scrollport.
 */
export function FichaTabNav({ activeTab, onTabChange }: FichaTabNavProps) {
  return (
    <div
      className={`${APP_MAIN_STICKY_CLASS} border-b border-slate-200 py-3`}
      data-sticky-chrome="ficha-tabs"
    >
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
