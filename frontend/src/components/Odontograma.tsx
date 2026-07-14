"use client";

import type { PlanProposalItem } from "@/lib/odontogramTreatments";
import { OdontogramaAnatomico } from "./odontogram/OdontogramaAnatomico";

/**
 * Odontograma clínico FDI — layout y dientes según referencia Odontograma.jpg (M&D).
 * Grilla 6×6, arcadas anatómicas, cruces MDVLO; misma API de persistencia.
 */
export function Odontograma({
  patientId,
  onProposeTreatment,
}: {
  patientId: string;
  onProposeTreatment?: (item: PlanProposalItem) => void;
}) {
  return (
    <OdontogramaAnatomico
      patientId={patientId}
      onProposeTreatment={onProposeTreatment}
    />
  );
}
