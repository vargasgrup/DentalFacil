/**
 * Guard de API: si falla por red y la mutación es segura, encola.
 * Caja y pagos NUNCA se encolan.
 */

import { ApiError, getApiBase, getToken } from "./api";
import { enqueueOfflineOp, type OfflineOpKind } from "./offlineQueue";

const SAFE_POST = [/^\/api\/patients\/?$/, /^\/api\/clinical\/[^/]+\/evolution\/?$/];
const SAFE_PATCH = [/^\/api\/patients\/[^/]+$/, /^\/api\/clinical\/[^/]+\/record\/?$/];

function isCash(path: string) {
  return path.includes("/api/cash");
}

function matchKind(path: string, method: string): OfflineOpKind | null {
  if (isCash(path)) return null;
  if (method === "POST" && SAFE_POST.some((r) => r.test(path))) {
    if (path.includes("evolution")) return "evolution_create";
    return "patient_create";
  }
  if ((method === "PATCH" || method === "PUT") && SAFE_PATCH.some((r) => r.test(path))) {
    if (path.includes("record")) return "patient_patch";
    return "patient_patch";
  }
  return null;
}

export async function tryOfflineEnqueue(
  path: string,
  method: string,
  body: unknown,
  networkError: unknown
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (isCash(path)) return false;
  const kind = matchKind(path, method.toUpperCase());
  if (!kind) return false;
  // Only on genuine network failures
  if (networkError instanceof ApiError) return false;
  try {
    await enqueueOfflineOp({
      kind,
      path: path.startsWith("/") ? path : `/${path}`,
      method: method.toUpperCase() as "POST" | "PATCH" | "PUT",
      body,
    });
    return true;
  } catch {
    return false;
  }
}

/** Optional: use when wrapping fetch */
export async function offlineAwareFetch(
  path: string,
  init: RequestInit
): Promise<Response> {
  const base = getApiBase();
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  try {
    return await fetch(`${base}${path}`, {
      ...init,
      headers,
      credentials: "include",
    });
  } catch (e) {
    const method = (init.method || "GET").toUpperCase();
    if (method !== "GET" && init.body) {
      let body: unknown = null;
      try {
        body = JSON.parse(String(init.body));
      } catch {
        body = null;
      }
      if (body) await tryOfflineEnqueue(path, method, body, e);
    }
    throw e;
  }
}
