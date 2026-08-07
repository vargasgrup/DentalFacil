"use client";

import { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth";
import { ClinicBrandProvider } from "@/lib/clinicBrand";
import { UiPreferencesProvider } from "@/lib/uiPreferences";
import { SidebarProvider } from "@/components/SidebarContext";
import { ConnectionProvider } from "@/lib/connectionStatus";
import { OfflineSyncProvider } from "@/lib/offlineSync";
import { ShortcutsListener } from "@/components/ShortcutsListener";
import { DocumentSendToast } from "@/components/DocumentSendToast";
import { IdleSessionGuard } from "@/components/IdleSessionGuard";
import { DesktopResumeGuard } from "@/components/DesktopResumeGuard";

export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ClinicBrandProvider>
        <UiPreferencesProvider>
          <SidebarProvider>
            <ConnectionProvider>
              <OfflineSyncProvider>
                <ShortcutsListener>
                  <DesktopResumeGuard />
                  <IdleSessionGuard />
                  {children}
                  <DocumentSendToast />
                </ShortcutsListener>
              </OfflineSyncProvider>
            </ConnectionProvider>
          </SidebarProvider>
        </UiPreferencesProvider>
      </ClinicBrandProvider>
    </AuthProvider>
  );
}
