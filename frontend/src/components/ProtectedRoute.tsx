"use client";

import { useAuth } from "@/lib/auth";
import { getToken } from "@/lib/api";
import { looksLikeJwt } from "@/lib/authCookie";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

/**
 * Client-side gate for authenticated app areas.
 * Complements Next.js middleware (cookie). Never renders children without a valid user.
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, refreshUser } = useAuth();
  const router = useRouter();
  const recovering = useRef(false);
  const hasToken = looksLikeJwt(getToken());

  useEffect(() => {
    if (loading || user || recovering.current) return;

    const token = getToken();
    if (looksLikeJwt(token)) {
      recovering.current = true;
      void refreshUser().finally(() => {
        recovering.current = false;
      });
      return;
    }

    router.replace("/");
  }, [user, loading, router, refreshUser]);

  if (loading || (!user && hasToken)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted">
        <Loader2 className="h-6 w-6 animate-spin text-brand-600" aria-label="Verificando sesión" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted">
        <Loader2 className="h-6 w-6 animate-spin text-brand-600" aria-label="Redirigiendo al login" />
      </div>
    );
  }

  return <>{children}</>;
}
