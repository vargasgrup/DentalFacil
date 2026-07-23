/**
 * Carga de imágenes dentales realistas (PNG en /public/dientes).
 * Si no hay archivo, genera un SVG anatómico procedural con raíces.
 */

import { toothKind, type ToothKind } from "@/lib/odontogramConditions";

export type VistaDiente = "vestibular" | "lingual" | "oclusal";

const cache = new Map<string, string>();

function archOf(pieza: string): "upper" | "lower" {
  const q = Number(pieza[0]);
  return q === 1 || q === 2 || q === 5 || q === 6 ? "upper" : "lower";
}

function rootsFor(kind: ToothKind, pieza: string): number {
  if (kind === "incisor" || kind === "canine") return 1;
  if (kind === "premolar") {
    // Premolares superiores suelen ser birradiculares
    return archOf(pieza) === "upper" ? 2 : 1;
  }
  // Molares: 3 superior / 2 inferior
  return archOf(pieza) === "upper" ? 3 : 2;
}

/** SVG procedural fotorrealista (gradientes) — fallback sin PNG Servier. */
export function svgProceduralDiente(pieza: string, vista: VistaDiente = "vestibular"): string {
  const kind = toothKind(pieza);
  const arch = archOf(pieza);
  const roots = rootsFor(kind, pieza);
  const flip = arch === "lower";

  // Vista oclusal: solo corona vista desde arriba
  if (vista === "oclusal" && (kind === "molar" || kind === "premolar")) {
    const crown =
      kind === "molar"
        ? `<ellipse cx="128" cy="128" rx="78" ry="70" fill="url(#enamel)" stroke="#b8a48a" stroke-width="3"/>
           <ellipse cx="100" cy="110" rx="18" ry="14" fill="#d4c4a8" opacity=".55"/>
           <ellipse cx="156" cy="110" rx="18" ry="14" fill="#d4c4a8" opacity=".55"/>
           <ellipse cx="100" cy="150" rx="16" ry="12" fill="#d4c4a8" opacity=".45"/>
           <ellipse cx="156" cy="150" rx="16" ry="12" fill="#d4c4a8" opacity=".45"/>
           <path d="M80 128 Q128 118 176 128" stroke="#c4b49a" fill="none" stroke-width="2"/>`
        : `<ellipse cx="128" cy="128" rx="58" ry="70" fill="url(#enamel)" stroke="#b8a48a" stroke-width="3"/>
           <ellipse cx="128" cy="118" rx="22" ry="28" fill="#d4c4a8" opacity=".5"/>
           <path d="M90 128 Q128 108 166 128" stroke="#c4b49a" fill="none" stroke-width="2"/>`;
    return dataSvg(`
      <defs>
        <linearGradient id="enamel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#fffef8"/>
          <stop offset="45%" stop-color="#f3e8d4"/>
          <stop offset="100%" stop-color="#e0d0b8"/>
        </linearGradient>
      </defs>
      <rect width="256" height="256" fill="transparent"/>
      ${crown}
    `);
  }

  const crownPath =
    kind === "incisor"
      ? "M88 28 C96 18 160 18 168 28 L174 78 C176 98 168 112 128 116 C88 112 80 98 82 78 Z"
      : kind === "canine"
        ? "M98 18 C110 8 146 8 158 18 L172 70 C176 92 164 112 128 118 C92 112 80 92 84 70 Z"
        : kind === "premolar"
          ? "M78 32 C90 16 166 16 178 32 L186 78 C188 100 176 114 128 118 C80 114 68 100 70 78 Z"
          : "M62 36 C78 14 178 14 194 36 L204 82 C208 104 190 118 128 122 C66 118 48 104 52 82 Z";

  let rootsPath = "";
  if (roots === 1) {
    rootsPath =
      "M110 114 C112 150 118 190 128 220 C138 190 144 150 146 114 C136 118 120 118 110 114 Z";
  } else if (roots === 2) {
    rootsPath = `
      <path d="M86 116 C78 150 72 188 78 222 C92 200 100 160 108 118 Z" fill="url(#dentin)"/>
      <path d="M148 118 C156 160 164 200 178 222 C184 188 178 150 170 116 Z" fill="url(#dentin)"/>
      <ellipse cx="128" cy="120" rx="22" ry="10" fill="#e8dcc8"/>`;
  } else {
    rootsPath = `
      <path d="M78 118 C70 155 64 195 70 228 C86 205 96 165 104 120 Z" fill="url(#dentin)"/>
      <path d="M114 120 C112 160 116 200 128 232 C140 200 144 160 142 120 Z" fill="url(#dentin)"/>
      <path d="M152 120 C160 165 170 205 186 228 C192 195 186 155 178 118 Z" fill="url(#dentin)"/>
      <ellipse cx="128" cy="122" rx="28" ry="10" fill="#e8dcc8"/>`;
  }

  const body = `
    <defs>
      <linearGradient id="enamel" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="35%" stop-color="#f7f0e4"/>
        <stop offset="100%" stop-color="#e5d5bc"/>
      </linearGradient>
      <linearGradient id="dentin" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#efe2cc"/>
        <stop offset="100%" stop-color="#c9b089"/>
      </linearGradient>
      <filter id="soft"><feGaussianBlur stdDeviation="0.6"/></filter>
    </defs>
    <g transform="${flip ? "translate(0,256) scale(1,-1)" : ""}">
      ${roots === 1 ? `<path d="${rootsPath}" fill="url(#dentin)" stroke="#b89a72" stroke-width="1.5"/>` : rootsPath}
      <path d="${crownPath}" fill="url(#enamel)" stroke="#c4b49a" stroke-width="2"/>
      <path d="${crownPath}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="4" filter="url(#soft)"/>
      ${vista === "lingual" ? `<ellipse cx="128" cy="70" rx="28" ry="36" fill="#f0e6d6" opacity=".35"/>` : ""}
    </g>
    <text x="128" y="248" text-anchor="middle" font-size="14" fill="#64748b" font-family="system-ui">${pieza}</text>
  `;
  return dataSvg(body);
}

function dataSvg(inner: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">${inner}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function urlImagenDiente(pieza: string, vista: VistaDiente = "vestibular"): string {
  return `/dientes/${pieza}_${vista}.png`;
}

/**
 * Resuelve URL usable: intenta PNG público; si falla en runtime, usa SVG procedural.
 * En Konva usamos probe async.
 */
export async function cargarImagenDiente(
  pieza: string,
  vista: VistaDiente = "vestibular"
): Promise<string> {
  const key = `${pieza}_${vista}`;
  if (cache.has(key)) return cache.get(key)!;

  const candidates = [
    urlImagenDiente(pieza, vista),
    vista !== "vestibular" ? urlImagenDiente(pieza, "vestibular") : null,
    `/dientes/default.png`,
  ].filter(Boolean) as string[];

  for (const url of candidates) {
    const ok = await probeImage(url);
    if (ok) {
      cache.set(key, url);
      return url;
    }
  }

  const procedural = svgProceduralDiente(pieza, vista);
  cache.set(key, procedural);
  return procedural;
}

function probeImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(false);
      return;
    }
    const img = new window.Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

export function clearImageCache() {
  cache.clear();
}
