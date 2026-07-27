"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { apiFetch, getApiBase, getToken } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { ClinicProfile } from "@/components/config/types";

const PRODUCT_LOGO = "/Logo.png?v=logo01-transparent";
const PRODUCT_ALT = "N&K DentalSoft";
const EVENT_NAME = "nk:clinic-profile";
const STORAGE_KEY = "nk_clinic_branding_v1";
const LOGO_DATA_KEY = "nk_clinic_logo_data_v1";

export type ClinicBranding = {
  nombre_publico: string;
  has_custom_logo: boolean;
  logo_url: string | null;
  updated_at?: string | null;
  logo_version?: number | null;
  revision: number;
};

type ClinicBrandContextValue = {
  branding: ClinicBranding | null;
  /** Stable display src (data URL / product). Survives AppShell remounts. */
  logoSrc: string;
  displayName: string;
  refresh: () => Promise<void>;
  applyProfile: (
    profile: Pick<ClinicProfile, "nombre_publico" | "has_custom_logo" | "logo_url"> & {
      updated_at?: string | null;
      logo_version?: number | null;
    }
  ) => void;
};

const ClinicBrandContext = createContext<ClinicBrandContextValue | null>(null);

function absoluteApiUrl(path: string): string {
  const base = getApiBase().replace(/\/$/, "");
  if (
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("blob:") ||
    path.startsWith("data:")
  ) {
    return path;
  }
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function bustLogoUrl(url: string | null | undefined, version?: number | null): string | null {
  if (!url) return null;
  const rev = version && version > 0 ? version : Date.now();
  try {
    const u = new URL(url, "http://local.invalid");
    u.searchParams.set("v", String(rev));
    u.searchParams.delete("r");
    return `${u.pathname}${u.search}`;
  } catch {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}v=${rev}`;
  }
}

function logoCacheKey(b: ClinicBranding): string {
  const path = (b.logo_url || "").split("?")[0];
  return `${b.has_custom_logo ? 1 : 0}:${b.logo_version ?? 0}:${path}`;
}

function readCached(): ClinicBranding | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClinicBranding;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      nombre_publico: parsed.nombre_publico || "",
      has_custom_logo: Boolean(parsed.has_custom_logo),
      logo_url: parsed.logo_url ?? null,
      updated_at: parsed.updated_at ?? null,
      logo_version: parsed.logo_version ?? null,
      revision: typeof parsed.revision === "number" ? parsed.revision : Date.now(),
    };
  } catch {
    return null;
  }
}

function writeCached(b: ClinicBranding) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
  } catch {
    /* ignore */
  }
}

function readLogoDataCache(): { key: string; dataUrl: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(LOGO_DATA_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { key: string; dataUrl: string };
    if (!parsed?.key || !parsed?.dataUrl?.startsWith("data:")) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLogoDataCache(key: string, dataUrl: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(LOGO_DATA_KEY, JSON.stringify({ key, dataUrl }));
  } catch {
    /* quota */
  }
}

function clearLogoDataCache() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(LOGO_DATA_KEY);
  } catch {
    /* ignore */
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

function toBranding(
  profile: Pick<ClinicProfile, "nombre_publico" | "has_custom_logo" | "logo_url"> & {
    updated_at?: string | null;
    logo_version?: number | null;
  },
  prev: ClinicBranding | null
): ClinicBranding {
  const version =
    profile.logo_version ??
    (profile.updated_at ? Date.parse(profile.updated_at) || null : null);
  const hasCustom = Boolean(profile.has_custom_logo);
  const logo_url = hasCustom ? bustLogoUrl(profile.logo_url, version) : null;
  const sameLogo =
    prev !== null &&
    prev.has_custom_logo === hasCustom &&
    (prev.logo_version ?? null) === (version ?? null) &&
    (prev.logo_url || "").split("?")[0] === (logo_url || "").split("?")[0];
  const sameName = prev !== null && prev.nombre_publico === (profile.nombre_publico || "");

  return {
    nombre_publico: profile.nombre_publico || "",
    has_custom_logo: hasCustom,
    logo_url,
    updated_at: profile.updated_at ?? null,
    logo_version: version,
    revision: sameLogo && sameName && prev !== null ? prev.revision : Date.now(),
  };
}

function resolveDisplaySrc(branding: ClinicBranding | null): string {
  if (!branding || !branding.has_custom_logo || !branding.logo_url) {
    return PRODUCT_LOGO;
  }
  const cached = readLogoDataCache();
  if (cached && cached.key === logoCacheKey(branding)) {
    return cached.dataUrl;
  }
  return absoluteApiUrl(branding.logo_url);
}

function syncLogoDisplay(next: ClinicBranding, setLogoSrc: (src: string) => void) {
  if (!next.has_custom_logo || !next.logo_url) {
    clearLogoDataCache();
    setLogoSrc(PRODUCT_LOGO);
    return;
  }
  const key = logoCacheKey(next);
  const cached = readLogoDataCache();
  if (cached && cached.key === key) {
    setLogoSrc(cached.dataUrl);
  } else {
    setLogoSrc(absoluteApiUrl(next.logo_url));
  }
}

export function notifyClinicProfileUpdated(
  profile: Pick<ClinicProfile, "nombre_publico" | "has_custom_logo" | "logo_url"> & {
    updated_at?: string | null;
    logo_version?: number | null;
  }
) {
  if (typeof window === "undefined") return;
  const prev = readCached();
  const payload = toBranding(profile, prev);
  payload.revision = Date.now();
  writeCached(payload);
  if (
    !payload.has_custom_logo ||
    !prev ||
    logoCacheKey(payload) !== logoCacheKey(prev)
  ) {
    clearLogoDataCache();
  }
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: payload }));
}

export function ClinicBrandProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // SSR-safe defaults — never touch localStorage/window in useState initializers.
  const [branding, setBranding] = useState<ClinicBranding | null>(null);
  const [logoSrc, setLogoSrc] = useState<string>(PRODUCT_LOGO);
  const [hydrated, setHydrated] = useState(false);
  const loadGen = useRef(0);

  const applyBranding = useCallback((next: ClinicBranding) => {
    setBranding(next);
    writeCached(next);
    syncLogoDisplay(next, setLogoSrc);
  }, []);

  const applyProfile = useCallback(
    (
      profile: Pick<ClinicProfile, "nombre_publico" | "has_custom_logo" | "logo_url"> & {
        updated_at?: string | null;
        logo_version?: number | null;
      }
    ) => {
      setBranding((prev) => {
        const next = toBranding(profile, prev);
        writeCached(next);
        syncLogoDisplay(next, setLogoSrc);
        return next;
      });
    },
    []
  );

  const refresh = useCallback(async () => {
    try {
      if (getToken()) {
        const full = await apiFetch<
          ClinicProfile & { updated_at?: string | null; logo_version?: number | null }
        >("/api/config/clinic");
        applyProfile(full);
        return;
      }
      const publicBrand = await apiFetch<{
        nombre_publico: string;
        has_custom_logo: boolean;
        logo_url: string | null;
        updated_at?: string | null;
        logo_version?: number | null;
      }>("/api/config/clinic/branding");
      applyProfile(publicBrand);
    } catch {
      /* keep cache */
    }
  }, [applyProfile]);

  // Client-only hydrate from session/local cache (avoids SSR null.logo_url crash).
  useEffect(() => {
    const cached = readCached();
    if (cached) {
      setBranding(cached);
      setLogoSrc(resolveDisplaySrc(cached));
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void refresh();
  }, [hydrated, refresh, user?.id]);

  // Keep a stable displayable logo in the provider (survives AppShell remount per module).
  useEffect(() => {
    if (!hydrated) return;

    const gen = ++loadGen.current;
    let cancelled = false;

    const run = async () => {
      if (!branding || !branding.has_custom_logo || !branding.logo_url) {
        if (!cancelled && gen === loadGen.current) {
          clearLogoDataCache();
          setLogoSrc(PRODUCT_LOGO);
        }
        return;
      }

      const active = branding;
      const logoPath = active.logo_url;
      if (!logoPath) return;

      const key = logoCacheKey(active);
      const cached = readLogoDataCache();
      if (cached && cached.key === key) {
        if (!cancelled && gen === loadGen.current) setLogoSrc(cached.dataUrl);
        return;
      }

      const token = getToken();
      try {
        const res = await fetch(absoluteApiUrl(logoPath), {
          cache: "no-store",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`logo ${res.status}`);
        const blob = await res.blob();
        const dataUrl = await blobToDataUrl(blob);
        if (cancelled || gen !== loadGen.current) return;
        writeLogoDataCache(key, dataUrl);
        setLogoSrc(dataUrl);
      } catch {
        if (!cancelled && gen === loadGen.current) {
          setLogoSrc(absoluteApiUrl(logoPath));
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    hydrated,
    branding,
  ]);

  useEffect(() => {
    const onUpdate = (ev: Event) => {
      const detail = (ev as CustomEvent<ClinicBranding>).detail;
      if (detail) applyBranding(detail);
    };
    const onAppRefresh = () => {
      void refresh();
    };
    window.addEventListener(EVENT_NAME, onUpdate);
    window.addEventListener("nk:app-refresh", onAppRefresh);
    window.addEventListener("nk:realtime-reconnect", onAppRefresh);
    return () => {
      window.removeEventListener(EVENT_NAME, onUpdate);
      window.removeEventListener("nk:app-refresh", onAppRefresh);
      window.removeEventListener("nk:realtime-reconnect", onAppRefresh);
    };
  }, [applyBranding, refresh]);

  const displayName =
    branding && branding.nombre_publico && branding.nombre_publico.trim()
      ? branding.nombre_publico.trim()
      : PRODUCT_ALT;

  const value = useMemo<ClinicBrandContextValue>(
    () => ({
      branding,
      logoSrc,
      displayName,
      refresh,
      applyProfile,
    }),
    [branding, logoSrc, displayName, refresh, applyProfile]
  );

  return (
    <ClinicBrandContext.Provider value={value}>{children}</ClinicBrandContext.Provider>
  );
}

export function useClinicBrand(): ClinicBrandContextValue {
  const ctx = useContext(ClinicBrandContext);
  if (!ctx) {
    return {
      branding: null,
      logoSrc: PRODUCT_LOGO,
      displayName: PRODUCT_ALT,
      refresh: async () => undefined,
      applyProfile: () => undefined,
    };
  }
  return ctx;
}
