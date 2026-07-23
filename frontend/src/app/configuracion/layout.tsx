"use client";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppShell } from "@/components/AppShell";

export default function ConfiguracionLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute module="configuracion">
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  );
}
