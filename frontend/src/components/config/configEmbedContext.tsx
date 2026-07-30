"use client";

import { createContext, useContext } from "react";

/** True when ConfigSection is rendered inside ConfigSettingsShell. */
export const ConfigEmbedCtx = createContext(false);

export function useConfigEmbedded(): boolean {
  return useContext(ConfigEmbedCtx);
}
