"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiFetchBlob, getToken } from "@/lib/api";
import { DigitizedDocumentViewer } from "@/components/DigitizedDocumentViewer";

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
      const token = getToken();
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
        <DigitizedDocumentViewer
          title={`${TIPO_LABEL[viewer.item.tipo] || viewer.item.tipo} — pieza ${viewer.item.pieza_fdi}`}
          subtitle={viewer.item.filename}
          src={viewer.src}
          kind="image"
          onClose={closeViewer}
        />
      )}
    </div>
  );
}
