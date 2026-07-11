"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface MediaItem {
  id: number;
  pieza_fdi: string;
  tipo: string;
  filename: string;
  url: string;
  notas: string | null;
  created_at: string;
}

export function ToothAttachments({
  patientId,
  pieza,
}: {
  patientId: number;
  pieza: string;
}) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [tipo, setTipo] = useState("radiografia");
  const [uploading, setUploading] = useState(false);

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

  const onFile = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("pieza_fdi", pieza);
      fd.append("tipo", tipo);
      const token = localStorage.getItem("access_token");
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || ""}/api/tooth-media/${patientId}`,
        {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: fd,
          credentials: "include",
        }
      );
      if (!res.ok) throw new Error("Error al subir");
      await load();
    } catch {
      /* ignore */
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
            onChange={(e) => void onFile(e.target.files?.[0] || null)}
          />
        </label>
      </div>
      {items.length > 0 && (
        <ul className="space-y-1 text-xs">
          {items.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2">
              <a
                href={m.url}
                target="_blank"
                rel="noreferrer"
                className="text-brand-700 underline"
              >
                {m.tipo}: {m.filename}
              </a>
              <button
                type="button"
                className="text-red-600"
                onClick={async () => {
                  await apiFetch(`/api/tooth-media/${m.id}`, { method: "DELETE" });
                  await load();
                }}
              >
                Eliminar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
