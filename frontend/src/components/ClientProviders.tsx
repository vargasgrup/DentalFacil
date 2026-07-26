import { AuthProvider } from "@/lib/auth";
import { ReactNode } from "react";
import { DocumentSendToast } from "@/components/DocumentSendToast";
import { IdleSessionGuard } from "@/components/IdleSessionGuard";

export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <IdleSessionGuard />
      {children}
      <DocumentSendToast />
    </AuthProvider>
  );
}
