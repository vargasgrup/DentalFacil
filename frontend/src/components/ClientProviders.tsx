"use client";

import { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth";
import { ClinicBrandProvider } from "@/lib/clinicBrand";
import { UiPreferencesProvider } from "@/lib/uiPreferences";
import { SidebarProvider } from "@/components/SidebarContext";
import { DocumentSendToast } from "@/components/DocumentSendToast";
import { IdleSessionGuard } from "@/components/IdleSessionGuard";

export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ClinicBrandProvider>
        <UiPreferencesProvider>
          <SidebarProvider>
            <IdleSessionGuard />
            {children}
            <DocumentSendToast />
          </SidebarProvider>
        </UiPreferencesProvider>
      </ClinicBrandProvider>
    </AuthProvider>
  );
}
