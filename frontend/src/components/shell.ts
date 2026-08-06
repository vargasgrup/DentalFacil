/** Shared chrome height — sidebar brand strip + topbar must match for a continuous edge. */
export const SHELL_HEADER_HEIGHT = "h-16 sm:h-[4.5rem] md:h-20";

export const SHELL_HEADER_CLASS =
  `flex ${SHELL_HEADER_HEIGHT} shrink-0 items-center`;

/**
 * Premium topbar — soft clinical blue-slate wash (pairs with dashboard KPIs,
 * distinct from pure-white content cards).
 * Shrink-0: topbar is a sibling of `main`; vertical scroll is never on the shell.
 */
export const SHELL_TOPBAR_CLASS = [
  SHELL_HEADER_CLASS,
  "topbar-chrome relative z-40 shrink-0 gap-2 sm:gap-3 sm:px-4 md:gap-3.5 lg:px-6 px-2.5",
  "border-b border-brand-100/80",
  "backdrop-blur-xl backdrop-saturate-150",
].join(" ");

/**
 * Sticky chrome inside PageContainer layout=scroll (`.app-page-scroll`).
 * For true pin-outside-scroll (ficha tabs), use PageContainer layout="split".
 */
export const APP_MAIN_STICKY_CLASS = "app-main-sticky";

/** Sidebar logo cell — same chrome wash as topbar (seamless L-shaped header). */
export const SHELL_SIDEBAR_BRAND_CLASS = [
  SHELL_HEADER_CLASS,
  "topbar-chrome relative border-b border-brand-100/80 px-3",
].join(" ");

/** Desktop/tablet sidebar rail width (keep in sync with AppShell padding). */
export const SHELL_SIDEBAR_WIDTH = "w-64";
/** Icon-only collapsed rail */
export const SHELL_SIDEBAR_COLLAPSED_WIDTH = "w-[4.5rem]";
