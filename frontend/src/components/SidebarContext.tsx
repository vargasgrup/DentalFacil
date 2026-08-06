"use client";

/**
 * Estado del panel de navegación principal (sidebar).
 * Modos: expanded | collapsed | floating
 * Persistencia: nk-ds:ui:panel:sidebar
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type SidebarMode = "expanded" | "collapsed" | "floating";

const STORAGE_KEY = "nk-ds:ui:panel:sidebar";
const MODES: SidebarMode[] = ["expanded", "collapsed", "floating"];

function readMode(): SidebarMode {
  if (typeof window === "undefined") return "expanded";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "expanded" || v === "collapsed" || v === "floating") return v;
  } catch {
    /* ignore */
  }
  return "expanded";
}

function writeMode(mode: SidebarMode) {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export interface SidebarContextValue {
  mode: SidebarMode;
  setMode: (m: SidebarMode) => void;
  cycleMode: () => void;
  /** Drawer móvil / drawer en floating superpuesto */
  open: boolean;
  setOpen: (v: boolean) => void;
  openSidebar: () => void;
  closeSidebar: () => void;
  /** Clase de padding del área de contenido (md+) */
  contentOffsetClass: string;
  /** Ancho del rail fijo cuando no es floating superpuesto */
  railWidthClass: string;
  isIconRail: boolean;
  isFloatingOverlay: boolean;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<SidebarMode>("expanded");
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setModeState(readMode());
    setHydrated(true);
  }, []);

  const setMode = useCallback((m: SidebarMode) => {
    setModeState(m);
    writeMode(m);
    if (m !== "floating") setOpen(false);
  }, []);

  const cycleMode = useCallback(() => {
    setModeState((prev) => {
      const i = MODES.indexOf(prev);
      const next = MODES[(i + 1) % MODES.length]!;
      writeMode(next);
      if (next !== "floating") setOpen(false);
      return next;
    });
  }, []);

  const openSidebar = useCallback(() => setOpen(true), []);
  const closeSidebar = useCallback(() => setOpen(false), []);

  const contentOffsetClass = useMemo(() => {
    if (!hydrated) return "md:pl-64";
    if (mode === "collapsed") return "md:pl-[4.5rem]";
    if (mode === "floating") return "md:pl-0";
    return "md:pl-64";
  }, [mode, hydrated]);

  const railWidthClass =
    mode === "collapsed" ? "w-[4.5rem]" : "w-64";

  const isIconRail = mode === "collapsed";
  const isFloatingOverlay = mode === "floating" && open;

  const value = useMemo(
    () => ({
      mode,
      setMode,
      cycleMode,
      open,
      setOpen,
      openSidebar,
      closeSidebar,
      contentOffsetClass,
      railWidthClass,
      isIconRail,
      isFloatingOverlay,
    }),
    [
      mode,
      setMode,
      cycleMode,
      open,
      openSidebar,
      closeSidebar,
      contentOffsetClass,
      railWidthClass,
      isIconRail,
      isFloatingOverlay,
    ]
  );

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
}

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error("useSidebar must be used within SidebarProvider");
  }
  return ctx;
}
