"use client";

/**
 * Estado de conectividad al backend (/api/health).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getApiBase } from "@/lib/api";

export type ConnectionState = "online" | "offline" | "checking";

interface ConnectionContextValue {
  status: ConnectionState;
  lastOkAt: number | null;
  lastError: string | null;
  checkNow: () => Promise<boolean>;
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

async function pingHealth(timeoutMs = 4000): Promise<boolean> {
  const base = getApiBase();
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/api/health`, {
      method: "GET",
      signal: ctrl.signal,
      cache: "no-store",
      credentials: "include",
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(t);
  }
}

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConnectionState>("checking");
  const [lastOkAt, setLastOkAt] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const checkNow = useCallback(async () => {
    const ok = await pingHealth();
    if (ok) {
      setStatus("online");
      setLastOkAt(Date.now());
      setLastError(null);
    } else {
      setStatus("offline");
      setLastError("Sin respuesta del servidor");
    }
    return ok;
  }, []);

  useEffect(() => {
    void checkNow();
    const id = window.setInterval(() => void checkNow(), 20000);
    const onOnline = () => void checkNow();
    const onOffline = () => {
      setStatus("offline");
      setLastError("Navegador sin red");
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [checkNow]);

  const value = useMemo(
    () => ({ status, lastOkAt, lastError, checkNow }),
    [status, lastOkAt, lastError, checkNow]
  );

  return (
    <ConnectionContext.Provider value={value}>
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnection(): ConnectionContextValue {
  const ctx = useContext(ConnectionContext);
  if (!ctx) {
    throw new Error("useConnection must be used within ConnectionProvider");
  }
  return ctx;
}
