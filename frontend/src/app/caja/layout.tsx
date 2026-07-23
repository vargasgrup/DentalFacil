"use client";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppShell } from "@/components/AppShell";

export default function CajaLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute module="caja">
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  );
}
