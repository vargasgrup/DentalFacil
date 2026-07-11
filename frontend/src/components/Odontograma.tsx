"use client";

import type { PlanProposalItem } from "@/lib/odontogramTreatments";
import { OdontogramaAnatomico } from "./odontogram/OdontogramaAnatomico";

/**
 * Odontograma clínico (FDI) — registro visual, historial y vínculo al plan.
 */
export function Odontograma({
  patientId,
  onProposeTreatment,
}: {
  patientId: number;
  onProposeTreatment?: (item: PlanProposalItem) => void;
}) {
  return (
    <OdontogramaAnatomico
      patientId={patientId}
      onProposeTreatment={onProposeTreatment}
    />
  );
}
