"use client";

import { ArrowDownCircle, ArrowUpCircle, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ModuleHeader } from "@/components/ui/ModuleHeader";
import type { CashSession } from "./types";

interface CashPageHeaderProps {
  session: CashSession | null;
  onCobrar: () => void;
  onEgreso: () => void;
  onCloseConfirm: () => void;
  onConsultarPorCobrar?: () => void;
  porCobrarCount?: number;
}

export function CashPageHeader({
  session,
  onCobrar,
  onEgreso,
  onCloseConfirm,
  onConsultarPorCobrar,
  porCobrarCount = 0,
}: CashPageHeaderProps) {
  return (
    <ModuleHeader
      crumbs={[
        { label: "Inicio", href: "/dashboard" },
        { label: "Caja" },
      ]}
      title="Caja"
      description="Registro de cobros y egresos, control de sesión y consulta del historial por período."
      actions={
        <>
          {onConsultarPorCobrar ? (
            <Button
              variant="ghost"
              onClick={onConsultarPorCobrar}
              icon={<WalletCards className="h-4 w-4" />}
            >
              Por cobrar
              {porCobrarCount > 0 ? (
                <span className="ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-slate-200 px-1.5 text-[11px] font-semibold tabular-nums text-slate-700">
                  {porCobrarCount}
                </span>
              ) : null}
            </Button>
          ) : null}
          {session ? (
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
          ) : null}
        </>
      }
    />
  );
}
