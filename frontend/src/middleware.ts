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

function isPublicAsset(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname.startsWith("/api/")) return true; // proxied API; backend enforces JWT
  if (pathname.startsWith("/dientes/")) return true;
  if (pathname.startsWith("/odontogram/")) return true;
  if (/\.(png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt|xml|woff2?)$/i.test(pathname)) {
    return true;
  }
  return false;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicAsset(pathname)) {
    // Already logged in → skip login screen
    if (pathname === "/") {
      const token = request.cookies.get(AUTH_COOKIE)?.value;
      if (token) {
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        return NextResponse.redirect(url);
      }
    }
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Protect all app routes except static assets handled above.
     * Login "/" is public; authenticated users are redirected to dashboard.
     */
    "/((?!_next/static|_next/image).*)",
  ],
};
