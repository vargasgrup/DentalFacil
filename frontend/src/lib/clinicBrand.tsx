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
import { apiFetch, getToken } from "@/lib/api";
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
  /** Client-side bust so UI reloads logo even if server version is unchanged */
  revision: number;
};

type ClinicBrandContextValue = {
  branding: ClinicBranding | null;
  /** Hint URL (may still need auth); BrandLogo prefers blob fetch */
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

function bustLogoUrl(url: string | null | undefined, version?: number | null): string | null {
  if (!url) return null;
  const rev = version && version > 0 ? version : Date.now();
  try {
    const u = new URL(url, "http://local.invalid");
    u.searchParams.set("v", String(rev));
    u.searchParams.set("r", String(Date.now()));
    return `${u.pathname}${u.search}`;
  } catch {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}v=${rev}&r=${Date.now()}`;
  }
}

function resolveLogoSrc(b: ClinicBranding | null): string {
  if (b?.has_custom_logo && b.logo_url) return b.logo_url;
  return PRODUCT_LOGO;
}

function readCached(): ClinicBranding | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClinicBranding;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      ...parsed,
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
    /* ignore quota */
  }
}

function toBranding(
  profile: Pick<ClinicProfile, "nombre_publico" | "has_custom_logo" | "logo_url"> & {
    updated_at?: string | null;
    logo_version?: number | null;
  }
): ClinicBranding {
  const version = profile.logo_version ?? (profile.updated_at ? Date.parse(profile.updated_at) || null : null);
  return {
    nombre_publico: profile.nombre_publico || "",
    has_custom_logo: Boolean(profile.has_custom_logo),
    logo_url: profile.has_custom_logo
      ? bustLogoUrl(profile.logo_url, version)
      : null,
    updated_at: profile.updated_at ?? null,
    logo_version: version,
    revision: Date.now(),
  };
}

export function notifyClinicProfileUpdated(
  profile: Pick<ClinicProfile, "nombre_publico" | "has_custom_logo" | "logo_url"> & {
    updated_at?: string | null;
    logo_version?: number | null;
  }
) {
  if (typeof window === "undefined") return;
  const payload = toBranding(profile);
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
      applyBranding(toBranding(profile));
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
      const publicBrand = await apiFetch<{
        nombre_publico: string;
        has_custom_logo: boolean;
        logo_url: string | null;
        updated_at?: string | null;
        logo_version?: number | null;
      }>("/api/config/clinic/branding");
      applyProfile(publicBrand);
    } catch {
      /* keep cache / product fallback */
    }
  }, [applyProfile]);

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
