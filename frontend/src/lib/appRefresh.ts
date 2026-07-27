/** Global soft-refresh signal from the topbar (any module can listen). */

export const APP_REFRESH_EVENT = "nk:app-refresh";

export function requestAppRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(APP_REFRESH_EVENT));
}
