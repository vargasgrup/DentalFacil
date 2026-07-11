/** Planes de tratamiento con alternativas A/B/C */

export interface PlanItem {
  item: string;
  cantidad: number;
  costo_unitario?: number;
  estado?: string;
  pieza_fdi?: string;
  condicion_id?: string;
  origen?: "odontogram" | "manual";
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
      alternatives: [{ id: "plan_a", nombre: "Plan A", items: raw as PlanItem[] }],
    };
  }
  const obj = raw as TreatmentPlans;
  if (obj.alternatives?.length) {
    return {
      active_id: obj.active_id || obj.alternatives[0].id,
      alternatives: obj.alternatives,
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
    items,
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
  return items.reduce(
    (s, it) => s + (it.cantidad || 0) * (Number(it.costo_unitario) || 0),
    0
  );
}
