"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { SaveState } from "@/components/patient/types";

export function Section({
  title,
  children,
  onSave,
  saveState,
  action,
  noSave,
}: {
  title: string;
  children: React.ReactNode;
  onSave?: () => void;
  saveState?: SaveState;
  action?: React.ReactNode;
  noSave?: boolean;
}) {
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-section-title tracking-normal text-slate-800">{title}</h2>
        <div className="flex items-center gap-3">
          {action}
          {onSave && !noSave && (
            <Button
              onClick={onSave}
              variant={saveState === "saved" ? "secondary" : "primary"}
              disabled={saveState === "saving"}
            >
              {saveState === "saving"
                ? "Guardando..."
                : saveState === "saved"
                  ? "Guardado"
                  : "Guardar"}
            </Button>
          )}
        </div>
      </div>
      {children}
    </Card>
  );
}
