/** Catálogo COP — fuente UI del selector (ids alineados con backend). */
export type ConsentCatalogItem = {
  id: string;
  label: string;
  title: string;
  preview: string;
};

export const CONSENT_CATALOG: ConsentCatalogItem[] = [
  {
    id: "apicectomia",
    label: "Apicectomía",
    title: "CONSENTIMIENTO INFORMADO PARA LA REALIZACIÓN DE APICECTOMÍA",
    preview:
      "Declaración oficial sobre cirugía periapical: anestesia, técnica, riesgos y complicaciones posibles, con derecho a revocar el consentimiento.",
  },
  {
    id: "caninos_retenidos",
    label: "Caninos retenidos",
    title: "CONSENTIMIENTO INFORMADO PARA LA REALIZACIÓN DE EXODONCIA DE CANINOS",
    preview:
      "Extracción de caninos incluidos: indicaciones, anestesia, procedimiento quirúrgico y riesgos asociados al acto quirúrgico.",
  },
  {
    id: "cirugia_apical",
    label: "Cirugía apical",
    title: "CONSENTIMIENTO INFORMADO PARA LA REALIZACIÓN DE CIRUGÍA APICAL",
    preview:
      "Cirugía periapical / apicectomía: beneficios, limitaciones y complicaciones frecuentes del procedimiento.",
  },
  {
    id: "cirugia_bucal_menor",
    label: "Cirugía bucal menor",
    title: "CONSENTIMIENTO INFORMADO PARA LA CIRUGÍA ORAL MENOR",
    preview:
      "Cirugía oral menor (extracciones, frenillos, quistes, preprotésica): riesgos de anestesia y complicaciones locales.",
  },
  {
    id: "cirugia_ortognatica",
    label: "Cirugía ortognática",
    title: "CONSENTIMIENTO INFORMADO PARA LA CIRUGÍA ORTOGNÁTICA O DE LAS DEFORMIDADES",
    preview:
      "Autorización para cirugía ortognática, con posibilidad de procedimientos adicionales justificados y derecho de revocación.",
  },
  {
    id: "cirugia_tercera_molar",
    label: "Cirugía de tercera molar",
    title: "CONSENTIMIENTO INFORMADO PARA EXODONCIA QUIRÚRGICA DE TERCEROS MOLARES",
    preview:
      "Exodoncia quirúrgica de terceros molares: indicaciones, complicaciones neurológicas, sinusales e infecciosas.",
  },
  {
    id: "endodoncia",
    label: "Endodoncia",
    title: "CONSENTIMIENTO INFORMADO PARA ENDODONCIA",
    preview:
      "Tratamiento de conductos: propósito, anestesia, técnica, riesgos de reintervención y debilitamiento dental.",
  },
  {
    id: "exodoncia_simple",
    label: "Exodoncia simple",
    title: "CONSENTIMIENTO INFORMADO PARA LA EXODONCIA SIMPLE",
    preview:
      "Extracción dental simple: alternativas conservadoras descartadas, anestesia, técnica y riesgos del procedimiento.",
  },
  {
    id: "implantes",
    label: "Implantes dentales",
    title: "CONSENTIMIENTO INFORMADO PARA IMPLANTES DENTALES",
    preview:
      "Colocación de implantes: alternativas protésicas, riesgos quirúrgicos, tasa de fracaso e higiene de mantenimiento.",
  },
  {
    id: "operatoria",
    label: "Operatoria dental",
    title: "CONSENTIMIENTO INFORMADO PARA OBTURACIONES",
    preview:
      "Obturaciones / empastes: restauración de tejidos duros, sensibilidad postoperatoria y posibles tratamientos posteriores.",
  },
  {
    id: "ortodoncia",
    label: "Ortodoncia",
    title: "CONSENTIMIENTO INFORMADO PARA ORTODONCIA",
    preview:
      "Tratamiento ortodóntico con aparatos fijos o removibles: molestias, reabsorción radicular y compromisos de higiene.",
  },
  {
    id: "periodoncia",
    label: "Periodoncia",
    title: "CONSENTIMIENTO INFORMADO PARA PERIODONCIA",
    preview:
      "Tratamiento periodontal: control de infección, anestesia y riesgos asociados al soporte dental.",
  },
  {
    id: "protesis_fija",
    label: "Prótesis fija",
    title: "CONSENTIMIENTO INFORMADO PARA PRÓTESIS FIJA",
    preview:
      "Prótesis fija: tallado de pilares, posibles endodoncias, higiene y controles periódicos.",
  },
  {
    id: "rehabilitacion_oral",
    label: "Rehabilitación oral",
    title: "CONSENTIMIENTO INFORMADO EN REHABILITACIÓN ORAL",
    preview:
      "Plan integral de rehabilitación (anestesia, extracciones, obturaciones, endodoncia y prótesis) con sus riesgos.",
  },
  {
    id: "tercera_molar",
    label: "Tercera molar",
    title: "CONSENTIMIENTO INFORMADO PARA LA EXODONCIA DE LA TERCERA MOLAR",
    preview:
      "Extracción de cordales: anestesia, hemorragia, lesión nerviosa y alternativas conservadoras descartadas.",
  },
];

export const DEFAULT_CONSENT_TIPO = "exodoncia_simple";
