"use client";

type BrandLogoProps = {
  /** login = wide hero; sidebar = compact; inline = medium */
  variant?: "login" | "sidebar" | "inline";
  className?: string;
  priority?: boolean;
};

/**
 * Official brand mark from docs/Logo.png (RGBA, transparent).
 * Uses a native <img> so PNG alpha is never altered by the image optimizer.
 * Cache-bust query forces browsers/CDN to drop the old black-background file.
 */
const LOGO_SRC = "/Logo.png?v=docs-original";

const sizes = {
  login: { width: 390, height: 116, className: "h-auto w-full max-w-[390px]" },
  sidebar: { width: 196, height: 58, className: "h-10 w-auto max-w-full" },
  inline: { width: 240, height: 72, className: "h-12 w-auto max-w-[240px]" },
};

export function BrandLogo({
  variant = "inline",
  className = "",
  priority = false,
}: BrandLogoProps) {
  const s = sizes[variant];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={LOGO_SRC}
      alt="M&D Odontología Especializada — Dra. Maribel Condori Hilasaca"
      width={s.width}
      height={s.height}
      className={`${s.className} object-contain ${className}`}
      decoding="async"
      {...(priority ? { fetchPriority: "high" as const } : {})}
    />
  );
}
