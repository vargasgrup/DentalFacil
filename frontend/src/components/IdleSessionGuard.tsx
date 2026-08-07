"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { waitForServerReady } from "@/lib/desktopNav";

/** Idle minutes before auto-logout (clinic PC left unattended). */
export const IDLE_LOGOUT_MINUTES = 15;

/** Gap treated as OS sleep / lock screen — do not count as "session idle". */
const SUSPEND_GAP_MS = 90_000;

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "click",
];

/**
 * Logs out after {@link IDLE_LOGOUT_MINUTES} of no user interaction.
 * Does not run on the public login screen when there is no session.
 * After OS suspend/resume, resets the idle clock (do not auto-kick mid-login).
 */
export function IdleSessionGuard() {
  const { user, logout } = useAuth();
  const timerRef = useRef<number | null>(null);
  const lastActiveRef = useRef<number>(Date.now());
  const lastTickRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!user) {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const idleMs = IDLE_LOGOUT_MINUTES * 60 * 1000;

    const clearTimer = () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const schedule = () => {
      clearTimer();
      timerRef.current = window.setTimeout(() => {
        const now = Date.now();
        // Wall-clock jump (PC slept under Windows) — reset idle, keep session
        if (now - lastTickRef.current > SUSPEND_GAP_MS) {
          lastActiveRef.current = now;
          lastTickRef.current = now;
          schedule();
          return;
        }
        lastTickRef.current = now;
        const idleFor = now - lastActiveRef.current;
        if (idleFor < idleMs - 1000) {
          schedule();
          return;
        }
        logout();
        try {
          window.location.assign("/");
        } catch {
          /* ignore */
        }
      }, Math.min(30_000, idleMs));
    };

    const onActivity = () => {
      lastActiveRef.current = Date.now();
      lastTickRef.current = Date.now();
      schedule();
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      // Resume after sleep: warm server and refresh idle clock (do not auto-logout)
      if (now - lastTickRef.current > SUSPEND_GAP_MS) {
        lastActiveRef.current = now;
        lastTickRef.current = now;
        void waitForServerReady(12_000);
        schedule();
        return;
      }
      const idleFor = now - lastActiveRef.current;
      if (idleFor >= idleMs) {
        logout();
        window.location.assign("/");
        return;
      }
      schedule();
    };

    lastActiveRef.current = Date.now();
    lastTickRef.current = Date.now();
    schedule();
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, onActivity, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);

    return () => {
      clearTimer();
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, onActivity);
      }
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
    };
  }, [user, logout]);

  return null;
}
