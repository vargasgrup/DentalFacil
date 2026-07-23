"use client";

import { ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
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
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-page-title text-slate-800">Caja</h1>
        <p className="mt-1 text-sm text-slate-500">
          Cobros del día: registra, imprime o envía el comprobante en un par de clics.
        </p>
      </div>
      {session && (
        <div className="flex flex-wrap gap-2">
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
        </div>
      )}
    </div>
  );
}
