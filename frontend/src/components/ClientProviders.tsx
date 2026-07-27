import { AuthProvider } from "@/lib/auth";
import { ClinicBrandProvider } from "@/lib/clinicBrand";
import { ReactNode } from "react";
import { DocumentSendToast } from "@/components/DocumentSendToast";
import { IdleSessionGuard } from "@/components/IdleSessionGuard";

export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ClinicBrandProvider>
        <IdleSessionGuard />
        {children}
        <DocumentSendToast />
      </ClinicBrandProvider>
    </AuthProvider>
  );
}
