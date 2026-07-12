"use client";

import type { PlanProposalItem } from "@/lib/odontogramTreatments";
import { OdontogramaRealista } from "./odontogram/realista/OdontogramaRealista";

/**
 * Odontograma clínico (FDI) — render realista Konva + mismos endpoints API.
 * Drop-in: props idénticas al odontograma anatómico previo.
 */
export function Odontograma({
  patientId,
  onProposeTreatment,
}: {
  patientId: number;
  onProposeTreatment?: (item: PlanProposalItem) => void;
}) {
  return (
    <OdontogramaRealista
      patientId={patientId}
      onProposeTreatment={onProposeTreatment}
    />
  );
}
