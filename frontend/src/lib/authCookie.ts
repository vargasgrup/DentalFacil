/** Cookie name used by middleware to gate protected app routes. */
export const AUTH_COOKIE = "ds_access_token";

/** Alineado con REFRESH_TOKEN_EXPIRE_DAYS del backend (sesión de escritorio). */
export const AUTH_COOKIE_MAX_AGE_SEC = 30 * 24 * 60 * 60;

const isBrowser = () => typeof window !== "undefined";

function cookieSecureFlag(): string {
  if (!isBrowser()) return "";
  return window.location.protocol === "https:" ? "; Secure" : "";
}

/**
 * Cookie persistente (Max-Age): mantiene la sesión al reiniciar la app de escritorio
 * y al abrir nuevas ventanas en el mismo equipo.
 */
export function writeAuthCookie(token: string) {
  if (!isBrowser()) return;
  document.cookie =
    `${AUTH_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${AUTH_COOKIE_MAX_AGE_SEC}; SameSite=Lax` +
    cookieSecureFlag();
}

export function clearAuthCookie() {
  if (!isBrowser()) return;
  document.cookie =
    `${AUTH_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax` + cookieSecureFlag();
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

/** JWT mínimo: tres segmentos separados por punto. */
export function looksLikeJwt(token: string | null | undefined): boolean {
  if (!token) return false;
  const parts = token.split(".");
  return parts.length === 3 && parts.every((p) => p.length > 0);
}
