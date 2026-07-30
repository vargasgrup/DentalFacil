"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Camera,
  Eye,
  FileText,
  FlaskConical,
  Scan,
  Trash2,
  Upload,
} from "lucide-react";
import { apiFetch, apiUpload, apiFetchBlob, ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { DigitizedDocumentViewer } from "@/components/DigitizedDocumentViewer";

type Categoria = "radiografia" | "fotografia_clinica" | "laboratorio";

interface ComplementaryItem {
  id: string;
  patient_id: string;
  categoria: Categoria | string;
  subtipo: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  notas: string | null;
  created_at: string;
  url: string;
}

const CATEGORIES: {
  id: Categoria;
  title: string;
  short: string;
  icon: typeof Scan;
  accent: string;
  iconBg: string;
  subtypes: { id: string; label: string }[];
}[] = [
  {
    id: "radiografia",
    title: "Radiografías",
    short: "Panorámica, periapical, oclusal…",
    icon: Scan,
    accent: "text-brand-700",
    iconBg: "bg-brand-50 text-brand-600 ring-brand-100",
    subtypes: [
      { id: "ortopantomografia", label: "Ortopantomografía" },
      { id: "periapical", label: "Periapical" },
      { id: "oclusal", label: "Oclusal" },
      { id: "aleta_mordida", label: "Aleta de mordida" },
      { id: "telerradiografia", label: "Telerradiografía" },
    ],
  },
  {
    id: "fotografia_clinica",
    title: "Fotografías",
    short: "Intraoral y extraoral",
    icon: Camera,
    accent: "text-sky-800",
    iconBg: "bg-sky-50 text-sky-600 ring-sky-100",
    subtypes: [
      { id: "intraoral", label: "Intraoral" },
      { id: "extraoral", label: "Extraoral" },
    ],
  },
  {
    id: "laboratorio",
    title: "Laboratorio",
    short: "Informes y biopsias",
    icon: FlaskConical,
    accent: "text-teal-800",
    iconBg: "bg-teal-50 text-teal-600 ring-teal-100",
    subtypes: [
      { id: "laboratorio", label: "Estudio de laboratorio" },
      { id: "biopsia", label: "Análisis de biopsia" },
      { id: "otro", label: "Otro informe" },
    ],
  },
];

const ACCEPT =
  "image/*,.pdf,application/pdf,.jpg,.jpeg,.png,.gif,.webp,.bmp,.tif,.tiff,.heic,.heif,.svg";

function subtypeLabel(categoria: string, subtipo: string): string {
  const cat = CATEGORIES.find((c) => c.id === categoria);
  return cat?.subtypes.find((s) => s.id === subtipo)?.label || subtipo;
}

function formatBytes(n: number): string {
  if (!n || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function isPdf(item: ComplementaryItem): boolean {
  return (
    item.content_type === "application/pdf" ||
    item.filename.toLowerCase().endsWith(".pdf")
  );
}

async function fetchBlobUrl(url: string, contentType?: string): Promise<string> {
  const blob = await apiFetchBlob(url);
  const typed =
    contentType && (!blob.type || blob.type === "application/octet-stream")
      ? new Blob([blob], { type: contentType })
      : blob;
  return URL.createObjectURL(typed);
}

export function PruebasComplementarias({
  patientId,
  readOnly = false,
}: {
  patientId: string;
  readOnly?: boolean;
}) {
  const [items, setItems] = useState<ComplementaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploadingCat, setUploadingCat] = useState<Categoria | null>(null);
  const [subtipos, setSubtipos] = useState<Record<Categoria, string>>({
    radiografia: "ortopantomografia",
    fotografia_clinica: "intraoral",
    laboratorio: "laboratorio",
  });
  const [notas, setNotas] = useState<Record<Categoria, string>>({
    radiografia: "",
    fotografia_clinica: "",
    laboratorio: "",
  });
  const [viewer, setViewer] = useState<{
    item: ComplementaryItem;
    src: string;
  } | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<ComplementaryItem[]>(
        `/api/complementary-tests/${patientId}`
      );
      setItems(data);
    } catch {
      setItems([]);
      setError("No se pudieron cargar las pruebas complementarias.");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (viewer?.src) URL.revokeObjectURL(viewer.src);
    };
  }, [viewer]);

  const byCategory = useMemo(() => {
    const map: Record<Categoria, ComplementaryItem[]> = {
      radiografia: [],
      fotografia_clinica: [],
      laboratorio: [],
    };
    for (const item of items) {
      if (item.categoria in map) {
        map[item.categoria as Categoria].push(item);
      }
    }
    return map;
  }, [items]);

  const closeViewer = () => {
    setViewer((prev) => {
      if (prev?.src) URL.revokeObjectURL(prev.src);
      return null;
    });
  };

  const openViewer = async (item: ComplementaryItem) => {
    setError("");
    setLoadingId(item.id);
    try {
      const src = await fetchBlobUrl(item.url, item.content_type);
      setViewer((prev) => {
        if (prev?.src) URL.revokeObjectURL(prev.src);
        return { item, src };
      });
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "No se pudo visualizar el archivo. Intenta de nuevo.";
      setError(msg);
    } finally {
      setLoadingId(null);
    }
  };

  const onUpload = async (categoria: Categoria, file: File | null) => {
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    const isPdfFile =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isImage && !isPdfFile) {
      setError("Solo se permiten imágenes o archivos PDF.");
      return;
    }

    setUploadingCat(categoria);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("categoria", categoria);
      fd.append("subtipo", subtipos[categoria]);
      const note = notas[categoria].trim();
      if (note) fd.append("notas", note);
      await apiUpload(`/api/complementary-tests/${patientId}`, fd);
      setNotas((prev) => ({ ...prev, [categoria]: "" }));
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo subir el archivo."
      );
    } finally {
      setUploadingCat(null);
    }
  };

  const onDelete = async (item: ComplementaryItem) => {
    if (!window.confirm(`¿Eliminar «${item.filename}»?`)) return;
    setError("");
    try {
      await apiFetch(`/api/complementary-tests/${item.id}`, { method: "DELETE" });
      if (viewer?.item.id === item.id) closeViewer();
      await load();
    } catch {
      setError("No se pudo eliminar el archivo.");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Imágenes o PDF · máx. práctico 10&nbsp;MB en escritorio
        </p>
        {loading && (
          <span className="text-xs font-medium text-slate-400">Cargando…</span>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700"
        >
          {error}
        </p>
      )}

      {/* Una fila · 3 columnas en desktop; apilado en móvil */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-3 lg:gap-4">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const list = byCategory[cat.id];
          const busy = uploadingCat === cat.id;
          const count = list.length;

          return (
            <article
              key={cat.id}
              className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-shadow hover:shadow-[0_4px_14px_-6px_rgba(15,23,42,0.12)]"
            >
              {/* Cabecera compacta */}
              <header className="flex items-start gap-3 border-b border-slate-100 px-3.5 py-3">
                <span
                  className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${cat.iconBg}`}
                  aria-hidden
                >
                  <Icon className="h-[1.125rem] w-[1.125rem]" strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className={`truncate text-sm font-semibold tracking-tight ${cat.accent}`}>
                      {cat.title}
                    </h3>
                    <span
                      className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums ${
                        count > 0
                          ? "bg-brand-600 text-white"
                          : "bg-slate-100 text-slate-500"
                      }`}
                      title={`${count} archivo${count === 1 ? "" : "s"}`}
                    >
                      {count}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] leading-snug text-slate-500">
                    {cat.short}
                  </p>
                </div>
              </header>

              {/* Controles de carga */}
              <div className="flex flex-1 flex-col gap-2.5 px-3.5 py-3">
                <label className="block">
                  <span className="sr-only">Tipo — {cat.title}</span>
                  <select
                    value={subtipos[cat.id]}
                    onChange={(e) =>
                      setSubtipos((prev) => ({ ...prev, [cat.id]: e.target.value }))
                    }
                    disabled={readOnly || busy}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-2 text-xs font-medium text-slate-700 transition-colors focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-60"
                  >
                    {cat.subtypes.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="sr-only">Notas — {cat.title}</span>
                  <input
                    value={notas[cat.id]}
                    onChange={(e) =>
                      setNotas((prev) => ({ ...prev, [cat.id]: e.target.value }))
                    }
                    placeholder="Nota breve (opcional)"
                    disabled={readOnly || busy}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-60"
                  />
                </label>

                {!readOnly && (
                  <label
                    className={`group inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold transition-colors ${
                      busy
                        ? "cursor-wait bg-brand-100 text-brand-700"
                        : "bg-brand-600 text-white shadow-sm shadow-brand-600/20 hover:bg-brand-700"
                    }`}
                  >
                    <Upload className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                    {busy ? "Subiendo…" : "Cargar archivo"}
                    <input
                      type="file"
                      accept={ACCEPT}
                      className="sr-only"
                      disabled={busy}
                      onChange={(e) => {
                        void onUpload(cat.id, e.target.files?.[0] || null);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}

                {/* Lista compacta de archivos */}
                <div className="mt-auto min-h-[4.5rem] rounded-lg border border-dashed border-slate-200 bg-slate-50/60">
                  {count === 0 ? (
                    <div className="flex h-full min-h-[4.5rem] flex-col items-center justify-center gap-1 px-2 py-3 text-center">
                      <FileText className="h-4 w-4 text-slate-300" aria-hidden />
                      <p className="text-[11px] text-slate-400">Sin archivos</p>
                    </div>
                  ) : (
                    <ul className="max-h-36 divide-y divide-slate-100 overflow-y-auto">
                      {list.map((item) => (
                        <li
                          key={item.id}
                          className="flex items-center gap-1.5 px-2 py-1.5"
                        >
                          <div className="min-w-0 flex-1">
                            <p
                              className="truncate text-[11px] font-medium text-slate-800"
                              title={item.filename}
                            >
                              {item.filename}
                            </p>
                            <p className="truncate text-[10px] text-slate-500">
                              {subtypeLabel(item.categoria, item.subtipo)}
                              {" · "}
                              {isPdf(item) ? "PDF" : "Img"}
                              {" · "}
                              {formatBytes(item.size_bytes)}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={loadingId === item.id}
                            onClick={() => void openViewer(item)}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-white hover:text-brand-700 disabled:opacity-50"
                            title="Visualizar"
                            aria-label={`Visualizar ${item.filename}`}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          {!readOnly && (
                            <button
                              type="button"
                              onClick={() => void onDelete(item)}
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-danger-50 hover:text-danger-600"
                              aria-label={`Eliminar ${item.filename}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Fecha oculta en filas compactas: tooltip vía title en filename; detalle en visor */}
      <p className="sr-only">
        {items.map((i) => `${i.filename} ${formatDateTime(i.created_at)}`).join(", ")}
      </p>

      {viewer && (
        <DigitizedDocumentViewer
          title={subtypeLabel(viewer.item.categoria, viewer.item.subtipo)}
          subtitle={`${viewer.item.filename} · ${formatDateTime(viewer.item.created_at)}`}
          src={viewer.src}
          kind={isPdf(viewer.item) ? "pdf" : "image"}
          onClose={closeViewer}
        />
      )}
    </div>
  );
}
