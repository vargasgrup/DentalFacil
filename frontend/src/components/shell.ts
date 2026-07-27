/** Shared chrome height — sidebar brand strip + topbar must match for a continuous edge. */
export const SHELL_HEADER_HEIGHT = "h-20";

export const SHELL_HEADER_CLASS =
  `flex ${SHELL_HEADER_HEIGHT} shrink-0 items-center`;

/** Premium topbar surface (frosted, soft depth — not a flat white strip). */
export const SHELL_TOPBAR_CLASS = [
  SHELL_HEADER_CLASS,
  "relative sticky top-0 z-40 gap-3 border-b border-slate-200/70 px-3 sm:gap-3.5 sm:px-5 lg:px-6",
  "bg-white/80 backdrop-blur-xl backdrop-saturate-150",
  "shadow-[0_1px_0_rgba(255,255,255,0.8)_inset,0_8px_24px_-12px_rgba(15,23,42,0.12)]",
].join(" ");

/** Sidebar brand strip — aligned edge with topbar, slightly denser white. */
export const SHELL_SIDEBAR_BRAND_CLASS = [
  SHELL_HEADER_CLASS,
  "border-b border-slate-200/80 bg-white px-3",
].join(" ");

/** Desktop/tablet sidebar rail width (keep in sync with AppShell padding). */
export const SHELL_SIDEBAR_WIDTH = "w-64";
