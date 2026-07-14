import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Must match frontend/src/lib/authCookie.ts AUTH_COOKIE */
const AUTH_COOKIE = "ds_access_token";

const PUBLIC_PATHS = new Set([
  "/",
  "/favicon.ico",
  "/favicon.png",
  "/icon.png",
  "/apple-icon.png",
]);

function looksLikeJwt(token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split(".");
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

function isPublicAsset(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname.startsWith("/api/")) return true;
  if (pathname.startsWith("/dientes/")) return true;
  if (pathname.startsWith("/odontogram/")) return true;
  if (/\.(png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt|xml|woff2?)$/i.test(pathname)) {
    return true;
  }
  return false;
}

function clearSessionCookie(res: NextResponse) {
  res.cookies.set({
    name: AUTH_COOKIE,
    value: "",
    path: "/",
    maxAge: 0,
    sameSite: "lax",
  });
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const raw = request.cookies.get(AUTH_COOKIE)?.value;
  const token = raw ? (() => {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  })() : undefined;
  const hasValidShape = looksLikeJwt(token);

  // Login siempre visible en "/": no auto-redirigir al panel aunque haya cookie.
  // La limpieza de sesión la hace AuthProvider en el cliente (no aquí),
  // para no borrar la cookie justo después de un login exitoso.
  if (pathname === "/") {
    return NextResponse.next();
  }

  if (isPublicAsset(pathname)) {
    return NextResponse.next();
  }

  if (!hasValidShape) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    const res = NextResponse.redirect(url);
    clearSessionCookie(res);
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
