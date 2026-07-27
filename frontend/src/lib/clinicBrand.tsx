"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

export type ClinicBranding = {
  nombre_publico: string;
  has_custom_logo: boolean;
  logo_url: string | null;
  updated_at?: string | null;
  logo_version?: number | null;
};

type ClinicBrandContextValue = {
  branding: ClinicBranding | null;
  /** Resolved <img> src for shell/login — clinic logo or product fallback */
  logoSrc: string;
  displayName: string;
  refresh: () => Promise<void>;
  applyProfile: (profile: Pick<ClinicProfile, "nombre_publico" | "has_custom_logo" | "logo_url"> & {
    updated_at?: string | null;
    logo_version?: number | null;
  }) => void;
};

const ClinicBrandContext = createContext<ClinicBrandContextValue | null>(null);

function withApiBase(path: string): string {
  const base = getApiBase().replace(/\/$/, "");
  if (!path.startsWith("/")) return path;
  return `${base}${path}`;
}

function resolveLogoSrc(b: ClinicBranding | null): string {
  if (b?.has_custom_logo && b.logo_url) {
    return withApiBase(b.logo_url);
  }
  return PRODUCT_LOGO;
}

function readCached(): ClinicBranding | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ClinicBranding;
  } catch {
    return null;
  }
}

function writeCached(b: ClinicBranding) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
  } catch {
    /* ignore quota */
  }
}

export function notifyClinicProfileUpdated(
  profile: Pick<ClinicProfile, "nombre_publico" | "has_custom_logo" | "logo_url"> & {
    updated_at?: string | null;
    logo_version?: number | null;
  }
) {
  if (typeof window === "undefined") return;
  const payload: ClinicBranding = {
    nombre_publico: profile.nombre_publico || "",
    has_custom_logo: Boolean(profile.has_custom_logo),
    logo_url: profile.has_custom_logo ? profile.logo_url : null,
    updated_at: profile.updated_at ?? null,
    logo_version: profile.logo_version ?? null,
  };
  writeCached(payload);
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: payload }));
}

export function ClinicBrandProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [branding, setBranding] = useState<ClinicBranding | null>(() => readCached());

  const applyBranding = useCallback((next: ClinicBranding) => {
    setBranding(next);
    writeCached(next);
  }, []);

  const applyProfile = useCallback(
    (
      profile: Pick<ClinicProfile, "nombre_publico" | "has_custom_logo" | "logo_url"> & {
        updated_at?: string | null;
        logo_version?: number | null;
      }
    ) => {
      applyBranding({
        nombre_publico: profile.nombre_publico || "",
        has_custom_logo: Boolean(profile.has_custom_logo),
        logo_url: profile.has_custom_logo ? profile.logo_url : null,
        updated_at: profile.updated_at ?? null,
        logo_version: profile.logo_version ?? null,
      });
    },
    [applyBranding]
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
      const publicBrand = await apiFetch<ClinicBranding>("/api/config/clinic/branding");
      applyBranding({
        nombre_publico: publicBrand.nombre_publico || "",
        has_custom_logo: Boolean(publicBrand.has_custom_logo),
        logo_url: publicBrand.has_custom_logo ? publicBrand.logo_url : null,
        updated_at: publicBrand.updated_at ?? null,
        logo_version: publicBrand.logo_version ?? null,
      });
    } catch {
      /* keep cache / product fallback */
    }
  }, [applyBranding, applyProfile]);

  useEffect(() => {
    void refresh();
  }, [refresh, user?.id]);

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

  const value = useMemo<ClinicBrandContextValue>(
    () => ({
      branding,
      logoSrc: resolveLogoSrc(branding),
      displayName: branding?.nombre_publico?.trim() || PRODUCT_ALT,
      refresh,
      applyProfile,
    }),
    [branding, refresh, applyProfile]
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
