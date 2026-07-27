"use client";

import { useEffect, useState } from "react";
import { getApiBase, getToken } from "@/lib/api";
import { useClinicBrand } from "@/lib/clinicBrand";

type BrandLogoProps = {
  /** login = wide hero; sidebar = compact; inline = medium */
  variant?: "login" | "sidebar" | "inline";
  className?: string;
  priority?: boolean;
};

const sizes = {
  login: {
    width: 390,
    height: 254,
    className: "h-auto w-full max-w-[390px] rounded-xl",
  },
  sidebar: {
    width: 196,
    height: 128,
    className: "max-h-[4.25rem] w-full rounded-lg",
  },
  inline: {
    width: 240,
    height: 156,
    className: "h-14 w-auto max-w-[240px] rounded-lg",
  },
};

const PRODUCT_FALLBACK = "/Logo.png?v=logo01-transparent";

function absoluteApiUrl(path: string): string {
  const base = getApiBase().replace(/\/$/, "");
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("blob:")) {
    return path;
  }
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Clinic custom logo when configured; otherwise product mark.
 * Loads via authenticated fetch → blob URL so it works even if the
 * logo endpoint still requires Bearer (img src alone cannot send it).
 * Reacts instantly to ClinicBrandProvider updates after Configuración.
 */
export function BrandLogo({
  variant = "inline",
  className = "",
  priority = false,
}: BrandLogoProps) {
  const { branding, displayName, logoSrc } = useClinicBrand();
  const s = sizes[variant];
  const [src, setSrc] = useState(PRODUCT_FALLBACK);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    const load = async () => {
      const custom = Boolean(branding?.has_custom_logo && branding.logo_url);
      if (!custom) {
        if (!cancelled) setSrc(PRODUCT_FALLBACK);
        return;
      }

      const url = absoluteApiUrl(branding!.logo_url!);
      const token = getToken();
      try {
        const res = await fetch(url, {
          cache: "no-store",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`logo ${res.status}`);
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch {
        // Fallback: try plain URL (public endpoint) then product mark
        if (!cancelled) {
          setSrc(`${logoSrc}${logoSrc.includes("?") ? "&" : "?"}_=${Date.now()}`);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [
    branding?.has_custom_logo,
    branding?.logo_url,
    branding?.logo_version,
    branding?.updated_at,
    branding?.revision,
    logoSrc,
  ]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={src}
      src={src}
      alt={displayName}
      width={s.width}
      height={s.height}
      className={`${s.className} object-contain ${className}`}
      decoding="async"
      onError={(e) => {
        const el = e.currentTarget;
        if (el.getAttribute("src")?.includes("Logo.png")) return;
        el.src = PRODUCT_FALLBACK;
      }}
      {...(priority ? { fetchPriority: "high" as const } : {})}
    />
  );
}
