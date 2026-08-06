"use client";

/**
 * Preferencias de UI (local) — mono-clínica.
 * Claves: nk-ds:ui:*
 * Atributos en <html>: data-density, data-font-scale, data-reduced-motion, data-contrast
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

export type UiDensity = "comfortable" | "compact";
export type FontScale = "90" | "100" | "115" | "130";
export type ContrastMode = "default" | "high";

const KEYS = {
  density: "nk-ds:ui:density",
  fontScale: "nk-ds:ui:font-scale",
  reducedMotion: "nk-ds:ui:reduced-motion",
  contrast: "nk-ds:ui:contrast",
} as const;

function readLs(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLs(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore quota */
  }
}

function applyDomAttrs(prefs: {
  density: UiDensity;
  fontScale: FontScale;
  reducedMotion: boolean;
  contrast: ContrastMode;
}) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-density", prefs.density);
  root.setAttribute("data-font-scale", prefs.fontScale);
  root.setAttribute("data-reduced-motion", prefs.reducedMotion ? "on" : "off");
  root.setAttribute("data-contrast", prefs.contrast);
  root.style.setProperty(
    "--font-scale",
    `${Number(prefs.fontScale) / 100}`
  );
}

export interface UiPreferences {
  density: UiDensity;
  fontScale: FontScale;
  /** Override manual: fuerza sin animaciones (independiente del OS). */
  reducedMotion: boolean;
  contrast: ContrastMode;
  setDensity: (d: UiDensity) => void;
  setFontScale: (s: FontScale) => void;
  setReducedMotion: (v: boolean) => void;
  setContrast: (c: ContrastMode) => void;
  resetUiPreferences: () => void;
}

const UiPreferencesContext = createContext<UiPreferences | null>(null);

const DEFAULTS = {
  density: "comfortable" as UiDensity,
  fontScale: "100" as FontScale,
  reducedMotion: false,
  contrast: "default" as ContrastMode,
};

export function UiPreferencesProvider({ children }: { children: ReactNode }) {
  const [density, setDensityState] = useState<UiDensity>(DEFAULTS.density);
  const [fontScale, setFontScaleState] = useState<FontScale>(DEFAULTS.fontScale);
  const [reducedMotion, setReducedMotionState] = useState(DEFAULTS.reducedMotion);
  const [contrast, setContrastState] = useState<ContrastMode>(DEFAULTS.contrast);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const d = readLs(KEYS.density);
    const f = readLs(KEYS.fontScale);
    const r = readLs(KEYS.reducedMotion);
    const c = readLs(KEYS.contrast);
    const next = {
      density:
        d === "compact" || d === "comfortable" ? d : DEFAULTS.density,
      fontScale:
        f === "90" || f === "100" || f === "115" || f === "130"
          ? f
          : DEFAULTS.fontScale,
      reducedMotion: r === "1" || r === "true",
      contrast: c === "high" ? ("high" as const) : DEFAULTS.contrast,
    };
    setDensityState(next.density);
    setFontScaleState(next.fontScale);
    setReducedMotionState(next.reducedMotion);
    setContrastState(next.contrast);
    applyDomAttrs(next);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    applyDomAttrs({ density, fontScale, reducedMotion, contrast });
  }, [hydrated, density, fontScale, reducedMotion, contrast]);

  const setDensity = useCallback((d: UiDensity) => {
    setDensityState(d);
    writeLs(KEYS.density, d);
  }, []);

  const setFontScale = useCallback((s: FontScale) => {
    setFontScaleState(s);
    writeLs(KEYS.fontScale, s);
  }, []);

  const setReducedMotion = useCallback((v: boolean) => {
    setReducedMotionState(v);
    writeLs(KEYS.reducedMotion, v ? "1" : "0");
  }, []);

  const setContrast = useCallback((c: ContrastMode) => {
    setContrastState(c);
    writeLs(KEYS.contrast, c);
  }, []);

  const resetUiPreferences = useCallback(() => {
    setDensity(DEFAULTS.density);
    setFontScale(DEFAULTS.fontScale);
    setReducedMotion(DEFAULTS.reducedMotion);
    setContrast(DEFAULTS.contrast);
  }, [setDensity, setFontScale, setReducedMotion, setContrast]);

  const value = useMemo(
    () => ({
      density,
      fontScale,
      reducedMotion,
      contrast,
      setDensity,
      setFontScale,
      setReducedMotion,
      setContrast,
      resetUiPreferences,
    }),
    [
      density,
      fontScale,
      reducedMotion,
      contrast,
      setDensity,
      setFontScale,
      setReducedMotion,
      setContrast,
      resetUiPreferences,
    ]
  );

  return (
    <UiPreferencesContext.Provider value={value}>
      {children}
    </UiPreferencesContext.Provider>
  );
}

export function useUiPreferences(): UiPreferences {
  const ctx = useContext(UiPreferencesContext);
  if (!ctx) {
    throw new Error("useUiPreferences must be used within UiPreferencesProvider");
  }
  return ctx;
}
