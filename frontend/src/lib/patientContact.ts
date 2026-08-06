/**
 * Contact resolution for clinic WhatsApp / document send.
 * Prefers the patient's own mobile; falls back to guardian (minors / support).
 */

export type PatientContactFields = {
  telefono?: string | null;
  telefono_responsable?: string | null;
};

function digits(value?: string | null): string {
  return (value || "").replace(/\D/g, "");
}

/** Best phone for WhatsApp / documents across the system. */
export function patientWhatsAppPhone(patient: PatientContactFields | null | undefined): string {
  if (!patient) return "";
  const own = digits(patient.telefono);
  if (own.length >= 9) return own;
  const tutor = digits(patient.telefono_responsable);
  if (tutor.length >= 9) return tutor;
  return own || tutor || "";
}
