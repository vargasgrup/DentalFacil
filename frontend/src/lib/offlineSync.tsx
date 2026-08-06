"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getApiBase, getToken } from "@/lib/api";
import {
  countOfflineOps,
  flushOfflineQueue,
  type SyncResult,
} from "@/lib/offlineQueue";
import { useConnection } from "@/lib/connectionStatus";

interface OfflineSyncContextValue {
  pending: number;
  syncing: boolean;
  lastSync: SyncResult | null;
  refreshPending: () => Promise<void>;
  syncNow: () => Promise<SyncResult>;
}

const OfflineSyncContext = createContext<OfflineSyncContextValue | null>(null);

export function OfflineSyncProvider({ children }: { children: ReactNode }) {
  const { status } = useConnection();
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);

  const refreshPending = useCallback(async () => {
    try {
      setPending(await countOfflineOps());
    } catch {
      setPending(0);
    }
  }, []);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      const base = getApiBase();
      const result = await flushOfflineQueue(async (path, init) => {
        const headers = new Headers(init.headers);
        const token = getToken();
        if (token) headers.set("Authorization", `Bearer ${token}`);
        return fetch(`${base}${path}`, { ...init, headers, credentials: "include" });
      });
      setLastSync(result);
      setPending(result.remaining);
      return result;
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    void refreshPending();
    const id = window.setInterval(() => void refreshPending(), 15000);
    return () => window.clearInterval(id);
  }, [refreshPending]);

  useEffect(() => {
    if (status === "online" && pending > 0 && !syncing) {
      void syncNow();
    }
  }, [status, pending, syncing, syncNow]);

  const value = useMemo(
    () => ({ pending, syncing, lastSync, refreshPending, syncNow }),
    [pending, syncing, lastSync, refreshPending, syncNow]
  );

  return (
    <OfflineSyncContext.Provider value={value}>
      {children}
    </OfflineSyncContext.Provider>
  );
}

export function useOfflineSync(): OfflineSyncContextValue {
  const ctx = useContext(OfflineSyncContext);
  if (!ctx) {
    throw new Error("useOfflineSync must be used within OfflineSyncProvider");
  }
  return ctx;
}
