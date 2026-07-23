import { AuthProvider } from "@/lib/auth";
import { ReactNode } from "react";
import { DocumentSendToast } from "@/components/DocumentSendToast";

export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      {children}
      <DocumentSendToast />
    </AuthProvider>
  );
}
