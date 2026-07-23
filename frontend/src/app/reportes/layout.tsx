"use client";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppShell } from "@/components/AppShell";

export default function ReportesLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute module="reportes">
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  );
}
