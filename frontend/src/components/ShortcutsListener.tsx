"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { canAccessModule, type AppModule } from "@/lib/roles";
import {
  eventToCombo,
  loadShortcutMap,
  resolveCombo,
  SHORTCUT_DEFS,
  type ShortcutId,
  type ShortcutMap,
} from "@/lib/shortcuts";
import { useSidebar } from "@/components/SidebarContext";
import { useUiPreferences } from "@/lib/uiPreferences";

function focusGlobalSearch() {
  const el = document.querySelector<HTMLInputElement>(
    'input[aria-label="Buscar y abrir ficha clínica"]'
  );
  if (el) {
    el.focus();
    el.select();
  }
}

/**
 * Escucha atajos globales. Debe montarse dentro de Auth + Sidebar + UiPreferences.
 */
export function ShortcutsListener({ children }: { children?: ReactNode }) {
  const router = useRouter();
  const { user } = useAuth();
  const { cycleMode } = useSidebar();
  const { density, setDensity } = useUiPreferences();
  const [map, setMap] = useState<ShortcutMap>({});

  useEffect(() => {
    setMap(loadShortcutMap());
    const onStorage = (e: StorageEvent) => {
      if (e.key === "nk-ds:ui:shortcuts") setMap(loadShortcutMap());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    const run = (id: ShortcutId) => {
      switch (id) {
        case "buscar-global":
          focusGlobalSearch();
          break;
        case "ir-dashboard":
          router.push("/dashboard");
          break;
        case "ir-pacientes":
          router.push("/pacientes");
          break;
        case "ir-agenda":
          router.push("/agenda");
          break;
        case "abrir-caja":
        case "cobrar":
          router.push("/caja");
          break;
        case "ir-reportes":
          router.push("/reportes");
          break;
        case "ir-configuracion":
          router.push("/configuracion");
          break;
        case "nuevo-paciente":
          router.push("/pacientes/nuevo");
          break;
        case "toggle-sidebar":
          cycleMode();
          break;
        case "toggle-density":
          setDensity(density === "compact" ? "comfortable" : "compact");
          break;
        default:
          break;
      }
    };

    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      const typing =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        t?.isContentEditable;
      const combo = eventToCombo(e);

      for (const def of SHORTCUT_DEFS) {
        if (combo !== resolveCombo(def.id, map)) continue;
        if (def.module && !canAccessModule(user, def.module as AppModule)) {
          continue;
        }
        if (typing && def.id !== "buscar-global") continue;
        e.preventDefault();
        run(def.id);
        break;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [map, router, cycleMode, density, setDensity, user]);

  return <>{children}</>;
}
