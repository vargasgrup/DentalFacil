import {
  Home,
  Users,
  Calendar,
  Wallet,
  BarChart3,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  shortLabel?: string;
  icon: LucideIcon;
};

export const NAV_PRINCIPAL: NavItem[] = [
  { href: "/dashboard", label: "Inicio", shortLabel: "Inicio", icon: Home },
  { href: "/pacientes", label: "Pacientes", shortLabel: "Pacientes", icon: Users },
  { href: "/agenda", label: "Agenda", shortLabel: "Agenda", icon: Calendar },
  { href: "/caja", label: "Caja", shortLabel: "Caja", icon: Wallet },
  { href: "/reportes", label: "Reportes", shortLabel: "Reportes", icon: BarChart3 },
];

export const NAV_SISTEMA: NavItem[] = [
  { href: "/configuracion", label: "Configuración", shortLabel: "Ajustes", icon: Settings },
];

export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}
