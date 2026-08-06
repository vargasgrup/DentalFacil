"use client";

import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from "react";
import {
  apiFetch,
  getToken,
  setToken,
  clearToken,
  getRefreshToken,
  setRefreshToken,
  clearRefreshToken,
} from "./api";
import { looksLikeJwt, writeAuthCookie } from "./authCookie";

interface User {
  id: string;
  nombre: string;
  username: string;
  email?: string | null;
  rol: string;
  activo: boolean;
  modulos_acceso?: string[];
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  needsSetup: boolean;
  demoMode: boolean;
  refreshUser: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  setup: (
    nombre: string,
    username: string,
    password: string,
    email?: string
  ) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function isLoginPath(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname === "/" || window.location.pathname === "";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadSetupStatus = async () => {
    try {
      const status = await apiFetch<{
        needs_setup: boolean;
        demo_mode?: boolean;
        demo_admin_credentials_locked?: boolean;
      }>("/api/auth/setup-status");
      if (mounted.current) {
        setNeedsSetup(status.needs_setup);
        setDemoMode(
          Boolean(status.demo_mode || status.demo_admin_credentials_locked)
        );
      }
    } catch {
      /* ignore */
    }
  };

  const refreshUser = useCallback(async () => {
    if (!mounted.current) return;

    const token = getToken();

    // Always refresh DEMO flags (shared Admin credentials lock), even when logged in.
    const flagsPromise = loadSetupStatus();

    // Pantalla de login: si hay sesión válida, restaurarla (escritorio);
    // no borrar tokens al abrir "/" — eso provocaba "Sesión expirada" al crear pacientes.
    if (isLoginPath()) {
      if (!looksLikeJwt(token)) {
        if (mounted.current) {
          setUser(null);
          setLoading(false);
        }
        await flagsPromise;
        return;
      }
      writeAuthCookie(token!);
      try {
        const me = await apiFetch<User>("/api/users/me");
        if (mounted.current) {
          setUser(me);
          setNeedsSetup(false);
        }
      } catch {
        clearToken();
        clearRefreshToken();
        if (mounted.current) setUser(null);
      } finally {
        if (mounted.current) setLoading(false);
      }
      await flagsPromise;
      return;
    }

    if (!looksLikeJwt(token)) {
      clearToken();
      clearRefreshToken();
      if (mounted.current) {
        setUser(null);
        setLoading(false);
      }
      await flagsPromise;
      return;
    }

    writeAuthCookie(token!);

    try {
      const me = await apiFetch<User>("/api/users/me");
      if (mounted.current) {
        setUser(me);
        setNeedsSetup(false);
      }
    } catch {
      clearToken();
      clearRefreshToken();
      if (mounted.current) {
        setUser(null);
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
    await flagsPromise;
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const login = async (username: string, password: string) => {
    const resp = await apiFetch<{ access_token: string; refresh_token: string; user: User }>(
      "/api/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ username: username.trim(), password }),
      }
    );
    setToken(resp.access_token);
    setRefreshToken(resp.refresh_token);
    setUser(resp.user);
    await loadSetupStatus();
  };

  const setup = async (
    nombre: string,
    username: string,
    password: string,
    email?: string
  ) => {
    const body: Record<string, string> = {
      nombre: nombre.trim(),
      username: username.trim(),
      password,
    };
    const recovery = (email || "").trim();
    if (recovery) body.email = recovery.toLowerCase();
    const resp = await apiFetch<{ access_token: string; refresh_token: string; user: User }>(
      "/api/auth/setup",
      {
        method: "POST",
        body: JSON.stringify(body),
      }
    );
    setToken(resp.access_token);
    setRefreshToken(resp.refresh_token);
    setUser(resp.user);
    if (mounted.current) setNeedsSetup(false);
    await loadSetupStatus();
  };

  const logout = () => {
    const refresh = getRefreshToken();
    // Fire-and-forget server-side revocation before clearing local tokens
    void apiFetch("/api/auth/logout", {
      method: "POST",
      body: JSON.stringify(refresh ? { refresh_token: refresh } : {}),
    }).catch(() => {});
    clearToken();
    clearRefreshToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, needsSetup, demoMode, refreshUser, login, setup, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
