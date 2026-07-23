/**
 * Roles del centro odontológico y acceso a módulos (navegación).
 * Los valores deben coincidir con backend/app/core/roles.py
 */

export const ROLES = ["ADMIN", "DOCTOR", "ASISTENTE", "CAJERO"] as const;
export type AppRole = (typeof ROLES)[number];

export const ROLE_LABELS: Record<AppRole, string> = {
  ADMIN: "Administrador",
  DOCTOR: "Doctor",
  ASISTENTE: "Asistente",
  CAJERO: "Cajero",
};

/** Máximo de administradores activos/configurados en el centro */
export const MAX_ADMINS = 2;

export type AppModule =
  | "dashboard"
  | "pacientes"
  | "agenda"
  | "caja"
  | "reportes"
  | "configuracion";

/** Qué módulos ve cada rol en el menú lateral */
const MODULE_ACCESS: Record<AppRole, readonly AppModule[]> = {
  ADMIN: ["dashboard", "pacientes", "agenda", "caja", "reportes", "configuracion"],
  DOCTOR: ["dashboard", "pacientes", "agenda", "caja", "reportes", "configuracion"],
  ASISTENTE: ["dashboard", "pacientes", "agenda", "configuracion"],
  CAJERO: ["dashboard", "pacientes", "caja", "reportes", "configuracion"],
};

const HREF_TO_MODULE: Record<string, AppModule> = {
  "/dashboard": "dashboard",
  "/pacientes": "pacientes",
  "/agenda": "agenda",
  "/caja": "caja",
  "/reportes": "reportes",
  "/configuracion": "configuracion",
};

export function isAppRole(value: string | null | undefined): value is AppRole {
  return !!value && (ROLES as readonly string[]).includes(value);
}

export function canAccessModule(rol: string | null | undefined, mod: AppModule): boolean {
  if (!isAppRole(rol)) return false;
  return MODULE_ACCESS[rol].includes(mod);
}

export function canAccessHref(rol: string | null | undefined, href: string): boolean {
  const mod = HREF_TO_MODULE[href];
  if (!mod) return true;
  return canAccessModule(rol, mod);
}

export function rolesForModule(mod: AppModule): AppRole[] {
  return ROLES.filter((r) => MODULE_ACCESS[r].includes(mod));
}

export function roleLabel(rol: string): string {
  if (isAppRole(rol)) return ROLE_LABELS[rol];
  return rol;
}
