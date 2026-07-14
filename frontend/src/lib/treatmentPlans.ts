/** Planes de tratamiento con alternativas A/B/C + economía alineada a evolución. */

export type ClinicalEstado = "pendiente" | "en_proceso" | "completado";

export interface PlanItem {
  /** Stable id for linking to evolution entries */
  id?: string;
  item: string;
  cantidad: number;
  costo_unitario?: number;
  /** Anticipo / parcial asociado al ítem del presupuesto */
  a_cuenta?: number;
  estado?: ClinicalEstado | string;
  pieza_fdi?: string;
  condicion_id?: string;
  origen?: "odontogram" | "manual";
  /** FK soft → clinical_evolution_entries.id when sent to evolución */
  evolution_entry_id?: string;
}

export interface PlanAlternative {
  id: string;
  nombre: string;
  items: PlanItem[];
}

export interface TreatmentPlans {
  active_id: string;
  alternatives: PlanAlternative[];
}

export interface PlanMoneyTotals {
  subtotal: number;
  a_cuenta: number;
  saldo: number;
}

function newItemId(): string {
  return `pi_${Math.random().toString(36).slice(2, 10)}`;
}

/** Map legacy plan estados onto the shared clinical vocabulary. */
export function normalizeEstado(raw: unknown): ClinicalEstado {
  const v = String(raw || "pendiente").toLowerCase();
  if (v === "en_curso" || v === "en_proceso" || v === "proceso") return "en_proceso";
  if (v === "finalizado" || v === "completado" || v === "completo") return "completado";
  return "pendiente";
}

export function itemSubtotal(it: PlanItem): number {
  return (Number(it.cantidad) || 0) * (Number(it.costo_unitario) || 0);
}

export function itemSaldo(it: PlanItem): number {
  return Math.max(0, itemSubtotal(it) - (Number(it.a_cuenta) || 0));
}

export function normalizePlanItem(raw: Partial<PlanItem> | Record<string, unknown>): PlanItem {
  const cantidad = Math.max(1, Number(raw.cantidad) || 1);
  const costo_unitario = Number(raw.costo_unitario) || 0;
  let a_cuenta = Number(raw.a_cuenta) || 0;
  const sub = cantidad * costo_unitario;
  if (a_cuenta > sub) a_cuenta = sub;
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : newItemId(),
    item: String(raw.item || ""),
    cantidad,
    costo_unitario,
    a_cuenta,
    estado: normalizeEstado(raw.estado),
    pieza_fdi: raw.pieza_fdi ? String(raw.pieza_fdi) : undefined,
    condicion_id: raw.condicion_id ? String(raw.condicion_id) : undefined,
    origen: raw.origen === "odontogram" ? "odontogram" : "manual",
    evolution_entry_id: raw.evolution_entry_id
      ? String(raw.evolution_entry_id)
      : undefined,
  };
}

export function normalizePlans(raw: unknown): TreatmentPlans {
  if (!raw) {
    return {
      active_id: "plan_a",
      alternatives: [{ id: "plan_a", nombre: "Plan A", items: [] }],
    };
  }
  if (Array.isArray(raw)) {
    return {
      active_id: "plan_a",
      alternatives: [
        {
          id: "plan_a",
          nombre: "Plan A",
          items: (raw as Partial<PlanItem>[]).map(normalizePlanItem),
        },
      ],
    };
  }
  const obj = raw as TreatmentPlans;
  if (obj.alternatives?.length) {
    return {
      active_id: obj.active_id || obj.alternatives[0].id,
      alternatives: obj.alternatives.map((a) => ({
        ...a,
        items: (a.items || []).map((it) => normalizePlanItem(it)),
      })),
    };
  }
  return {
    active_id: "plan_a",
    alternatives: [{ id: "plan_a", nombre: "Plan A", items: [] }],
  };
}

export function newPlanAlt(nombre: string, items: PlanItem[] = []): PlanAlternative {
  return {
    id: `plan_${Math.random().toString(36).slice(2, 10)}`,
    nombre,
    items: items.map((it) => normalizePlanItem(it)),
  };
}

export function activeItems(plans: TreatmentPlans): PlanItem[] {
  return (
    plans.alternatives.find((a) => a.id === plans.active_id)?.items ||
    plans.alternatives[0]?.items ||
    []
  );
}

export function setActiveItems(plans: TreatmentPlans, items: PlanItem[]): TreatmentPlans {
  return {
    ...plans,
    alternatives: plans.alternatives.map((a) =>
      a.id === plans.active_id ? { ...a, items } : a
    ),
  };
}

export function planEstimate(items: PlanItem[]): number {
  return items.reduce((s, it) => s + itemSubtotal(it), 0);
}

export function planMoneyTotals(items: PlanItem[]): PlanMoneyTotals {
  const subtotal = planEstimate(items);
  const a_cuenta = items.reduce((s, it) => s + (Number(it.a_cuenta) || 0), 0);
  return { subtotal, a_cuenta, saldo: Math.max(0, subtotal - a_cuenta) };
}

export function blankPlanItem(): PlanItem {
  return normalizePlanItem({
    item: "",
    cantidad: 1,
    costo_unitario: 0,
    a_cuenta: 0,
    estado: "pendiente",
    origen: "manual",
  });
}
