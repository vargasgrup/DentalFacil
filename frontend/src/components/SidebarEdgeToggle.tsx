"use client";

import { ChevronLeft } from "lucide-react";

/**
 * Control de colapso en el bisel derecho del rail (centro vertical).
 * Pastilla flotante tipo product chrome actual (Linear / VS Code / Notion).
 */
export function SidebarEdgeToggle({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const label = collapsed
    ? "Expandir barra de navegación"
    : "Colapsar barra de navegación";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-expanded={!collapsed}
      title={label}
      className={[
        "sidebar-edge-toggle group absolute right-0 top-1/2 z-40",
        "flex h-12 w-6 -translate-y-1/2 translate-x-1/2",
        "items-center justify-center",
        "rounded-full",
        "border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/95",
        "text-slate-500",
        "shadow-[0_6px_20px_-6px_rgba(15,23,42,0.28),0_0_0_1px_rgba(255,255,255,0.9)_inset]",
        "backdrop-blur-md",
        "transition-[transform,box-shadow,border-color,color,background-color]",
        "duration-[var(--motion-duration,200ms)] ease-smooth",
        "hover:scale-[1.07] hover:border-brand-400/70 hover:text-brand-600",
        "hover:from-white hover:to-brand-50/40",
        "hover:shadow-[0_10px_28px_-8px_rgba(28,102,232,0.35),0_0_0_1px_rgba(255,255,255,0.95)_inset]",
        "active:scale-[0.96]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
        "focus-visible:ring-offset-2 focus-visible:ring-offset-white",
      ].join(" ")}
    >
      <span
        className={[
          "pointer-events-none absolute inset-[3px] rounded-full",
          "opacity-0 transition-opacity duration-[var(--motion-duration,200ms)]",
          "group-hover:opacity-100",
          "bg-[radial-gradient(ellipse_at_center,rgba(28,102,232,0.08),transparent_70%)]",
        ].join(" ")}
        aria-hidden
      />
      <ChevronLeft
        className={[
          "relative h-3.5 w-3.5 shrink-0",
          "transition-transform duration-[var(--motion-duration,220ms)] ease-smooth",
          collapsed ? "rotate-180" : "rotate-0",
        ].join(" ")}
        strokeWidth={2.6}
        aria-hidden
      />
    </button>
  );
}
