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
  id: number;
  nombre: string;
  email: string;
  rol: string;
  activo: boolean;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  needsSetup: boolean;
  refreshUser: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  setup: (nombre: string, email: string, password: string) => Promise<void>;
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
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadSetupStatus = async () => {
    try {
      const status = await apiFetch<{ needs_setup: boolean }>("/api/auth/setup-status");
      if (mounted.current) setNeedsSetup(status.needs_setup);
    } catch {
      /* ignore */
    }
  };

  const refreshUser = useCallback(async () => {
    if (!mounted.current) return;

    // Abrir la URL raíz = siempre pedir credenciales (no restaurar sesión previa).
    if (isLoginPath()) {
      clearToken();
      clearRefreshToken();
      if (mounted.current) {
        setUser(null);
        setLoading(false);
      }
      await loadSetupStatus();
      return;
    }

    const token = getToken();

    if (!looksLikeJwt(token)) {
      clearToken();
      clearRefreshToken();
      if (mounted.current) {
        setUser(null);
        setLoading(false);
      }
      await loadSetupStatus();
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
      await loadSetupStatus();
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const resp = await apiFetch<{ access_token: string; refresh_token: string; user: User }>(
      "/api/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }
    );
    setToken(resp.access_token);
    setRefreshToken(resp.refresh_token);
    setUser(resp.user);
  };

  const setup = async (nombre: string, email: string, password: string) => {
    const resp = await apiFetch<{ access_token: string; refresh_token: string; user: User }>(
      "/api/auth/setup",
      {
        method: "POST",
        body: JSON.stringify({ nombre, email, password }),
      }
    );
    setToken(resp.access_token);
    setRefreshToken(resp.refresh_token);
    setUser(resp.user);
    if (mounted.current) setNeedsSetup(false);
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
      value={{ user, loading, needsSetup, refreshUser, login, setup, logout }}
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
