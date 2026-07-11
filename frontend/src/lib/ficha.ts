/**
 * Clinical file (ficha) numbering — display layer only.
 * Storage remains sequential integers (numero_ficha).
 *
 * Format: FC-00005  (Ficha Clínica + zero-padded code)
 */

const FICHA_PREFIX = "FC";
const FICHA_PAD = 5;

export function formatFichaCode(
  numero: number | string | null | undefined,
  pad: number = FICHA_PAD
): string {
  if (numero === null || numero === undefined || numero === "") {
    return `${FICHA_PREFIX}-${"-".repeat(pad)}`;
  }
  const n = typeof numero === "number" ? numero : Number(String(numero).replace(/\D/g, ""));
  if (!Number.isFinite(n) || n < 0) {
    return `${FICHA_PREFIX}-${"-".repeat(pad)}`;
  }
  return `${FICHA_PREFIX}-${String(Math.trunc(n)).padStart(pad, "0")}`;
}

/** Human label for messages / search results: "Ficha FC-00005" */
export function formatFichaLabel(numero: number | string | null | undefined): string {
  return `Ficha ${formatFichaCode(numero)}`;
}
