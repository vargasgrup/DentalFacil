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
  readOnly = false,
}: {
  patientId: string;
  onProposeTreatment?: (item: PlanProposalItem) => void;
  readOnly?: boolean;
}) {
  return (
    <OdontogramaAnatomico
      patientId={patientId}
      readOnly={readOnly}
      onProposeTreatment={onProposeTreatment}
    />
  );
}
