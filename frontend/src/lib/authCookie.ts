/** Cookie name used by middleware to gate protected app routes. */
export const AUTH_COOKIE = "ds_access_token";

const isBrowser = () => typeof window !== "undefined";

function cookieSecureFlag(): string {
  if (!isBrowser()) return "";
  return window.location.protocol === "https:" ? "; Secure" : "";
}

/** Persist JWT for API calls + middleware (SameSite=Lax). */
export function writeAuthCookie(token: string, maxAgeSeconds = 60 * 60 * 24 * 7) {
  if (!isBrowser()) return;
  document.cookie = `${AUTH_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${cookieSecureFlag()}`;
}

export function clearAuthCookie() {
  if (!isBrowser()) return;
  document.cookie = `${AUTH_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${cookieSecureFlag()}`;
}

export function readAuthCookie(): string | null {
  if (!isBrowser()) return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${AUTH_COOKIE}=([^;]*)`));
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}
