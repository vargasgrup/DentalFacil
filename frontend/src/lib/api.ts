import { clearAuthCookie, readAuthCookie, writeAuthCookie } from "./authCookie";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Normalize FastAPI `detail` (string | list | object) into a readable message. */
export function formatApiDetail(detail: unknown, fallback = "Error en la solicitud"): string {
  if (detail == null || detail === "") return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const parts = detail.map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "msg" in item) {
        const loc = Array.isArray((item as { loc?: unknown }).loc)
          ? (item as { loc: unknown[] }).loc.filter((x) => x !== "body").join(".")
          : "";
        const msg = String((item as { msg: unknown }).msg);
        return loc ? `${loc}: ${msg}` : msg;
      }
      try {
        return JSON.stringify(item);
      } catch {
        return String(item);
      }
    });
    return parts.filter(Boolean).join("; ") || fallback;
  }
  if (typeof detail === "object") {
    try {
      return JSON.stringify(detail);
    } catch {
      return fallback;
    }
  }
  return String(detail);
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token") || readAuthCookie();
}

let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const refresh = localStorage.getItem("refresh_token");
  if (!refresh) return false;

  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refresh }),
        });
        if (!res.ok) return false;
        const body = (await res.json()) as {
          access_token?: string;
          refresh_token?: string;
        };
        if (!body.access_token) return false;
        localStorage.setItem("access_token", body.access_token);
        writeAuthCookie(body.access_token);
        if (body.refresh_token) {
          localStorage.setItem("refresh_token", body.refresh_token);
        }
        return true;
      } catch {
        return false;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

type ApiFetchOptions = RequestInit & { _retryAuth?: boolean };

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const { _retryAuth, ...fetchOptions } = options;
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(fetchOptions.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...fetchOptions, headers });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError("La solicitud fue cancelada o agotó el tiempo de espera.", 0);
    }
    throw new ApiError(
      "No se pudo conectar con el servidor. Si estás en Railway, borra NEXT_PUBLIC_API_URL y define BACKEND_URL en el Frontend.",
      0
    );
  }

  if (res.status === 401 && !_retryAuth && path !== "/api/auth/refresh") {
    const renewed = await refreshAccessToken();
    if (renewed) {
      return apiFetch<T>(path, { ...options, _retryAuth: true });
    }
    // Sesión inválida: limpiar tokens para forzar login
    clearToken();
    clearRefreshToken();
  }

  if (!res.ok) {
    let msg = res.statusText || "Error en la solicitud";
    try {
      const body = await res.json();
      msg = formatApiDetail(body.detail ?? body.message, msg);
    } catch { /* ignore */ }
    if (res.status === 401) {
      msg = "Sesión expirada. Cierra sesión e ingresa de nuevo.";
    }
    throw new ApiError(msg, res.status);
  }
  if (res.status === 204) return null as T;
  return res.json();
}

export function setToken(token: string) {
  localStorage.setItem("access_token", token);
  writeAuthCookie(token);
}

export function clearToken() {
  localStorage.removeItem("access_token");
  clearAuthCookie();
}

export function setRefreshToken(token: string | null) {
  if (token) {
    localStorage.setItem("refresh_token", token);
  } else {
    localStorage.removeItem("refresh_token");
  }
}

export function getRefreshToken() {
  return typeof window !== "undefined" ? localStorage.getItem("refresh_token") : null;
}

export function clearRefreshToken() {
  localStorage.removeItem("refresh_token");
}

/** Multipart upload (e.g. clinic logo). Do not set Content-Type manually. */
export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: formData,
  });
  if (!res.ok) {
    let msg = res.statusText || "Error al subir archivo";
    try {
      const body = await res.json();
      msg = formatApiDetail(body.detail ?? body.message, msg);
    } catch {
      /* ignore */
    }
    throw new ApiError(msg, res.status);
  }
  if (res.status === 204) return null as T;
  return res.json();
}
