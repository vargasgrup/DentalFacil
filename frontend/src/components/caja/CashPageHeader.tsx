"use client";

import { ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ModuleHeader } from "@/components/ui/ModuleHeader";
import type { CashSession } from "./types";

interface CashPageHeaderProps {
  session: CashSession | null;
  onCobrar: () => void;
  onEgreso: () => void;
  onCloseConfirm: () => void;
}

export function CashPageHeader({
  session,
  onCobrar,
  onEgreso,
  onCloseConfirm,
}: CashPageHeaderProps) {
  return (
    <ModuleHeader
      crumbs={[
        { label: "Inicio", href: "/dashboard" },
        { label: "Caja" },
      ]}
      title="Caja"
      description="Cobros, deudas pendientes y movimientos (sesión, día, semana, mes o año)."
      actions={
        session ? (
          <>
            <Button
              variant="primary"
              onClick={onCobrar}
              icon={<ArrowDownCircle className="h-4 w-4" />}
            >
              Cobrar
            </Button>
            <Button
              variant="secondary"
              onClick={onEgreso}
              icon={<ArrowUpCircle className="h-4 w-4" />}
            >
              Egreso
            </Button>
            <Button variant="danger" onClick={onCloseConfirm}>
              Cerrar caja
            </Button>
          </>
        ) : undefined
      }
    />
  );
}
