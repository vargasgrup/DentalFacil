/**
 * Validation helpers for Peruvian documents & phones.
 * DNI: exactly 8 digits
 * Celular PE: exactly 9 digits starting with 9
 * RUC: 11 digits (starts with 10, 15, 20, or 17)
 * Format-only — no RENIEC/SUNAT integration.
 */

export const DNI_LENGTH = 8;
export const PHONE_LENGTH = 9;

export function digitsOnly(value: string, maxLen: number): string {
  return value.replace(/\D/g, "").slice(0, maxLen);
}

export function validateDNI(dni: string): boolean {
  return new RegExp(`^\\d{${DNI_LENGTH}}$`).test(dni.trim());
}

export function validateRUC(ruc: string): boolean {
  if (!/^\d{11}$/.test(ruc)) return false;
  return /^(10|15|20|17)/.test(ruc);
}

/** Celular Perú: 9 dígitos, empieza en 9. */
export function validatePeruvianMobile(phone: string | undefined | null): boolean {
  if (!phone) return false;
  return /^9\d{8}$/.test(phone.replace(/\D/g, ""));
}

export function formatPhone(phone: string): string {
  const num = digitsOnly(phone, PHONE_LENGTH);
  return validatePeruvianMobile(num) ? num : num;
}

export function isValidPeruvianPhone(phone: string | undefined | null): boolean {
  return validatePeruvianMobile(phone);
}

/** Title-case for names (preserves multi-word / particles lightly). */
export function titleCaseName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\S+/g, (w) => {
      const lower = w.toLowerCase();
      if (["de", "del", "la", "las", "los", "y", "e"].includes(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    });
}
