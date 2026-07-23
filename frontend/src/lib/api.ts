import { clearAuthCookie, looksLikeJwt, readAuthCookie, writeAuthCookie } from "./authCookie";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

const ACCESS_KEY = "access_token";
const REFRESH_KEY = "refresh_token";

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

function storageGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  // Escritorio multi-PC: localStorage sobrevive reinicios y ventanas nuevas
  const fromLocal = localStorage.getItem(key);
  if (fromLocal) return fromLocal;
  // Migración desde sessionStorage (versión anterior de la app)
  try {
    const fromSession = sessionStorage.getItem(key);
    if (fromSession) {
      localStorage.setItem(key, fromSession);
      sessionStorage.removeItem(key);
      return fromSession;
    }
  } catch {
    /* private mode / storage blocked */
  }
  return null;
}

function storageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore quota */
  }
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function storageRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Punto único de lectura del access token (localStorage → cookie). */
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  const fromStore = storageGet(ACCESS_KEY);
  if (looksLikeJwt(fromStore)) return fromStore;
  const fromCookie = readAuthCookie();
  if (looksLikeJwt(fromCookie)) {
    // Rehidratar store desde cookie (p.ej. otra ventana del escritorio)
    storageSet(ACCESS_KEY, fromCookie!);
    return fromCookie;
  }
  return null;
}

let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const refresh = storageGet(REFRESH_KEY);
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
        if (!body.access_token || !looksLikeJwt(body.access_token)) return false;
        storageSet(ACCESS_KEY, body.access_token);
        writeAuthCookie(body.access_token);
        if (body.refresh_token) {
          storageSet(REFRESH_KEY, body.refresh_token);
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

/** Login/setup/refresh: never treat their 401 as "sesión expirada" ni reintentar refresh. */
function isAuthCredentialPath(path: string): boolean {
  return (
    path.startsWith("/api/auth/login") ||
    path.startsWith("/api/auth/setup") ||
    path.startsWith("/api/auth/refresh") ||
    path.startsWith("/api/auth/setup-status")
  );
}

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const { _retryAuth, ...fetchOptions } = options;
  const token = getToken();
  const headers: Record<string, string> = {
    ...(fetchOptions.headers as Record<string, string>),
  };
  // Solo forzar JSON cuando el body no es FormData
  if (!(fetchOptions.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  // No enviar Bearer en login/setup: evita interferir con credenciales nuevas
  if (token && !isAuthCredentialPath(path)) {
    headers["Authorization"] = `Bearer ${token}`;
  }

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

  if (
    res.status === 401 &&
    !_retryAuth &&
    !isAuthCredentialPath(path)
  ) {
    const renewed = await refreshAccessToken();
    if (renewed) {
      return apiFetch<T>(path, { ...options, _retryAuth: true });
    }
    clearToken();
    clearRefreshToken();
  }

  if (!res.ok) {
    let msg = res.statusText || "Error en la solicitud";
    try {
      const body = await res.json();
      msg = formatApiDetail(body.detail ?? body.message, msg);
    } catch {
      if (res.status >= 500) {
        msg = "Error del servidor. Espera unos segundos e intenta de nuevo.";
      }
    }

    // Solo rutas ya autenticadas hablan de "sesión expirada"
    if (res.status === 401 && !isAuthCredentialPath(path)) {
      const refresh = storageGet(REFRESH_KEY);
      msg = refresh
        ? "Sesión expirada o inválida en este equipo. Cierra sesión e ingresa de nuevo."
        : "No hay sesión activa en este equipo. Inicia sesión para continuar.";
    } else if (res.status === 401 && path.startsWith("/api/auth/login")) {
      msg = msg || "Email o contraseña incorrectos";
    }

    throw new ApiError(msg, res.status);
  }
  if (res.status === 204) return null as T;
  return res.json();
}

export function setToken(token: string) {
  storageSet(ACCESS_KEY, token);
  writeAuthCookie(token);
}

export function clearToken() {
  storageRemove(ACCESS_KEY);
  clearAuthCookie();
}

export function setRefreshToken(token: string | null) {
  if (token) {
    storageSet(REFRESH_KEY, token);
  } else {
    storageRemove(REFRESH_KEY);
  }
}

export function getRefreshToken() {
  return storageGet(REFRESH_KEY);
}

export function clearRefreshToken() {
  storageRemove(REFRESH_KEY);
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

/** Authenticated binary fetch (images/PDF preview) with the same token + refresh rules as apiFetch. */
export async function apiFetchBlob(
  path: string,
  options: ApiFetchOptions = {}
): Promise<Blob> {
  const { _retryAuth, ...fetchOptions } = options;
  const token = getToken();
  const headers: Record<string, string> = {
    ...(fetchOptions.headers as Record<string, string>),
  };
  if (token && !isAuthCredentialPath(path)) {
    headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...fetchOptions, headers });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError("La solicitud fue cancelada o agotó el tiempo de espera.", 0);
    }
    throw new ApiError(
      "No se pudo conectar con el servidor para cargar el archivo.",
      0
    );
  }

  if (res.status === 401 && !_retryAuth && !isAuthCredentialPath(path)) {
    const renewed = await refreshAccessToken();
    if (renewed) {
      return apiFetchBlob(path, { ...options, _retryAuth: true });
    }
    clearToken();
    clearRefreshToken();
    throw new ApiError("Sesión expirada. Cierra sesión e ingresa de nuevo.", 401);
  }

  if (!res.ok) {
    let msg = res.statusText || "Error al obtener el archivo";
    try {
      const body = await res.json();
      msg = formatApiDetail(body.detail ?? body.message, msg);
    } catch {
      if (res.status === 404) msg = "Archivo no encontrado o no disponible en disco.";
      else if (res.status >= 500) {
        msg = "Error del servidor al cargar el archivo.";
      }
    }
    throw new ApiError(msg, res.status);
  }

  return res.blob();
}
