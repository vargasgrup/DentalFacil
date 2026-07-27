/** Shared chrome height — sidebar brand strip + topbar must match for a continuous edge. */
export const SHELL_HEADER_HEIGHT = "h-16 sm:h-[4.5rem] md:h-20";

export const SHELL_HEADER_CLASS =
  `flex ${SHELL_HEADER_HEIGHT} shrink-0 items-center`;

/**
 * Premium topbar — soft clinical blue-slate wash (pairs with dashboard KPIs,
 * distinct from pure-white content cards).
 */
export const SHELL_TOPBAR_CLASS = [
  SHELL_HEADER_CLASS,
  "topbar-chrome relative sticky top-0 z-40 gap-2 sm:gap-3 sm:px-4 md:gap-3.5 lg:px-6 px-2.5",
  "border-b border-brand-100/80",
  "backdrop-blur-xl backdrop-saturate-150",
].join(" ");

/** Sidebar brand strip — calm white to frame the tinted topbar. */
export const SHELL_SIDEBAR_BRAND_CLASS = [
  SHELL_HEADER_CLASS,
  "border-b border-slate-200/80 bg-white px-3",
].join(" ");

/** Desktop/tablet sidebar rail width (keep in sync with AppShell padding). */
export const SHELL_SIDEBAR_WIDTH = "w-64";
