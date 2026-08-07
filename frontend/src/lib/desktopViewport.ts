/**
 * WebView2 / pywebview clinic shell: native file dialogs can leave the
 * visual viewport at 0 / desync 100dvh, painting the main column blank while
 * the sidebar (separate paint layer) still shows. Pin height from innerHeight
 * and force a layout recover after picks.
 */

const SHELL_H = "--nk-shell-h";

export function isClinicDesktopHost(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as Window & {
    chrome?: { webview?: unknown };
    pywebview?: unknown;
  };
  if (w.pywebview || w.chrome?.webview) return true;
  const host = (window.location.hostname || "").toLowerCase();
  const port = window.location.port;
  return (
    port === "8001" &&
    (host === "127.0.0.1" ||
      host === "localhost" ||
      /^\d{1,3}(\.\d{1,3}){3}$/.test(host))
  );
}

export function pinClinicShellHeight(): void {
  if (typeof window === "undefined") return;
  const h = Math.max(0, Math.floor(window.innerHeight || 0));
  if (h < 120) return;
  document.documentElement.style.setProperty(SHELL_H, `${h}px`);
}

/** Call after native <input type="file"> dialogs and multi-file uploads. */
export function recoverClinicMainPaint(): void {
  if (typeof window === "undefined") return;
  pinClinicShellHeight();

  try {
    window.dispatchEvent(new Event("resize"));
  } catch {
    /* ignore */
  }

  // Nudge compositor (WebView2 sometimes keeps a blank layer until reflow).
  const main = document.querySelector("main.app-main") as HTMLElement | null;
  if (main) {
    const prev = main.style.transform;
    main.style.transform = "translateZ(0)";
    // force layout
    void main.offsetHeight;
    main.style.transform = prev;
  }

  requestAnimationFrame(() => {
    pinClinicShellHeight();
    try {
      window.dispatchEvent(new Event("resize"));
    } catch {
      /* ignore */
    }
  });
}

/**
 * Schedule upload work after the file dialog fully dismisses.
 * Immediate FormData+fetch on the change event freezes paint on some WebView2 builds.
 */
export function afterNativeFileDialog(work: () => void | Promise<void>): void {
  recoverClinicMainPaint();
  window.setTimeout(() => {
    recoverClinicMainPaint();
    void Promise.resolve()
      .then(work)
      .finally(() => {
        recoverClinicMainPaint();
        window.setTimeout(recoverClinicMainPaint, 80);
      });
  }, 60);
}
