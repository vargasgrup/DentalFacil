"use client";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppShell } from "@/components/AppShell";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute module="dashboard">
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  );
}
