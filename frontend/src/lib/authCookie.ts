/** Cookie name used by middleware to gate protected app routes. */
export const AUTH_COOKIE = "ds_access_token";

const isBrowser = () => typeof window !== "undefined";

function cookieSecureFlag(): string {
  if (!isBrowser()) return "";
  return window.location.protocol === "https:" ? "; Secure" : "";
}

/**
 * Session cookie (no Max-Age): se borra al cerrar el navegador.
 * Obliga a volver a autenticarse en la siguiente apertura del sistema.
 */
export function writeAuthCookie(token: string) {
  if (!isBrowser()) return;
  document.cookie = `${AUTH_COOKIE}=${encodeURIComponent(token)}; Path=/; SameSite=Lax${cookieSecureFlag()}`;
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

/** JWT mínimo: tres segmentos separados por punto. */
export function looksLikeJwt(token: string | null | undefined): boolean {
  if (!token) return false;
  const parts = token.split(".");
  return parts.length === 3 && parts.every((p) => p.length > 0);
}
