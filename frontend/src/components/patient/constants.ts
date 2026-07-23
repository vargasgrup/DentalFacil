import type { FichaTab } from "./types";

export const FICHA_TABS: { id: FichaTab; label: string; description: string }[] = [
  {
    id: "historia",
    label: "Historia clínica",
    description: "Identificación y antecedentes",
  },
  {
    id: "evaluacion",
    label: "Evaluación y plan",
    description: "Odontograma, plan y pruebas",
  },
  {
    id: "seguimiento",
    label: "Seguimiento clínico",
    description: "Evolución, finanzas y documentos",
  },
];

export const HABITOS = [
  { key: "cepillado", label: "Cepillado regular" },
  { key: "hilo", label: "Uso de hilo dental" },
  { key: "bruxismo", label: "Bruxismo" },
  { key: "fumar", label: "Fuma" },
  { key: "ortodoncia", label: "Ortodoncia previa" },
] as const;

export const CONSENT_TEXT = (patientName: string, documentNum: string, doctorName: string) =>
  `Yo, ${patientName}, identificado(a) con DNI ${documentNum}, declaro que he sido informado(a) sobre mi diagnóstico odontológico y el plan de tratamiento propuesto por el/la Dr.(a) ${doctorName}. He comprendido los beneficios, riesgos y alternativas del tratamiento, así como las consecuencias de no recibirlo. Autorizo al profesional mencionado a realizar los procedimientos necesarios para mi atención odontológica.`;

export const FIELD_CLASS =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm tracking-normal leading-relaxed focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600";
