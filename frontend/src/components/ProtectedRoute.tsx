"use client";

import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

/**
 * Client-side gate for authenticated app areas.
 * Complements Next.js middleware (cookie). Never renders children without a valid user.
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" aria-label="Verificando sesión" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" aria-label="Redirigiendo al login" />
      </div>
    );
  }

  return <>{children}</>;
}
