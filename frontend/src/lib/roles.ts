/**
 * Roles del centro odontológico y acceso a módulos (navegación).
 * Los valores deben coincidir con backend/app/core/roles.py y modules.py
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

export const APP_MODULES: AppModule[] = [
  "dashboard",
  "pacientes",
  "agenda",
  "caja",
  "reportes",
  "configuracion",
];

export const MODULE_LABELS: Record<AppModule, string> = {
  dashboard: "Inicio",
  pacientes: "Pacientes",
  agenda: "Agenda",
  caja: "Caja",
  reportes: "Reportes",
  configuracion: "Configuración",
};

/** Módulos que el admin puede marcar/desmarcar (Inicio siempre activo) */
export const SELECTABLE_MODULES: AppModule[] = [
  "pacientes",
  "agenda",
  "caja",
  "reportes",
  "configuracion",
];

/** Defaults al crear usuario (coinciden con backend) */
export const DEFAULT_MODULES_BY_ROLE: Record<AppRole, AppModule[]> = {
  ADMIN: [...APP_MODULES],
  DOCTOR: ["dashboard", "pacientes", "agenda", "caja", "reportes", "configuracion"],
  ASISTENTE: ["dashboard", "pacientes", "agenda", "configuracion"],
  CAJERO: ["dashboard", "pacientes", "caja"],
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

export function isAppModule(value: string | null | undefined): value is AppModule {
  return !!value && (APP_MODULES as readonly string[]).includes(value);
}

export function defaultModulesForRole(rol: string | null | undefined): AppModule[] {
  if (isAppRole(rol)) return [...DEFAULT_MODULES_BY_ROLE[rol]];
  return ["dashboard"];
}

export function resolveUserModules(
  rol: string | null | undefined,
  modulos?: string[] | null
): AppModule[] {
  if (isAppRole(rol) && rol === "ADMIN") return [...APP_MODULES];
  if (Array.isArray(modulos) && modulos.length > 0) {
    const set = new Set<AppModule>(["dashboard"]);
    for (const m of modulos) {
      if (isAppModule(m)) set.add(m);
    }
    return APP_MODULES.filter((m) => set.has(m));
  }
  return defaultModulesForRole(rol);
}

export type AccessUser = {
  rol?: string | null;
  modulos_acceso?: string[] | null;
} | null;

export function canAccessModule(
  userOrRol: AccessUser | string | null | undefined,
  mod: AppModule
): boolean {
  if (typeof userOrRol === "string" || userOrRol == null) {
    return resolveUserModules(userOrRol as string | null).includes(mod);
  }
  return resolveUserModules(userOrRol.rol, userOrRol.modulos_acceso).includes(mod);
}

export function canAccessHref(
  userOrRol: AccessUser | string | null | undefined,
  href: string
): boolean {
  const mod = HREF_TO_MODULE[href];
  if (!mod) return true;
  return canAccessModule(userOrRol, mod);
}

export function rolesForModule(mod: AppModule): AppRole[] {
  return ROLES.filter((r) => DEFAULT_MODULES_BY_ROLE[r].includes(mod));
}

export function roleLabel(rol: string): string {
  if (isAppRole(rol)) return ROLE_LABELS[rol];
  return rol;
}
