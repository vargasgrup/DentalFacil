/**
 * Hard navigation for Next.js static export behind FastAPI desktop Server.
 * Verifies the target shell is HTML (not JSON Not Found) before leaving login.
 */

import { getApiBase } from "./api";

const HEALTH_PATH = "/api/system/health";

export async function waitForServerReady(timeoutMs = 20_000): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const base = getApiBase();
  const deadline = Date.now() + timeoutMs;
  let delay = 250;
  while (Date.now() < deadline) {
    try {
      const ctrl = new AbortController();
      const t = window.setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(`${base}${HEALTH_PATH}`, {
        method: "GET",
        cache: "no-store",
        signal: ctrl.signal,
      });
      window.clearTimeout(t);
      if (res.ok) return true;
    } catch {
      /* server still waking after PC sleep */
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, 2000);
  }
  return false;
}

/** Normalize clinic app paths so FastAPI serves `.../index.html`. */
export function normalizeAppPath(path: string): string {
  let p = (path || "/").trim() || "/";
  if (!p.startsWith("/")) p = `/${p}`;
  p = p.split("?")[0].split("#")[0];
  if (p === "/") return "/";
  // Prefer trailing slash for MPA export directories (dashboard/, pacientes/)
  if (!p.endsWith("/") && !/\.[a-zA-Z0-9]{1,8}$/.test(p)) {
    p = `${p}/`;
  }
  return p;
}

/**
 * Probe that a path returns HTML (SPA shell), not application/json Not Found.
 */
export async function probeAppShell(path: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const target = normalizeAppPath(path);
  const base = getApiBase();
  try {
    const res = await fetch(`${base}${target}`, {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "text/html,application/xhtml+xml" },
    });
    if (!res.ok) return false;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("application/json")) return false;
    // Only read a small prefix if server allows
    const text = await res.text();
    const head = text.trimStart().slice(0, 40);
    if (head.startsWith("{") && head.includes('"detail"')) return false;
    return head.startsWith("<!") || head.toLowerCase().startsWith("<html") || text.includes("<!DOCTYPE");
  } catch {
    return false;
  }
}

/**
 * Navigate to an app shell after login / session restore.
 * Retries server wake + shell probe so PC-sleep resume does not paint JSON errors.
 */
export async function navigateToAppShell(
  path = "/dashboard/",
  opts?: { maxAttempts?: number }
): Promise<void> {
  if (typeof window === "undefined") return;
  const target = normalizeAppPath(path);
  const maxAttempts = opts?.maxAttempts ?? 4;

  await waitForServerReady(15_000);

  for (let i = 0; i < maxAttempts; i++) {
    const ok = await probeAppShell(target);
    if (ok) {
      window.location.assign(target);
      return;
    }
    await new Promise((r) => setTimeout(r, 400 + i * 300));
    await waitForServerReady(5_000);
  }

  // Last resort: home login shell (always HTML) rather than stuck JSON page
  try {
    window.location.assign(target);
  } catch {
    window.location.href = target;
  }
}

/**
 * Detect raw API JSON document (WebView painted FastAPI 404 as body text).
 */
export function isRawApiErrorDocument(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const t = (document.body?.innerText || "").trim();
    if (!t) return false;
    if (t.length > 400) return false;
    if (t.startsWith('{"detail"') || t === '{"detail":"Not Found"}') return true;
    // Minimal chrome sometimes only shows JSON + a stray print option label
    if (t.includes('{"detail":"Not Found"}')) return true;
    return false;
  } catch {
    return false;
  }
}

export function recoverFromRawApiErrorDocument(): boolean {
  if (!isRawApiErrorDocument()) return false;
  try {
    window.location.replace("/");
    return true;
  } catch {
    return false;
  }
}
