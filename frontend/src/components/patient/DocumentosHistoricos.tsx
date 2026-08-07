"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  Download,
  Eye,
  FileImage,
  FileText,
  ScanLine,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { apiFetch, apiFetchBlob, apiUpload, ApiError, buildMediaSrc } from "@/lib/api";
import { downloadBlob } from "@/lib/downloadBlob";
import { afterNativeFileDialog, recoverClinicMainPaint } from "@/lib/desktopViewport";
import { formatDateTime } from "@/lib/datetime";
import { Button } from "@/components/ui/Button";
import { DigitizedDocumentViewer } from "@/components/DigitizedDocumentViewer";
import { MediaPanelErrorBoundary } from "@/components/MediaPanelErrorBoundary";

interface HistoricalDoc {
  id: string;
  patient_id: string;
  tipo: string;
  tipo_label: string;
  titulo: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  source: "upload" | "scan" | string;
  document_date: string | null;
  notas: string | null;
  created_at: string;
  url: string;
}

const TIPOS: { id: string; label: string }[] = [
  { id: "ficha_clinica", label: "Ficha clínica física" },
  { id: "odontograma", label: "Odontograma dibujado" },
  { id: "evolucion", label: "Evolución / seguimiento" },
  { id: "radiografia", label: "Radiografía impresa" },
  { id: "consentimiento", label: "Consentimiento firmado" },
  { id: "presupuesto", label: "Presupuesto / plan" },
  { id: "otro", label: "Otro documento" },
];

const ACCEPT =
  "image/*,.pdf,application/pdf,.jpg,.jpeg,.png,.gif,.webp,.bmp,.tif,.tiff,.heic,.heif";

const FIELD =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600";

function formatDocDate(value: string): string {
  // YYYY-MM-DD from backend date — avoid UTC shift
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }
  return formatDateTime(value, { hour: undefined, minute: undefined });
}

