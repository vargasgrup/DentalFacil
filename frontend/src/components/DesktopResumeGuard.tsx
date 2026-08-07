"use client";

import { useEffect, useRef } from "react";
import {
  isRawApiErrorDocument,
  recoverFromRawApiErrorDocument,
  waitForServerReady,
} from "@/lib/desktopNav";
import { isLanDesktopRuntime } from "@/lib/runtimeMode";

/**
 * Desktop integrity after PC sleep / WebView freeze:
 * - Recover from raw FastAPI JSON "Not Found" documents
 * - Re-ping health when the window becomes visible again after a long gap
 */
export function DesktopResumeGuard() {
  const lastVisibleRef = useRef<number>(Date.now());
  const recoveringRef = useRef(false);

  useEffect(() => {
    // Immediate repair if this document IS the JSON error page
    if (recoverFromRawApiErrorDocument()) return;

    const onVisible = () => {
      if (document.visibilityState !== "visible") {
        lastVisibleRef.current = Date.now();
        return;
      }
      if (isRawApiErrorDocument()) {
        recoverFromRawApiErrorDocument();
        return;
      }
      if (!isLanDesktopRuntime()) return;

      const gap = Date.now() - lastVisibleRef.current;
      lastVisibleRef.current = Date.now();
      // ~15s+ away: treat as sleep / unfocus / lock — warm the API
      if (gap < 15_000 || recoveringRef.current) return;
      recoveringRef.current = true;
      void waitForServerReady(12_000)
        .then((ok) => {
          if (!ok && isRawApiErrorDocument()) {
            recoverFromRawApiErrorDocument();
          }
        })
        .finally(() => {
          recoveringRef.current = false;
        });
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onVisible);

    // Inject early text detection for documents that never boot React
    // (already handled if React mounts); keep interval short-lived.
    let ticks = 0;
    const id = window.setInterval(() => {
      ticks += 1;
      if (isRawApiErrorDocument()) {
        recoverFromRawApiErrorDocument();
        window.clearInterval(id);
      }
      if (ticks > 20) window.clearInterval(id);
    }, 250);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onVisible);
      window.clearInterval(id);
    };
  }, []);

  return null;
}
