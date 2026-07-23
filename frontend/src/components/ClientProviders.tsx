import { AuthProvider } from "@/lib/auth";
import { ReactNode } from "react";
import { DocumentAttachGuide } from "@/components/DocumentAttachGuide";
import { DocumentSendToast } from "@/components/DocumentSendToast";

export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      {children}
      <DocumentSendToast />
      <DocumentAttachGuide />
    </AuthProvider>
  );
}