function formatBytes(n: number): string {
  if (!n || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function isPdf(item: HistoricalDoc): boolean {
  return (
    item.content_type === "application/pdf" ||
    item.filename.toLowerCase().endsWith(".pdf")
  );
}

function isImageFile(item: HistoricalDoc): boolean {
  if (isPdf(item)) return false;
  if (item.content_type.startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|webp|bmp|tiff?|heic|heif)$/i.test(item.filename);
}

function validateFile(file: File): string | null {
  const okImage = file.type.startsWith("image/");
  const okPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!okImage && !okPdf) return "Solo se permiten imágenes o archivos PDF.";
  if (file.size > 25 * 1024 * 1024) return "El archivo supera el límite de 25 MB.";
  return null;
}

export function DocumentosHistoricos({
  patientId,
  readOnly = false,
}: {
  patientId: string;
  readOnly?: boolean;
}) {
  const [items, setItems] = useState<HistoricalDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [tipo, setTipo] = useState("ficha_clinica");
  const [titulo, setTitulo] = useState("");
  const [documentDate, setDocumentDate] = useState("");
  const [notas, setNotas] = useState("");
  const [filterTipo, setFilterTipo] = useState("all");
  const [dragOver, setDragOver] = useState(false);
  const [viewer, setViewer] = useState<{ item: HistoricalDoc; src: string } | null>(
    null
  );
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [scanOpen, setScanOpen] = useState(false);
  const [scanError, setScanError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<HistoricalDoc[]>(
        `/api/historical-documents/${patientId}`
      );
      setItems(data);
    } catch {
      setItems([]);
      setError("No se pudieron cargar los documentos históricos.");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lazy thumbnails via streaming URL (never full Blob into JS heap).
  useEffect(() => {
    const pending = items.filter((item) => isImageFile(item) && !thumbs[item.id]);
    if (pending.length === 0) return;
    setThumbs((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const item of pending) {
        if (next[item.id]) continue;
        next[item.id] = buildMediaSrc(item.url);
        changed = true;
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed thumbs; refetch on items only
  }, [items]);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const closeScan = () => {
    stopCamera();
    setScanOpen(false);
    setScanError("");
  };

  const openScan = async () => {
    setScanError("");
    setScanOpen(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        // Fallback: native camera capture via file input
        setScanOpen(false);
        cameraInputRef.current?.click();
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setScanOpen(false);
      // Desktop without camera permission → file capture fallback
      cameraInputRef.current?.click();
    }
  };

  const captureScan = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setScanError("La cámara aún no está lista.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setScanError("No se pudo capturar la imagen.");
      return;
    }
    ctx.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92)
    );
    if (!blob) {
      setScanError("No se pudo generar la captura.");
      return;
    }
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const file = new File([blob], `escaneo-${stamp}.jpg`, { type: "image/jpeg" });
    closeScan();
    await uploadFile(file, "scan");
  };

  const uploadFile = async (file: File, source: "upload" | "scan") => {
    const validation = validateFile(file);
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("tipo", tipo);
      fd.append("source", source);
      if (titulo.trim()) fd.append("titulo", titulo.trim());
      if (notas.trim()) fd.append("notas", notas.trim());
      if (documentDate) fd.append("document_date", documentDate);
      await apiUpload(`/api/historical-documents/${patientId}`, fd);
      setTitulo("");
      setNotas("");
      setSuccess(
        source === "scan"
          ? "Escaneo guardado correctamente."
          : "Documento cargado correctamente."
      );
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "No se pudo guardar el documento."
      );
    } finally {
      setBusy(false);
    }
  };

  const onFiles = (list: FileList | File[] | null, source: "upload" | "scan") => {
    if (!list || (Array.isArray(list) ? list.length === 0 : list.length === 0)) return;
    const files = Array.from(list as FileList);
    afterNativeFileDialog(async () => {
      for (const file of files) {
        await uploadFile(file, source);
      }
      recoverClinicMainPaint();
    });
  };

  const closeViewer = () => setViewer(null);

  const openViewer = (item: HistoricalDoc) => {
    setError("");
    setLoadingId(item.id);
    try {
      setViewer({ item, src: buildMediaSrc(item.url) });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "No se pudo visualizar el documento. Intenta de nuevo."
      );
    } finally {
      setLoadingId(null);
    }
  };

  const downloadItem = async (item: HistoricalDoc) => {
    setLoadingId(item.id);
    try {
      const blob = await apiFetchBlob(item.url);
      const result = await downloadBlob(blob, item.filename || "documento");
      if (!result.ok) {
        setError(result.error || "No se pudo descargar el documento.");
      }
    } catch {
      setError("No se pudo descargar el documento.");
    } finally {
      setLoadingId(null);
      recoverClinicMainPaint();
    }
  };

  const onDelete = async (item: HistoricalDoc) => {
    if (!window.confirm(`¿Eliminar «${item.titulo || item.filename}»?`)) return;
    setError("");
    try {
      await apiFetch(`/api/historical-documents/file/${item.id}`, { method: "DELETE" });
      if (viewer?.item.id === item.id) closeViewer();
      setThumbs((prev) => {
        const next = { ...prev };
        if (next[item.id]) {
          delete next[item.id];
        }
        return next;
      });
      await load();
    } catch {
      setError("No se pudo eliminar el documento.");
    }
  };

  const visible = items.filter((i) => filterTipo === "all" || i.tipo === filterTipo);

  return (
    <MediaPanelErrorBoundary title="Error en documentos históricos">
    <div className="space-y-5">
      <div className="rounded-xl border border-brand-100 bg-gradient-to-br from-brand-50/80 to-white px-4 py-3.5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
            <ScanLine className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-800">
              Archivo clínico previo al sistema
            </p>
            <p className="mt-0.5 text-sm leading-relaxed text-slate-500">
              Digitaliza fichas, odontogramas dibujados a mano, evoluciones y demás
              papeles históricos del centro. Puedes escanear con la cámara o cargar
              fotos/PDF ya digitalizados, y visualizarlos cuando lo necesites.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700"
        >
          {error}
        </p>
      )}
      {success && (
        <p
          role="status"
          className="rounded-lg border border-success-200 bg-success-50 px-3 py-2 text-sm text-success-700"
        >
          {success}
        </p>
      )}

      {!readOnly && (
      <div className="rounded-xl border border-slate-200 bg-surface-subtle p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-800">
          Agregar documento histórico
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-label text-slate-700">Tipo *</span>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className={FIELD}
            >
              {TIPOS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-label text-slate-700">Título</span>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej. Odontograma inicial 2022"
              className={FIELD}
              maxLength={200}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-label text-slate-700">
              Fecha del documento
            </span>
            <input
              type="date"
              value={documentDate}
              onChange={(e) => setDocumentDate(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-label text-slate-700">Notas</span>
            <input
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Referencia breve (opcional)"
              className={FIELD}
            />
          </label>
        </div>

        <div
          className={`mt-4 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
            dragOver
              ? "border-brand-500 bg-brand-50"
              : "border-slate-300 bg-white hover:border-brand-300"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void onFiles(e.dataTransfer.files, "upload");
          }}
        >
          <FileImage className="mx-auto h-8 w-8 text-slate-400" aria-hidden />
          <p className="mt-2 text-sm font-medium text-slate-700">
            Arrastra aquí fotos o PDF del archivo físico
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Imágenes o PDF · máximo 25 MB por archivo
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Button
              type="button"
              variant="primary"
              disabled={busy}
              icon={<Camera className="h-4 w-4" />}
              onClick={() => void openScan()}
            >
              Escanear
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              icon={<Upload className="h-4 w-4" />}
              onClick={() => fileInputRef.current?.click()}
            >
              {busy ? "Guardando…" : "Cargar archivo"}
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              void onFiles(e.target.files, "upload");
              e.target.value = "";
            }}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              void onFiles(e.target.files, "scan");
              e.target.value = "";
            }}
          />
        </div>
      </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            Documentos digitalizados
          </h3>
          <p className="text-help text-slate-500">
            {loading
              ? "Cargando…"
              : `${visible.length} ${visible.length === 1 ? "documento" : "documentos"}`}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <span className="text-label text-slate-500">Filtrar</span>
          <select
            value={filterTipo}
            onChange={(e) => setFilterTipo(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
          >
            <option value="all">Todos</option>
            {TIPOS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!loading && visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center">
          <FileText className="mx-auto h-8 w-8 text-slate-300" aria-hidden />
          <p className="mt-2 text-sm font-medium text-slate-600">
            Aún no hay documentos históricos
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Escanea o carga la primera ficha física de este paciente.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((item) => (
            <li
              key={item.id}
              className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              <button
                type="button"
                onClick={() => void openViewer(item)}
                className="relative flex h-36 items-center justify-center overflow-hidden bg-slate-100"
                aria-label={`Visualizar ${item.titulo}`}
              >
                {thumbs[item.id] && isImageFile(item) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbs[item.id]}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-slate-400">
                    {isPdf(item) ? (
                      <FileText className="h-10 w-10" />
                    ) : (
                      <FileImage className="h-10 w-10" />
                    )}
                    <span className="text-xs font-medium">
                      {isPdf(item) ? "PDF" : "Imagen"}
                    </span>
                  </div>
                )}
                <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 shadow-sm">
                  {item.source === "scan" ? "Escaneo" : "Carga"}
                </span>
              </button>
              <div className="flex flex-1 flex-col gap-2 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800" title={item.titulo}>
                    {item.titulo}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {item.tipo_label}
                    {item.document_date ? ` · ${formatDocDate(item.document_date)}` : ""}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-slate-400">
                    {isPdf(item) ? "PDF" : "Imagen"} · {formatBytes(item.size_bytes)} ·{" "}
                    {formatDateTime(item.created_at)}
                  </p>
                  {item.notas && (
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">{item.notas}</p>
                  )}
                </div>
                <div className="mt-auto flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    variant="secondary"
                    className="!px-2.5 !py-1.5 text-xs"
                    disabled={loadingId === item.id}
                    icon={<Eye className="h-3.5 w-3.5" />}
                    onClick={() => void openViewer(item)}
                  >
                    {loadingId === item.id ? "…" : "Ver"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="!px-2.5 !py-1.5 text-xs"
                    disabled={loadingId === item.id}
                    icon={<Download className="h-3.5 w-3.5" />}
                    onClick={() => void downloadItem(item)}
                  >
                    Descargar
                  </Button>
                  {!readOnly && (
                  <button
                    type="button"
                    onClick={() => void onDelete(item)}
                    className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-danger-50 hover:text-danger-600"
                    aria-label={`Eliminar ${item.titulo}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {scanOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Escanear documento"
        >
          <div className="relative w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Escanear documento</p>
                <p className="text-xs text-slate-500">
                  Enfoca la ficha o el odontograma físico y captura
                </p>
              </div>
              <button
                type="button"
                onClick={closeScan}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
                aria-label="Cerrar escáner"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="bg-slate-950 p-3">
              <video
                ref={videoRef}
                playsInline
                muted
                className="mx-auto max-h-[60vh] w-full rounded-lg object-contain"
              />
            </div>
            {scanError && (
              <p className="px-4 pt-2 text-sm text-danger-600">{scanError}</p>
            )}
            <div className="flex flex-wrap justify-end gap-2 px-4 py-3">
              <Button type="button" variant="secondary" onClick={closeScan}>
                Cancelar
              </Button>
              <Button
                type="button"
                icon={<Camera className="h-4 w-4" />}
                onClick={() => void captureScan()}
              >
                Capturar y guardar
              </Button>
            </div>
          </div>
        </div>
      )}

      {viewer && (
        <DigitizedDocumentViewer
          title={viewer.item.titulo}
          subtitle={`${viewer.item.tipo_label}${
            viewer.item.document_date
              ? ` · ${formatDocDate(viewer.item.document_date)}`
              : ""
          } · ${viewer.item.filename}`}
          src={viewer.src}
          kind={isPdf(viewer.item) ? "pdf" : "image"}
          onClose={closeViewer}
          onDownload={() => void downloadItem(viewer.item)}
        />
      )}
    </div>
    </MediaPanelErrorBoundary>
  );
}
