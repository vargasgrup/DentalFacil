/**
 * Runtime mode for dual deployment: clinic Desktop/LAN Server vs Web/Cloud SaaS.
 * Presentation and feature-gating only — does not change API contracts.
 */

export type AppRuntimeMode = "lan_desktop" | "web_cloud";

function isPrivateIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

/**
 * True when the UI is served from the clinic Server / LAN Client stack
 * (FastAPI :8001, loopback, or private LAN IP). False for Railway / public web.
 */
export function getAppRuntimeMode(): AppRuntimeMode {
  if (typeof window === "undefined") return "web_cloud";

  const host = (window.location.hostname || "").toLowerCase();
  const port = window.location.port;

  // Desktop installer + LAN clients share FastAPI on TCP 8001
  if (port === "8001") return "lan_desktop";

  // Local loopback (installer UI or local Next → proxied API)
  if (host === "localhost" || host === "127.0.0.1") return "lan_desktop";

  // Client opened via clinic private IP (any port)
  if (isPrivateIpv4(host)) return "lan_desktop";

  return "web_cloud";
}

export function isLanDesktopRuntime(): boolean {
  return getAppRuntimeMode() === "lan_desktop";
}

export function isWebCloudRuntime(): boolean {
  return getAppRuntimeMode() === "web_cloud";
}
