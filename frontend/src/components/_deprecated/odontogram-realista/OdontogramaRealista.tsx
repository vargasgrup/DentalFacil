"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Text, Line, Rect } from "react-konva";
import type Konva from "konva";
import {
  CYCLE_CONDITIONS,
  ODONTOGRAM_CONDITIONS,
  EMPTY_SURFACES,
  type SurfaceKey,
} from "@/lib/odontogramConditions";
import {
  displayToothLabel,
  type NumberingSystem,
} from "@/lib/odontogramNumbering";
import type { PlanProposalItem } from "@/lib/odontogramTreatments";
import { ProposeTreatmentModal } from "../ProposeTreatmentModal";
import { ToothAttachments } from "../ToothAttachments";
import { isMarked } from "../useOdontogramPatient";
import { DienteImagenReal } from "./DienteImagenReal";
import { PanelTratamientoRealista } from "./PanelTratamientoRealista";
import { anchoRelativo, secuenciaArcada } from "./mapeoDientesRealista";
import { useOdontogramaRealista } from "./useOdontogramaRealista";
import type { ZonaId } from "./zonasTratamientoRealista";
import "./OdontogramaRealista.css";

const BASE_W = 56;
const BASE_H = 110;
const GAP = 6;
const MID_GAP = 18;

type Tab = "actual" | "historial" | "comparar";

