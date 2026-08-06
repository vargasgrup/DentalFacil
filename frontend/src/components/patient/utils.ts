import { calcAgeYears } from "@/lib/patientAge";

export function calcEdad(fecha?: string | null): number | null {
  return calcAgeYears(fecha);
}

export function parseHabitos(text: string): { selected: string[]; notes: string } {
  const match = text.match(/^\[Hábitos:\s*([^\]]*)\]\s*\n?/i);
  if (!match) return { selected: [], notes: text };
  const selected = match[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const notes = text.slice(match[0].length);
  return { selected, notes };
}

export function buildOdontoText(selected: string[], notes: string): string {
  if (selected.length === 0) return notes;
  return `[Hábitos: ${selected.join(", ")}]\n${notes}`.trim();
}
