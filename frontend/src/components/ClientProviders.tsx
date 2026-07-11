import { AuthProvider } from "@/lib/auth";
import { ReactNode } from "react";

export function ClientProviders({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
