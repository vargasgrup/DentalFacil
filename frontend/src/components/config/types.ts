export interface User {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  activo: boolean;
  modulos_acceso?: string[];
  created_at: string;
}

export interface ClinicProfile {
  razon_social: string;
  nombre_comercial: string;
  ruc: string;
  direccion: string;
  distrito: string;
  provincia: string;
  departamento: string;
  telefono: string;
  email: string;
  ticket_serie: string;
  eslogan: string;
  director_nombre: string;
  cop_registro: string;
  logo_url: string | null;
  has_custom_logo: boolean;
  nombre_publico: string;
  direccion_completa: string;
}

export const emptyClinic: ClinicProfile = {
  razon_social: "",
  nombre_comercial: "",
  ruc: "",
  direccion: "",
  distrito: "",
  provincia: "",
  departamento: "",
  telefono: "",
  email: "",
  ticket_serie: "T001",
  eslogan: "",
  director_nombre: "",
  cop_registro: "",
  logo_url: null,
  has_custom_logo: false,
  nombre_publico: "",
  direccion_completa: "",
};

export const rolVariant: Record<string, "brand" | "info" | "neutral" | "warning"> = {
  ADMIN: "brand",
  DOCTOR: "info",
  ASISTENTE: "neutral",
  CAJERO: "warning",
};