export function OdontogramaRealista({
  patientId,
  onProposeTreatment,
}: {
  patientId: string;
  onProposeTreatment?: (item: PlanProposalItem) => void;
}) {
  const api = useOdontogramaRealista(patientId);
  const {
    denticion,
    setDenticion,
    tool,
    setTool,
    entries,
    loading,
    saving,
    persist,
    clearAll,
    emptySurfaces,
    selectedPieza,
    setSelectedPieza,
    vistaGlobal,
    setVistaGlobal,
    vistaDe,
    setVistaPieza,
    cycleVista,
    scale,
    setScale,
    fetchHistory,
    fetchSnapshots,
    saveSnapshot,
    compareSnapshots,
  } = api;

  const [tab, setTab] = useState<Tab>("actual");
  const [notesDraft, setNotesDraft] = useState("");
  const [propose, setPropose] = useState<{ pieza: string; condicion: string } | null>(null);
  const [sistema, setSistema] = useState<NumberingSystem>("fdi");
  const [stageSize, setStageSize] = useState({ width: 900, height: 520 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [pos, setPos] = useState({ x: 20, y: 24 });
  const lastClick = useRef<{ pieza: string; t: number }>({ pieza: "", t: 0 });

  const seq = useMemo(() => secuenciaArcada(denticion), [denticion]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = Math.max(320, el.clientWidth);
      setStageSize({ width: w, height: Math.min(560, Math.max(420, w * 0.55)) });
    });
    ro.observe(el);
    setStageSize({
      width: Math.max(320, el.clientWidth),
      height: Math.min(560, Math.max(420, el.clientWidth * 0.55)),
    });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (selectedPieza) setNotesDraft(entries[selectedPieza]?.notas || "");
  }, [selectedPieza, entries]);

  const layoutRow = useCallback(
    (piezas: string[], rightLen: number, y: number) => {
      const items: Array<{ pieza: string; x: number; y: number; w: number; h: number }> = [];
      let x = 0;
      piezas.forEach((pieza, i) => {
        if (i === rightLen) x += MID_GAP;
        const w = BASE_W * anchoRelativo(pieza);
        items.push({ pieza, x, y, w, h: BASE_H });
        x += w + GAP;
      });
      return { items, width: x, y };
    },
    []
  );

  const upperLayout = useMemo(
    () => layoutRow(seq.upper, seq.upperRightLen, 28),
    [layoutRow, seq]
  );
  const lowerLayout = useMemo(
    () => layoutRow(seq.lower, seq.lowerRightLen, 28 + BASE_H + 48),
    [layoutRow, seq]
  );
  const contentWidth = Math.max(upperLayout.width, lowerLayout.width) + 40;

  const maybePropose = (pieza: string, estado: string | null, prev: string | null) => {
    if (!estado || !isMarked(estado)) return;
    if (estado === prev) return;
    setPropose({ pieza, condicion: estado });
  };

  const applyGeneral = async (pieza: string, nextTool?: string | null) => {
    const current = isMarked(entries[pieza]?.estado) ? entries[pieza].estado : null;
    const surfaces = entries[pieza]?.superficies || emptySurfaces();
    const t = nextTool === undefined ? tool : nextTool;
    const next = t === null ? null : current === t ? null : t;
    await persist(pieza, next, surfaces);
    maybePropose(pieza, next, current);
  };

  const onZonaClick = async (pieza: string, _zona: ZonaId, surface: SurfaceKey | null) => {
    setSelectedPieza(pieza);
    const now = Date.now();
    if (lastClick.current.pieza === pieza && now - lastClick.current.t < 350) {
      cycleVista(pieza);
      lastClick.current = { pieza: "", t: 0 };
      return;
    }
    lastClick.current = { pieza, t: now };

    if (!surface) {
      // Raíz / furca → estado general (p.ej. endodoncia / pulpa)
      await applyGeneral(pieza);
      return;
    }
    const estado = isMarked(entries[pieza]?.estado) ? entries[pieza].estado : null;
    const surfaces = { ...(entries[pieza]?.superficies || emptySurfaces()) };
    const prev = surfaces[surface];
    surfaces[surface] = surfaces[surface] === tool ? null : tool;
    await persist(pieza, estado, surfaces);
    if (surfaces[surface] && surfaces[surface] !== prev) {
      maybePropose(pieza, surfaces[surface], null);
    }
  };

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const oldScale = scale;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newScale = Math.min(2.4, Math.max(0.55, oldScale * (direction > 0 ? 1.08 : 1 / 1.08)));
    const mousePointTo = {
      x: (pointer.x - pos.x) / oldScale,
      y: (pointer.y - pos.y) / oldScale,
    };
    setScale(newScale);
    setPos({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  };

  const selectedEstado = selectedPieza
    ? isMarked(entries[selectedPieza]?.estado)
      ? entries[selectedPieza].estado
      : null
    : null;
  const selectedSurfaces =
    (selectedPieza && entries[selectedPieza]?.superficies) || { ...EMPTY_SURFACES };

  if (loading) {
    return <p className="text-sm text-slate-400">Cargando odontograma realista…</p>;
  }

  return (
    <div className="space-y-3">
      {saving && <p className="text-help text-brand-600">Guardando…</p>}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-600">Vista:</span>
        {(
          [
            ["actual", "Actual"],
            ["historial", "Historial"],
            ["comparar", "Comparar"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
              tab === id
                ? "border-slate-700 bg-slate-800 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-slate-200" aria-hidden />
        {(
          [
            ["permanente", "Adulto"],
            ["temporal", "Niño"],
            ["mixta", "Mixta"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setDenticion(id)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
              denticion === id
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-slate-200 text-slate-600"
            }`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className="ml-auto rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600"
          onClick={() => setSistema((s) => (s === "fdi" ? "universal" : "fdi"))}
        >
          Numeración: {sistema.toUpperCase()}
        </button>
      </div>

      {tab === "actual" && (
        <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-help text-slate-500">Herramienta:</span>
              {CYCLE_CONDITIONS.map((id) => {
                const c = ODONTOGRAM_CONDITIONS.find((x) => x.id === id);
                if (!c) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTool(id)}
                    className={`rounded-pill border px-2 py-0.5 text-[11px] font-medium ${
                      tool === id
                        ? "border-slate-800 bg-slate-800 text-white"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                onClick={() => setScale(1)}
              >
                Reset zoom
              </button>
              <button
                type="button"
                className="rounded-lg border border-danger-200 px-2 py-1 text-xs text-danger-600"
                onClick={() => void clearAll()}
              >
                Limpiar odontograma
              </button>
            </div>

            <div ref={wrapRef} className="odontograma-realista-stage">
              <Stage
                ref={stageRef}
                width={stageSize.width}
                height={stageSize.height}
                scaleX={scale}
                scaleY={scale}
                x={pos.x}
                y={pos.y}
                draggable
                onDragEnd={(e) => setPos({ x: e.target.x(), y: e.target.y() })}
                onWheel={onWheel}
              >
                <Layer>
                  <Text
                    text="Arcada superior (vista paciente)"
                    fontSize={12}
                    fill="#64748b"
                    x={0}
                    y={4}
                  />
                  <Line
                    points={[
                      upperLayout.width / 2 + MID_GAP / 2 - 4,
                      20,
                      upperLayout.width / 2 + MID_GAP / 2 - 4,
                      lowerLayout.y + BASE_H,
                    ]}
                    stroke="#cbd5e1"
                    dash={[4, 4]}
                    listening={false}
                  />
                  {upperLayout.items.map((t) => (
                    <DienteImagenReal
                      key={`u-${t.pieza}`}
                      pieza={t.pieza}
                      x={t.x}
                      y={t.y}
                      width={t.w}
                      height={t.h}
                      vista={vistaDe(t.pieza)}
                      selected={selectedPieza === t.pieza}
                      estadoGeneral={
                        isMarked(entries[t.pieza]?.estado) ? entries[t.pieza].estado : null
                      }
                      superficies={entries[t.pieza]?.superficies || emptySurfaces()}
                      onSelect={setSelectedPieza}
                      onZonaClick={(p, z, s) => void onZonaClick(p, z, s)}
                    />
                  ))}
                  <Text
                    text="Arcada inferior"
                    fontSize={12}
                    fill="#64748b"
                    x={0}
                    y={lowerLayout.y - 16}
                  />
                  {lowerLayout.items.map((t) => (
                    <DienteImagenReal
                      key={`l-${t.pieza}`}
                      pieza={t.pieza}
                      x={t.x}
                      y={t.y}
                      width={t.w}
                      height={t.h}
                      vista={vistaDe(t.pieza)}
                      selected={selectedPieza === t.pieza}
                      estadoGeneral={
                        isMarked(entries[t.pieza]?.estado) ? entries[t.pieza].estado : null
                      }
                      superficies={entries[t.pieza]?.superficies || emptySurfaces()}
                      onSelect={setSelectedPieza}
                      onZonaClick={(p, z, s) => void onZonaClick(p, z, s)}
                    />
                  ))}
                  <Rect width={contentWidth} height={10} y={lowerLayout.y + BASE_H + 8} opacity={0} />
                </Layer>
              </Stage>
            </div>
            <p className="mt-1 text-help text-slate-500">
              Scroll = zoom · Arrastrar = paneo · Clic en cara = marcar con herramienta · Doble clic =
              cambiar vista · Pieza seleccionada:{" "}
              {selectedPieza
                ? displayToothLabel(selectedPieza, sistema)
                : "ninguna"}
            </p>
          </div>

          <PanelTratamientoRealista
            pieza={selectedPieza}
            tool={tool}
            setTool={setTool}
            vista={selectedPieza ? vistaDe(selectedPieza) : vistaGlobal}
            setVista={(v) => {
              if (selectedPieza) setVistaPieza(selectedPieza, v);
              else setVistaGlobal(v);
            }}
            estado={selectedEstado}
            superficies={selectedSurfaces}
            notas={notesDraft}
            setNotas={setNotesDraft}
            saving={saving}
            onSaveNotas={() => {
              if (!selectedPieza) return;
              void persist(
                selectedPieza,
                selectedEstado,
                selectedSurfaces,
                notesDraft
              );
            }}
            onMarcarAusente={() => {
              if (selectedPieza) void applyGeneral(selectedPieza, "ausente");
            }}
            onLimpiar={() => {
              if (!selectedPieza) return;
              void persist(selectedPieza, null, emptySurfaces(), "");
              setNotesDraft("");
            }}
            onSano={() => {
              if (!selectedPieza) return;
              void persist(selectedPieza, null, emptySurfaces());
            }}
            onProponer={() => {
              if (selectedPieza && selectedEstado) {
                setPropose({ pieza: selectedPieza, condicion: selectedEstado });
              }
            }}
          />
        </div>
      )}

      {tab === "historial" && (
        <HistorialLite patientId={patientId} fetchHistory={fetchHistory} pieza={selectedPieza} />
      )}
      {tab === "comparar" && (
        <CompararLite
          fetchSnapshots={fetchSnapshots}
          saveSnapshot={saveSnapshot}
          compareSnapshots={compareSnapshots}
        />
      )}

      {selectedPieza && tab === "actual" && (
        <ToothAttachments patientId={patientId} pieza={selectedPieza} />
      )}

      <ProposeTreatmentModal
        open={Boolean(propose)}
        pieza={propose?.pieza || ""}
        condicionId={propose?.condicion || ""}
        onClose={() => setPropose(null)}
        onConfirm={(item) => {
          onProposeTreatment?.(item);
          setPropose(null);
        }}
      />
    </div>
  );
}

function HistorialLite({
  fetchHistory,
  pieza,
}: {
  patientId: string;
  fetchHistory: (pieza?: string | null) => Promise<
    Array<{
      id: string;
      pieza_fdi: string;
      estado_antes: string | null;
      estado_despues: string | null;
      user_name: string | null;
      changed_at: string;
      accion: string;
    }>
  >;
  pieza: string | null;
}) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchHistory>>>([]);
  useEffect(() => {
    void fetchHistory(pieza).then(setRows).catch(() => setRows([]));
  }, [fetchHistory, pieza]);
  return (
    <div className="rounded-card border border-slate-200 bg-white p-4 text-sm shadow-card">
      <p className="mb-2 font-semibold text-slate-800">
        Historial {pieza ? `— pieza ${pieza}` : "(todas)"}
      </p>
      {rows.length === 0 ? (
        <p className="text-slate-500">Sin cambios registrados.</p>
      ) : (
        <ul className="max-h-64 space-y-1 overflow-y-auto text-help">
          {rows.map((r) => (
            <li key={r.id} className="border-b border-slate-100 py-1">
              <span className="font-medium">{r.pieza_fdi}</span> · {r.accion} ·{" "}
              {r.estado_antes || "—"} → {r.estado_despues || "—"} ·{" "}
              {new Date(r.changed_at).toLocaleString("es-PE")}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CompararLite({
  fetchSnapshots,
  saveSnapshot,
  compareSnapshots,
}: {
  fetchSnapshots: () => Promise<Array<{ id: string; label: string; taken_at: string }>>;
  saveSnapshot: (label?: string) => Promise<unknown>;
  compareSnapshots: (
    a: string,
    b: string
  ) => Promise<{ changed_count: number; diffs: Array<{ pieza_fdi: string; status: string }> }>;
}) {
  const [snaps, setSnaps] = useState<Array<{ id: string; label: string; taken_at: string }>>([]);
  const [a, setA] = useState<string>("");
  const [b, setB] = useState<string>("");
  const [result, setResult] = useState<string>("");

  useEffect(() => {
    void fetchSnapshots().then(setSnaps).catch(() => setSnaps([]));
  }, [fetchSnapshots]);

  return (
    <div className="space-y-2 rounded-card border border-slate-200 bg-white p-4 text-sm shadow-card">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white"
          onClick={() => void saveSnapshot().then(() => fetchSnapshots().then(setSnaps))}
        >
          Guardar snapshot
        </button>
        <select
          className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
          value={a}
          onChange={(e) => setA(e.target.value)}
        >
          <option value="">Snapshot A</option>
          {snaps.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
          value={b}
          onChange={(e) => setB(e.target.value)}
        >
          <option value="">Snapshot B</option>
          {snaps.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
          disabled={!a || !b}
          onClick={() => {
            if (!a || !b) return;
            void compareSnapshots(a, b).then((r) => {
              setResult(
                `${r.changed_count} cambios · ${r.diffs
                  .filter((d) => d.status !== "igual")
                  .map((d) => d.pieza_fdi)
                  .join(", ")}`
              );
            });
          }}
        >
          Comparar
        </button>
      </div>
      {result && <p className="text-help text-slate-600">{result}</p>}
    </div>
  );
}
