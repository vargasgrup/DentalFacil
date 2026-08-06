/**
 * Registro central de atajos de teclado (N&K DentalSoft).
 * Personalizables vía localStorage nk-ds:ui:shortcuts
 */

import type { AppModule } from "./roles";

export type ShortcutId =
  | "nuevo-paciente"
  | "ir-agenda"
  | "abrir-caja"
  | "buscar-global"
  | "ir-dashboard"
  | "ir-pacientes"
  | "ir-reportes"
  | "ir-configuracion"
  | "cobrar"
  | "toggle-sidebar"
  | "toggle-density";

export interface ShortcutDef {
  id: ShortcutId;
  label: string;
  /** Módulo requerido (null = siempre) */
  module: AppModule | null;
  /** combo por defecto: "ctrl+k", "alt+n", etc. */
  defaultCombo: string;
}

export const SHORTCUT_DEFS: ShortcutDef[] = [
  {
    id: "buscar-global",
    label: "Enfocar búsqueda global",
    module: null,
    defaultCombo: "ctrl+k",
  },
  {
    id: "ir-dashboard",
    label: "Ir a Inicio",
    module: "dashboard",
    defaultCombo: "alt+1",
  },
  {
    id: "ir-pacientes",
    label: "Ir a Pacientes",
    module: "pacientes",
    defaultCombo: "alt+2",
  },
  {
    id: "ir-agenda",
    label: "Ir a Agenda",
    module: "agenda",
    defaultCombo: "alt+3",
  },
  {
    id: "abrir-caja",
    label: "Ir a Caja",
    module: "caja",
    defaultCombo: "alt+4",
  },
  {
    id: "ir-reportes",
    label: "Ir a Reportes",
    module: "reportes",
    defaultCombo: "alt+5",
  },
  {
    id: "ir-configuracion",
    label: "Ir a Configuración",
    module: "configuracion",
    defaultCombo: "alt+,",
  },
  {
    id: "nuevo-paciente",
    label: "Nuevo paciente",
    module: "pacientes",
    defaultCombo: "alt+n",
  },
  {
    id: "cobrar",
    label: "Ir a Cobrar (Caja)",
    module: "caja",
    defaultCombo: "alt+c",
  },
  {
    id: "toggle-sidebar",
    label: "Cambiar modo de barra lateral",
    module: null,
    defaultCombo: "alt+b",
  },
  {
    id: "toggle-density",
    label: "Alternar densidad compacta",
    module: null,
    defaultCombo: "alt+d",
  },
];

const STORAGE_KEY = "nk-ds:ui:shortcuts";

export type ShortcutMap = Partial<Record<ShortcutId, string>>;

export function loadShortcutMap(): ShortcutMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ShortcutMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveShortcutMap(map: ShortcutMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function resolveCombo(id: ShortcutId, map?: ShortcutMap): string {
  const m = map ?? loadShortcutMap();
  const custom = m[id];
  if (custom && custom.trim()) return custom.trim().toLowerCase();
  const def = SHORTCUT_DEFS.find((d) => d.id === id);
  return (def?.defaultCombo || "").toLowerCase();
}

export function eventToCombo(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  const key = e.key.toLowerCase();
  if (["control", "alt", "shift", "meta"].includes(key)) return parts.join("+");
  parts.push(key === " " ? "space" : key);
  return parts.join("+");
}

export function findShortcutConflicts(map: ShortcutMap): string[] {
  const used = new Map<string, ShortcutId[]>();
  for (const def of SHORTCUT_DEFS) {
    const combo = resolveCombo(def.id, map);
    if (!combo) continue;
    const list = used.get(combo) || [];
    list.push(def.id);
    used.set(combo, list);
  }
  const conflicts: string[] = [];
  for (const [combo, ids] of used) {
    if (ids.length > 1) {
      conflicts.push(`${combo}: ${ids.join(", ")}`);
    }
  }
  return conflicts;
}

export function resetShortcutMap() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
