"use client";

import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/Input";

interface OpenCashPanelProps {
  showOpen: boolean;
  montoInicial: string;
  setMontoInicial: (v: string) => void;
  saving: boolean;
  onOpen: (e: React.FormEvent) => void;
  onShowOpen: () => void;
  onCancelOpen: () => void;
}

export function OpenCashPanel({
  showOpen,
  montoInicial,
  setMontoInicial,
  saving,
  onOpen,
  onShowOpen,
  onCancelOpen,
}: OpenCashPanelProps) {
  return (
    <EmptyState
      icon={<Wallet className="h-7 w-7" />}
      title="No hay caja abierta"
      description="Abre caja al empezar el día. Luego cobra en 2 clics e imprime o envía el comprobante."
      action={
        showOpen ? (
          <form onSubmit={onOpen} className="mx-auto w-full max-w-xs space-y-3 text-left">
            <Input
              label="Monto inicial (S/)"
              type="number"
              step="0.01"
              min="0"
              value={montoInicial}
              onChange={(e) => setMontoInicial(e.target.value)}
            />
            <div className="flex justify-center gap-2">
              <Button type="submit" loading={saving}>
                Abrir caja
              </Button>
              <Button type="button" variant="ghost" onClick={onCancelOpen}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : (
          <Button onClick={onShowOpen} icon={<Wallet className="h-4 w-4" />}>
            Abrir caja
          </Button>
        )
      }
    />
  );
}
