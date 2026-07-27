"use client";

import { useEffect } from "react";
import { APP_REFRESH_EVENT } from "@/lib/appRefresh";

/** Subscribe a page/module loader to the global topbar refresh button. */
export function useAppRefresh(onRefresh: () => void): void {
  useEffect(() => {
    const handler = () => {
      onRefresh();
    };
    window.addEventListener(APP_REFRESH_EVENT, handler);
    return () => window.removeEventListener(APP_REFRESH_EVENT, handler);
  }, [onRefresh]);
}
