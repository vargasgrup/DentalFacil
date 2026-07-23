"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiFetchBlob } from "@/lib/api";

interface MediaItem {
  id: string;
  pieza_fdi: string;
  tipo: string;
  filename: string;
  url: string;
  notas: string | null;
  created_at: string;
}

const TIPO_LABEL: Record<string, string> = {
  radiografia: "Radiografía",
  foto: "Foto intraoral",
  panoramica: "Panorámica",
};

async function fetchMediaBlob(url: string): Promise<string> {
  const blob = await apiFetchBlob(url);
  return URL.createObjectURL(blob);
}

export function ToothAttachments({
  patientId,
  pieza,
}: {
  patientId: string;
  pieza: string;
}) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [tipo, setTipo] = useState("radiografia");
  const [uploading, setUploading] = useState(false);
  const [viewer, setViewer] = useState<{
    item: MediaItem;
    src: string;
  } | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<MediaItem[]>(
        `/api/tooth-media/${patientId}?pieza_fdi=${pieza}`
      );
      setItems(data);
    } catch {
      setItems([]);
    }
  }, [patientId, pieza]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (viewer?.src) URL.revokeObjectURL(viewer.src);
    };
  }, [viewer]);

  useEffect(() => {
    if (!viewer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeViewer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewer]);

  const closeViewer = () => {
    setViewer((prev) => {
      if (prev?.src) URL.revokeObjectURL(prev.src);
      return null;
    });
  };

  const openViewer = async (item: MediaItem) => {
    setError(null);
    setLoadingId(item.id);
    try {
      const src = await fetchMediaBlob(item.url);
      setViewer((prev) => {
        if (prev?.src) URL.revokeObjectURL(prev.src);
        return { item, src };
      });
    } catch {
      setError("No se pudo visualizar la imagen. Intenta de nuevo.");
    } finally {
      setLoadingId(null);
    }
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("pieza_fdi", pieza);
      fd.append("tipo", tipo);
      const token = localStorage.getItem("access_token");
      const res = await fetch(`/api/tooth-media/${patientId}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Error al subir");
      await load();
    } catch {
      setError("No se pudo subir la imagen.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mt-2 space-y-2 border-t border-slate-200 pt-2">
      <p className="text-xs font-medium text-slate-700">
        Imágenes de la pieza {pieza} (Rx / foto intraoral)
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1 text-xs"
        >
          <option value="radiografia">Radiografía</option>
          <option value="foto">Foto intraoral</option>
          <option value="panoramica">Panorámica</option>
        </select>
        <label className="cursor-pointer rounded border border-slate-400 bg-white px-2 py-1 text-xs hover:bg-slate-50">
          {uploading ? "Subiendo…" : "Subir imagen"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              void onFile(e.target.files?.[0] || null);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {items.length > 0 && (
        <ul className="space-y-2 text-xs">
          {items.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2 py-1.5"
            >
              <span className="min-w-0 flex-1 truncate text-slate-700" title={m.filename}>
                <span className="font-medium text-slate-800">
                  {TIPO_LABEL[m.tipo] || m.tipo}:
                </span>{" "}
                {m.filename}
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  className="rounded border border-brand-600 bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-800 hover:bg-brand-100 disabled:opacity-60"
                  disabled={loadingId === m.id}
                  onClick={() => void openViewer(m)}
                >
                  {loadingId === m.id ? "Cargando…" : "Ver imagen"}
                </button>
                <button
                  type="button"
                  className="text-red-600 hover:underline"
                  onClick={async () => {
                    await apiFetch(`/api/tooth-media/${m.id}`, { method: "DELETE" });
                    if (viewer?.item.id === m.id) closeViewer();
                    await load();
                  }}
                >
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {viewer && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Vista de ${viewer.item.filename}`}
          onClick={closeViewer}
        >
          <div
            className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {TIPO_LABEL[viewer.item.tipo] || viewer.item.tipo} — pieza{" "}
                  {viewer.item.pieza_fdi}
                </p>
                <p className="truncate text-xs text-slate-500">{viewer.item.filename}</p>
              </div>
              <button
                type="button"
                onClick={closeViewer}
                className="shrink-0 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
              >
                Cerrar
              </button>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-slate-950 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={viewer.src}
                alt={viewer.item.filename}
                className="max-h-[80vh] max-w-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
