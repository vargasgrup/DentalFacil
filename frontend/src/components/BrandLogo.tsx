"use client";

type BrandLogoProps = {
  /** login = wide hero; sidebar = compact; inline = medium */
  variant?: "login" | "sidebar" | "inline";
  className?: string;
  priority?: boolean;
};

/**
 * Official brand mark (Logo_01): Dra Maribel Condori H. — Especialista en Ortodoncia.
 * Uses a native <img> so PNG alpha (transparent background) is never altered.
 */
const LOGO_SRC = "/Logo.png?v=logo01-transparent";


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
      alt="Dra Maribel Condori H. — Especialista en Ortodoncia"
      width={s.width}
      height={s.height}
      className={`${s.className} object-contain ${className}`}
      decoding="async"
      {...(priority ? { fetchPriority: "high" as const } : {})}
    />
  );
}
