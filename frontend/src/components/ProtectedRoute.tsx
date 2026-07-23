"use client";

import { useAuth } from "@/lib/auth";
import { getToken } from "@/lib/api";
import { looksLikeJwt } from "@/lib/authCookie";
import { canAccessModule, type AppModule } from "@/lib/roles";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

/**
 * Client-side gate for authenticated app areas.
 * Optionally restrict by module (role-filtered navigation).
 */
export function ProtectedRoute({
  children,
  module,
}: {
  children: React.ReactNode;
  /** If set, only roles with access to this module may enter */
  module?: AppModule;
}) {
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

  useEffect(() => {
    if (loading || !user || !module) return;
    if (!canAccessModule(user.rol, module)) {
      router.replace("/dashboard");
    }
  }, [user, loading, module, router]);

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

  if (module && !canAccessModule(user.rol, module)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted">
        <Loader2 className="h-6 w-6 animate-spin text-brand-600" aria-label="Redirigiendo" />
      </div>
    );
  }

  return <>{children}</>;
}
