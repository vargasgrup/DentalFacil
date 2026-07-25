"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Trash2, Upload } from "lucide-react";
import { apiFetch, apiUpload, apiFetchBlob, ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { Button } from "@/components/ui/Button";
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
  description: string;
  subtypes: { id: string; label: string }[];
}[] = [
  {
    id: "radiografia",
    title: "Radiografías",
    description:
      "Ortopantomografía (panorámica), periapicales, oclusales, aleta de mordida o telerradiografía.",
    subtypes: [
      { id: "ortopantomografia", label: "Ortopantomografía (panorámica)" },
      { id: "periapical", label: "Periapical" },
      { id: "oclusal", label: "Oclusal" },
      { id: "aleta_mordida", label: "Aleta de mordida" },
      { id: "telerradiografia", label: "Telerradiografía" },
    ],
  },
  {
    id: "fotografia_clinica",
    title: "Fotografías clínicas",
    description: "Imágenes intraorales y extraorales para documentar la evolución.",
    subtypes: [
      { id: "intraoral", label: "Intraoral" },
      { id: "extraoral", label: "Extraoral" },
    ],
  },
  {
    id: "laboratorio",
    title: "Resultados de laboratorio",
    description: "Informes de laboratorio, análisis de biopsias y estudios relacionados.",
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
    <div className="space-y-5">
      <p className="text-help text-slate-500">
        Archivos digitales de pruebas realizadas (imágenes y PDF). Sin límite de
        tamaño por archivo en instalaciones locales de escritorio.
      </p>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700"
        >
          {error}
        </p>
      )}

      {loading && <p className="text-sm text-slate-400">Cargando archivos…</p>}

      {CATEGORIES.map((cat) => (
        <div
          key={cat.id}
          className="rounded-lg border border-slate-200 bg-surface-subtle p-4"
        >
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-slate-800">{cat.title}</h3>
            <p className="mt-0.5 text-help text-slate-500">{cat.description}</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="block min-w-[12rem] flex-1">
              <span className="mb-1 block text-label text-slate-700">Tipo</span>
              <select
                value={subtipos[cat.id]}
                onChange={(e) =>
                  setSubtipos((prev) => ({ ...prev, [cat.id]: e.target.value }))
                }
                disabled={readOnly}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 disabled:opacity-60"
              >
                {cat.subtypes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block min-w-[12rem] flex-[1.4]">
              <span className="mb-1 block text-label text-slate-700">
                Notas (opcional)
              </span>
              <input
                value={notas[cat.id]}
                onChange={(e) =>
                  setNotas((prev) => ({ ...prev, [cat.id]: e.target.value }))
                }
                placeholder="Referencia clínica breve"
                disabled={readOnly}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 disabled:opacity-60"
              />
            </label>
            {!readOnly && (
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
              <Upload className="h-4 w-4" aria-hidden />
              {uploadingCat === cat.id ? "Subiendo…" : "Cargar archivo"}
              <input
                type="file"
                accept={ACCEPT}
                className="sr-only"
                disabled={uploadingCat === cat.id}
                onChange={(e) => {
                  void onUpload(cat.id, e.target.files?.[0] || null);
                  e.target.value = "";
                }}
              />
            </label>
            )}
          </div>

          {byCategory[cat.id].length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">Sin archivos en esta categoría.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
              {byCategory[cat.id].map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800" title={item.filename}>
                      {item.filename}
                    </p>
                    <p className="text-help text-slate-500">
                      {subtypeLabel(item.categoria, item.subtipo)}
                      {" · "}
                      {isPdf(item) ? "PDF" : "Imagen"}
                      {" · "}
                      {formatBytes(item.size_bytes)}
                      {" · "}
                      {formatDateTime(item.created_at)}
                      {item.notas ? ` · ${item.notas}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={loadingId === item.id}
                      icon={<Eye className="h-3.5 w-3.5" />}
                      onClick={() => void openViewer(item)}
                    >
                      {loadingId === item.id ? "Cargando…" : "Visualizar"}
                    </Button>
                    {!readOnly && (
                    <button
                      type="button"
                      onClick={() => void onDelete(item)}
                      className="rounded p-2 text-slate-400 hover:bg-danger-50 hover:text-danger-600"
                      aria-label={`Eliminar ${item.filename}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      {viewer && (
        <DigitizedDocumentViewer
          title={subtypeLabel(viewer.item.categoria, viewer.item.subtipo)}
          subtitle={viewer.item.filename}
          src={viewer.src}
          kind={isPdf(viewer.item) ? "pdf" : "image"}
          onClose={closeViewer}
        />
      )}
    </div>
  );
}
