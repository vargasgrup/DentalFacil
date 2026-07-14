"use client";

import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { looksLikeJwt } from "@/lib/authCookie";

/**
 * Client-side gate for authenticated app areas.
 * Complements Next.js middleware (cookie). Never renders children without a valid user.
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, refreshUser } = useAuth();
  const router = useRouter();
  const recovering = useRef(false);

  useEffect(() => {
    if (loading || user || recovering.current) return;

    const token =
      typeof window !== "undefined" ? sessionStorage.getItem("access_token") : null;

    // Tras login con hard-nav, a veces el contexto aún no hidrató el usuario
    // pero el token ya está en sessionStorage: intentar recuperarlo.
    if (looksLikeJwt(token)) {
      recovering.current = true;
      void refreshUser().finally(() => {
        recovering.current = false;
      });
      return;
    }

    router.replace("/");
  }, [user, loading, router, refreshUser]);

  if (loading || (!user && looksLikeJwt(
    typeof window !== "undefined" ? sessionStorage.getItem("access_token") : null
  ))) {
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
