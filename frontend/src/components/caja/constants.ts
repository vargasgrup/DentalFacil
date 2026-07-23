export const INCOME_PRESETS = [
  "Consulta",
  "Curación",
  "Limpieza",
  "Abono tratamiento",
  "Ortodoncia",
  "Radiografía",
];

export const EXPENSE_PRESETS = [
  "Insumos",
  "Servicios",
  "Compra materiales",
  "Gastos varios",
];

export const METODOS = [
  { value: "efectivo", label: "Efectivo" },
  { value: "yape", label: "Yape" },
  { value: "plin", label: "Plin" },
  { value: "transferencia", label: "Transferencia" },
  { value: "tarjeta", label: "Tarjeta" },
] as const;

export const METODO_LABEL: Record<string, string> = Object.fromEntries(
  METODOS.map((m) => [m.value, m.label])
);
