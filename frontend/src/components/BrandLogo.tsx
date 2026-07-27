"use client";

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

/**
 * Official mark: clinic custom logo when configured, otherwise product Logo.png.
 * Updates live via ClinicBrandProvider when Configuración changes the logo.
 */
export function BrandLogo({
  variant = "inline",
  className = "",
  priority = false,
}: BrandLogoProps) {
  const { logoSrc, displayName } = useClinicBrand();
  const s = sizes[variant];

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={logoSrc}
      src={logoSrc}
      alt={displayName}
      width={s.width}
      height={s.height}
      className={`${s.className} object-contain ${className}`}
      decoding="async"
      onError={(e) => {
        const el = e.currentTarget;
        if (el.src.includes("Logo.png")) return;
        el.src = PRODUCT_FALLBACK;
      }}
      {...(priority ? { fetchPriority: "high" as const } : {})}
    />
  );
}
