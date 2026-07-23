"use client";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppShell } from "@/components/AppShell";

export default function AgendaLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute module="agenda">
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  );
}
