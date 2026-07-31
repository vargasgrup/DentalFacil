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
    short: "Varias por tipo (p. ej. varias panorámicas)",
    icon: Scan,
    accent: "text-brand-700",
    iconBg: "bg-brand-50 text-brand-600 ring-brand-100",
    subtypes: [
      { id: "ortopantomografia", label: "Ortopantomografía (panorámica)" },
      { id: "periapical", label: "Periapical" },
      { id: "oclusal", label: "Oclusal" },
      { id: "aleta_mordida", label: "Aleta de mordida" },
      { id: "telerradiografia", label: "Telerradiografía" },
      { id: "otro", label: "Otros" },
    ],
  },
  {
    id: "fotografia_clinica",
    title: "Fotografías",
    short: "Series intraorales y extraorales",
    icon: Camera,
    accent: "text-sky-800",
    iconBg: "bg-sky-50 text-sky-600 ring-sky-100",
    subtypes: [
      { id: "intraoral", label: "Intraoral" },
      { id: "extraoral", label: "Extraoral" },
      { id: "otro", label: "Otros" },
    ],
  },
  {
    id: "laboratorio",
    title: "Laboratorio",
    short: "Informes, biopsias y estudios",
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

function errMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message || fallback;
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

async function fetchBlobUrl(url: string, contentType?: string): Promise<string> {
  const blob = await apiFetchBlob(url);
  const typed =
    contentType && (!blob.type || blob.type === "application/octet-stream")
      ? new Blob([blob], { type: contentType })
      : blob;
  return URL.createObjectURL(typed);
}

/** Group files by subtype (preserves newest-first order within each group). */
function groupBySubtype(
  items: ComplementaryItem[],
  subtypeOrder: { id: string; label: string }[]
): { id: string; label: string; files: ComplementaryItem[] }[] {
  const map = new Map<string, ComplementaryItem[]>();
  for (const item of items) {
    const key = item.subtipo || "otro";
    const list = map.get(key) || [];
    list.push(item);
    map.set(key, list);
  }
  const ordered: { id: string; label: string; files: ComplementaryItem[] }[] = [];
  for (const s of subtypeOrder) {
    const files = map.get(s.id);
    if (files?.length) {
      ordered.push({ id: s.id, label: s.label, files });
      map.delete(s.id);
    }
  }
  for (const [id, files] of map) {
    if (files.length) {
      ordered.push({ id, label: id, files });
    }
  }
  return ordered;
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
  const [uploadProgress, setUploadProgress] = useState("");
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
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      setItems([]);
      setError(
        errMessage(
          err,
          "No se pudieron cargar las pruebas complementarias."
        )
      );
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
      setError(errMessage(err, "No se pudo visualizar el archivo. Intenta de nuevo."));
    } finally {
      setLoadingId(null);
    }
  };

  const onUploadMany = async (categoria: Categoria, fileList: FileList | null) => {
    if (!fileList?.length) return;
    const files = Array.from(fileList);
    const invalid = files.filter((file) => {
      const isImage = file.type.startsWith("image/");
      const isPdfFile =
        file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      return !isImage && !isPdfFile;
    });
    if (invalid.length) {
      setError("Solo se permiten imágenes o archivos PDF.");
      return;
    }

    setUploadingCat(categoria);
    setError("");
    const note = notas[categoria].trim();
    const subtipo = subtipos[categoria];
    let ok = 0;
    const failures: string[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress(`Subiendo ${i + 1} de ${files.length}…`);
        try {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("categoria", categoria);
          fd.append("subtipo", subtipo);
          if (note) fd.append("notas", note);
          await apiUpload(`/api/complementary-tests/${patientId}`, fd);
          ok += 1;
        } catch (err) {
          failures.push(`${file.name}: ${errMessage(err, "error")}`);
        }
      }
      if (ok > 0) {
        setNotas((prev) => ({ ...prev, [categoria]: "" }));
        await load();
      }
      if (failures.length) {
        setError(
          ok > 0
            ? `Se guardaron ${ok} archivo(s). Fallaron: ${failures.join("; ")}`
            : failures.join("; ")
        );
      }
    } finally {
      setUploadingCat(null);
      setUploadProgress("");
    }
  };

  const onDelete = async (item: ComplementaryItem) => {
    if (!window.confirm(`¿Eliminar «${item.filename}»?`)) return;
    setError("");
    try {
      await apiFetch(`/api/complementary-tests/${item.id}`, { method: "DELETE" });
      if (viewer?.item.id === item.id) closeViewer();
      await load();
    } catch (err) {
      setError(errMessage(err, "No se pudo eliminar el archivo."));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Imágenes o PDF · varios archivos del mismo tipo se agrupan · sin límite práctico
          de cantidad en escritorio
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

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-3 lg:gap-4">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const list = byCategory[cat.id];
          const busy = uploadingCat === cat.id;
          const count = list.length;
          const groups = groupBySubtype(list, cat.subtypes);
          const selectedSub = cat.subtypes.find((s) => s.id === subtipos[cat.id]);
          const countSelected = list.filter(
            (i) => i.subtipo === subtipos[cat.id]
          ).length;

          return (
            <article
              key={cat.id}
              className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-shadow hover:shadow-[0_4px_14px_-6px_rgba(15,23,42,0.12)]"
            >
              <header className="flex items-start gap-3 border-b border-slate-100 px-3.5 py-3">
                <span
                  className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${cat.iconBg}`}
                  aria-hidden
                >
                  <Icon className="h-[1.125rem] w-[1.125rem]" strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3
                      className={`truncate text-sm font-semibold tracking-tight ${cat.accent}`}
                    >
                      {cat.title}
                    </h3>
                    <span
                      className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums ${
                        count > 0
                          ? "bg-brand-600 text-white"
                          : "bg-slate-100 text-slate-500"
                      }`}
                      title={`${count} archivo${count === 1 ? "" : "s"} en total`}
                    >
                      {count}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] leading-snug text-slate-500">
                    {cat.short}
                  </p>
                </div>
              </header>

              <div className="flex flex-1 flex-col gap-2.5 px-3.5 py-3">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Tipo a cargar
                  </span>
                  <select
                    value={subtipos[cat.id]}
                    onChange={(e) =>
                      setSubtipos((prev) => ({ ...prev, [cat.id]: e.target.value }))
                    }
                    disabled={readOnly || busy}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-2 text-xs font-medium text-slate-700 transition-colors focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-60"
                  >
                    {cat.subtypes.map((s) => {
                      const n = list.filter((i) => i.subtipo === s.id).length;
                      return (
                        <option key={s.id} value={s.id}>
                          {s.label}
                          {n > 0 ? ` (${n})` : ""}
                        </option>
                      );
                    })}
                  </select>
                </label>

                {countSelected > 0 && selectedSub && (
                  <p className="text-[11px] text-slate-500">
                    Ya hay{" "}
                    <span className="font-semibold text-slate-700">
                      {countSelected}
                    </span>{" "}
                    {selectedSub.label.toLowerCase()}
                    {countSelected === 1 ? "" : "s"} — puede agregar más.
                  </p>
                )}

                <label className="block">
                  <span className="sr-only">Notas — {cat.title}</span>
                  <input
                    value={notas[cat.id]}
                    onChange={(e) =>
                      setNotas((prev) => ({ ...prev, [cat.id]: e.target.value }))
                    }
                    placeholder="Nota breve (opcional, aplica a esta carga)"
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
                    {busy
                      ? uploadProgress || "Subiendo…"
                      : "Cargar archivo(s)"}
                    <input
                      type="file"
                      accept={ACCEPT}
                      multiple
                      className="sr-only"
                      disabled={busy}
                      onChange={(e) => {
                        void onUploadMany(cat.id, e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}

                <div className="mt-auto min-h-[5.5rem] rounded-lg border border-dashed border-slate-200 bg-slate-50/60">
                  {count === 0 ? (
                    <div className="flex h-full min-h-[5.5rem] flex-col items-center justify-center gap-1 px-2 py-3 text-center">
                      <FileText className="h-4 w-4 text-slate-300" aria-hidden />
                      <p className="text-[11px] text-slate-400">Sin archivos</p>
                      <p className="max-w-[14rem] text-[10px] leading-snug text-slate-400">
                        Puede subir varias del mismo tipo; se listan agrupadas abajo.
                      </p>
                    </div>
                  ) : (
                    <div className="max-h-52 overflow-y-auto">
                      {groups.map((group) => (
                        <div key={group.id} className="border-b border-slate-100 last:border-0">
                          <div className="sticky top-0 z-[1] flex items-center justify-between gap-2 bg-slate-100/90 px-2 py-1 backdrop-blur-sm">
                            <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                              {group.label}
                            </p>
                            <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-slate-600 ring-1 ring-slate-200">
                              {group.files.length}
                            </span>
                          </div>
                          <ul className="divide-y divide-slate-100">
                            {group.files.map((item, idx) => (
                              <li
                                key={item.id}
                                className="flex items-center gap-1.5 px-2 py-1.5"
                              >
                                <div className="min-w-0 flex-1">
                                  <p
                                    className="truncate text-[11px] font-medium text-slate-800"
                                    title={item.filename}
                                  >
                                    <span className="mr-1 tabular-nums text-slate-400">
                                      #{group.files.length - idx}
                                    </span>
                                    {item.filename}
                                  </p>
                                  <p className="truncate text-[10px] text-slate-500">
                                    {isPdf(item) ? "PDF" : "Img"}
                                    {" · "}
                                    {formatBytes(item.size_bytes)}
                                    {" · "}
                                    {formatDateTime(item.created_at)}
                                    {item.notas ? ` · ${item.notas}` : ""}
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
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

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
