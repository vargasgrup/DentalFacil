"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";

/** Idle minutes before auto-logout (clinic PC left unattended). */
export const IDLE_LOGOUT_MINUTES = 15;

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
 */
export function IdleSessionGuard() {
  const { user, logout } = useAuth();
  const timerRef = useRef<number | null>(null);
  const lastActiveRef = useRef<number>(Date.now());

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
        const idleFor = Date.now() - lastActiveRef.current;
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
      }, idleMs);
    };

    const onActivity = () => {
      lastActiveRef.current = Date.now();
      schedule();
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const idleFor = Date.now() - lastActiveRef.current;
      if (idleFor >= idleMs) {
        logout();
        window.location.assign("/");
        return;
      }
      schedule();
    };

    lastActiveRef.current = Date.now();
    schedule();
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, onActivity, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearTimer();
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, onActivity);
      }
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [user, logout]);

  return null;
}
