"use client";

import type { ReactNode } from "react";
import { useConfigEmbedded } from "@/components/config/configEmbedContext";
import { Card } from "@/components/ui/Card";

interface ConfigSectionProps {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
}

/**
 * Shared premium shell for Configuración panels — presentation only.
 * Inside ConfigSettingsShell, chrome collapses so the side-nav panel owns the header.
 */
export function ConfigSection({
  title,
  description,
  icon,
  actions,
  children,
  className = "",
  padding = "md",
}: ConfigSectionProps) {
  const embedded = useConfigEmbedded();

  if (embedded) {
    return (
      <div className={`space-y-4 ${className}`.trim()}>
        {actions ? (
          <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
        ) : null}
        {children}
      </div>
    );
  }

  return (
    <Card
      padding={padding}
      className={`module-surface space-y-4 !border-slate-200/90 ${className}`.trim()}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100/90 pb-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-section-title tracking-tight text-slate-900">
            {icon ? (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                {icon}
              </span>
            ) : null}
            {title}
          </h2>
          {description ? (
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-500">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children}
    </Card>
  );
}
