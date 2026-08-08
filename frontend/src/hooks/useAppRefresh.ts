"use client";

import { useEffect, useRef } from "react";
import { APP_REFRESH_EVENT } from "@/lib/appRefresh";

export type ModuleLiveOptions = {
  /** Preferencias de eventos realtime (prefijos: cash., appointment., patient., clinical.) */
  eventPrefixes?: string[];
  /** Debounce ms al agrupar ráfagas multi-PC */
  debounceMs?: number;
};

/**
 * Topbar refresh + LAN realtime (nk:realtime / reconnect).
 * Usar en módulos multi-PC (Agenda, Caja, Pacientes) para no quedar desfasados.
 */
export function useAppRefresh(
  onRefresh: () => void,
  options?: ModuleLiveOptions
): void {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const prefixes = options?.eventPrefixes;
  const debounceMs = options?.debounceMs ?? 320;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        onRefreshRef.current();
      }, debounceMs);
    };

    const onManual = () => schedule();
    const onReconnect = () => schedule();
    const onRealtime = (ev: Event) => {
      const detail = (ev as CustomEvent<{ type?: string }>).detail;
      const type = String(detail?.type || "");
      if (prefixes && prefixes.length > 0) {
        if (!type || !prefixes.some((p) => type === p || type.startsWith(p))) {
          return;
        }
      }
      schedule();
    };

    window.addEventListener(APP_REFRESH_EVENT, onManual);
    window.addEventListener("nk:realtime-reconnect", onReconnect);
    window.addEventListener("nk:realtime", onRealtime);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener(APP_REFRESH_EVENT, onManual);
      window.removeEventListener("nk:realtime-reconnect", onReconnect);
      window.removeEventListener("nk:realtime", onRealtime);
    };
  }, [prefixes, debounceMs]);
}
