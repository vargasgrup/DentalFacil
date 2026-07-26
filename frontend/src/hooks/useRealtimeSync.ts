"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getToken, getApiBase } from "@/lib/api";

export type RealtimeStatus = "offline" | "connecting" | "online" | "reconnecting";

export type RealtimeEvent = {
  type: string;
  payload?: Record<string, unknown>;
  actor?: string | null;
};

type Options = {
  enabled?: boolean;
  onEvent?: (event: RealtimeEvent) => void;
};

function wsUrlFromApi(): string {
  const api = getApiBase();
  if (api.startsWith("https://")) return api.replace(/^https/, "wss") + "/api/ws";
  if (api.startsWith("http://")) return api.replace(/^http/, "ws") + "/api/ws";
  // Same-origin / proxied
  if (typeof window === "undefined") return "/api/ws";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/ws`;
}

/**
 * LAN realtime sync — reconnects with exponential backoff.
 * On reconnect, callers should refresh their screens (no event replay in v1).
 */
export function useRealtimeSync(options: Options = {}) {
  const { enabled = true, onEvent } = options;
  const [status, setStatus] = useState<RealtimeStatus>("offline");
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const clearPing = useCallback(() => {
    if (pingRef.current) {
      clearTimeout(pingRef.current);
      pingRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    clearPing();
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
    }
  }, [clearPing]);

  const connect = useCallback(() => {
    if (!enabled || typeof window === "undefined") return;
    const token = getToken();
    if (!token) {
      setStatus("offline");
      return;
    }
    cleanup();
    setStatus(attemptRef.current === 0 ? "connecting" : "reconnecting");
    const url = `${wsUrlFromApi()}?token=${encodeURIComponent(token)}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      setStatus("reconnecting");
      attemptRef.current += 1;
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(attemptRef.current, 5));
      timerRef.current = setTimeout(connect, delay);
      return;
    }
    wsRef.current = ws;
    ws.onopen = () => {
      attemptRef.current = 0;
      setStatus("online");
      window.dispatchEvent(new CustomEvent("nk:realtime-reconnect"));
      clearPing();
      const beat = () => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send("ping");
          } catch {
            /* ignore */
          }
          pingRef.current = setTimeout(beat, 25_000);
        }
      };
      pingRef.current = setTimeout(beat, 25_000);
    };
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data)) as RealtimeEvent;
        if (!data?.type) return;
        if (data.type === "pong") return;
        setLastEvent(data);
        onEventRef.current?.(data);
        window.dispatchEvent(new CustomEvent("nk:realtime", { detail: data }));
      } catch {
        /* ignore malformed */
      }
    };
    ws.onclose = () => {
      clearPing();
      setStatus("reconnecting");
      attemptRef.current += 1;
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(attemptRef.current, 5));
      timerRef.current = setTimeout(connect, delay);
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    };
  }, [cleanup, clearPing, enabled]);

  useEffect(() => {
    connect();
    return cleanup;
  }, [connect, cleanup]);

  return { status, lastEvent, reconnect: connect };
}
