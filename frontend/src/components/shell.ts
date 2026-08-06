/** Shared chrome height — sidebar brand strip + topbar must match for a continuous edge. */
export const SHELL_HEADER_HEIGHT = "h-16 sm:h-[4.5rem] md:h-20";

export const SHELL_HEADER_CLASS =
  `flex ${SHELL_HEADER_HEIGHT} shrink-0 items-center`;

/**
 * Premium topbar — soft clinical blue-slate wash (pairs with dashboard KPIs,
 * distinct from pure-white content cards).
 * Shrink-0 (not sticky): scroll lives in `.app-main`, topbar is a sibling above it.
 */
export const SHELL_TOPBAR_CLASS = [
  SHELL_HEADER_CLASS,
  "topbar-chrome relative z-40 shrink-0 gap-2 sm:gap-3 sm:px-4 md:gap-3.5 lg:px-6 px-2.5",
  "border-b border-brand-100/80",
  "backdrop-blur-xl backdrop-saturate-150",
].join(" ");

/**
 * Pin secondary chrome (tabs, filters) to the TOP of `.app-main` scrollport.
 * Do NOT use top-16/top-20 here — those assume the topbar shares the scroll,
 * which it does not (AppShell). Utility class `.app-main-sticky` in globals.css.
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
