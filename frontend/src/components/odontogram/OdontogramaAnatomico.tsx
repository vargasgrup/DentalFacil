"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CYCLE_CONDITIONS,
  ODONTOGRAM_CONDITIONS,
  PERMANENT,
  TEMPORAL,
  conditionById,
  type SurfaceKey,
} from "@/lib/odontogramConditions";
import {
  displayToothLabel,
  type NumberingSystem,
} from "@/lib/odontogramNumbering";
import type { PlanProposalItem } from "@/lib/odontogramTreatments";
import { ToothSVG } from "./ToothSVG";
import { SurfaceCross } from "./SurfaceCross";
import { ProposeTreatmentModal } from "./ProposeTreatmentModal";
import { ToothAttachments } from "./ToothAttachments";
import { VoiceDictation } from "@/components/VoiceDictation";
import {
  isMarked,
  useOdontogramPatient,
  type ChangeLogEntry,
  type CompareResult,
  type OdontogramSnapshot,
} from "./useOdontogramPatient";

type Tab = "actual" | "historial" | "comparar";
type MobileArch = "upper" | "lower" | "both";

/** Columnas del chart usan --odo-col / --odo-mid (responsive en el wrapper). */
function gridStyle(rightLen: number, leftLen: number): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: `repeat(${rightLen}, var(--odo-col)) var(--odo-mid) repeat(${leftLen}, var(--odo-col))`,
    justifyContent: "center",
    width: "max-content",
    maxWidth: "100%",
    marginLeft: "auto",
    marginRight: "auto",
    columnGap: 0,
  };
}

function NumCell({
  pieza,
  highlight,
  selected,
  sistema,
}: {
  pieza: string;
  highlight?: boolean;
  selected?: boolean;
  sistema: NumberingSystem;
}) {
  return (
    <div
      className={`box-border flex h-[22px] w-full items-center justify-center border text-[10px] font-medium tabular-nums leading-none sm:h-6 sm:text-xs ${
        selected
          ? "border-sky-500 bg-sky-100 font-bold text-sky-900"
          : highlight
            ? "border-black bg-amber-100 font-bold text-amber-900"
            : "border-black bg-white text-black"
      }`}
      title={`FDI ${pieza}`}
    >
      {displayToothLabel(pieza, sistema)}
    </div>
  );
}

function ToothCell({
  selected,
  compare,
  children,
}: {
  selected?: boolean;
  compare?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`box-border flex w-full flex-col items-center justify-center border px-0 py-1.5 sm:py-2 md:py-2.5 ${
        selected
          ? "border-sky-500 bg-sky-100/90"
          : compare
            ? "border-transparent bg-amber-50"
            : "border-transparent"
      }`}
    >
      {children}
    </div>
  );
}

function formatDt(iso: string) {
  try {
    return new Date(iso).toLocaleString("es-VE", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function labelCond(id: string | null | undefined) {
  if (!id) return "Sin marca";
  return conditionById(id)?.label || id;
}

export function OdontogramaAnatomico({
  patientId,
  onProposeTreatment,
}: {
  patientId: number;
  onProposeTreatment?: (item: PlanProposalItem) => void;
}) {
  const api = useOdontogramPatient(patientId);
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
    fetchHistory,
    fetchSnapshots,
    saveSnapshot,
    compareSnapshots,
  } = api;

  const [tab, setTab] = useState<Tab>("actual");
  const [selectedPieza, setSelectedPieza] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [history, setHistory] = useState<ChangeLogEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [snapshots, setSnapshots] = useState<OdontogramSnapshot[]>([]);
  const [snapA, setSnapA] = useState<number | "">("");
  const [snapB, setSnapB] = useState<number | "">("");
  const [compare, setCompare] = useState<CompareResult | null>(null);
  const [mobileArch, setMobileArch] = useState<MobileArch>("both");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [propose, setPropose] = useState<{ pieza: string; condicion: string } | null>(null);
  const [sistema, setSistema] = useState<NumberingSystem>("fdi");

  const arches = denticion === "temporal" ? TEMPORAL : PERMANENT;
  const tempArches = TEMPORAL;
  const showMixedNums = denticion === "mixta";
  const upperSeq = useMemo(
    () => [...arches.upperRight, ...arches.upperLeft],
    [arches]
  );
  const lowerSeq = useMemo(
    () => [...arches.lowerRight, ...arches.lowerLeft],
    [arches]
  );
  const ur = arches.upperRight.length;
  const ul = arches.upperLeft.length;
  const lr = arches.lowerRight.length;
  const ll = arches.lowerLeft.length;
  const upperGrid = gridStyle(ur, ul);
  const lowerGrid = gridStyle(lr, ll);

  const changedPiezas = useMemo(() => {
    if (!compare) return new Set<string>();
    return new Set(
      compare.diffs.filter((d) => d.status !== "igual").map((d) => d.pieza_fdi)
    );
  }, [compare]);

  useEffect(() => {
    if (selectedPieza) {
      setNotesDraft(entries[selectedPieza]?.notas || "");
    }
  }, [selectedPieza, entries]);

  const reloadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const rows = await fetchHistory(selectedPieza);
      setHistory(rows);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [fetchHistory, selectedPieza]);

  useEffect(() => {
    if (tab === "historial") void reloadHistory();
  }, [tab, reloadHistory]);

  const reloadSnapshots = useCallback(async () => {
    try {
      const rows = await fetchSnapshots();
      setSnapshots(rows);
    } catch {
      setSnapshots([]);
    }
  }, [fetchSnapshots]);

  useEffect(() => {
    if (tab === "comparar") void reloadSnapshots();
  }, [tab, reloadSnapshots, denticion]);

  const maybePropose = (pieza: string, estado: string | null, prev: string | null) => {
    if (!estado || !isMarked(estado)) return;
    if (estado === prev) return;
    setPropose({ pieza, condicion: estado });
  };

  const applyGeneral = async (pieza: string, e: React.MouseEvent) => {
    e.preventDefault();
    setSelectedPieza(pieza);
    const current = isMarked(entries[pieza]?.estado) ? entries[pieza].estado : null;
    const surfaces = entries[pieza]?.superficies || emptySurfaces();

    if (e.shiftKey) {
      const idx = Math.max(0, CYCLE_CONDITIONS.indexOf(current || ""));
      const next = CYCLE_CONDITIONS[(idx + 1) % CYCLE_CONDITIONS.length];
      await persist(pieza, next, surfaces);
      maybePropose(pieza, next, current);
      return;
    }

    const next = current === tool ? null : tool;
    await persist(pieza, next, surfaces);
    maybePropose(pieza, next, current);
  };

  const applySurface = async (pieza: string, surface: SurfaceKey, e: React.MouseEvent) => {
    e.preventDefault();
    setSelectedPieza(pieza);
    const estado = isMarked(entries[pieza]?.estado) ? entries[pieza].estado : null;
    const surfaces = { ...(entries[pieza]?.superficies || emptySurfaces()) };
    const prev = surfaces[surface];
    surfaces[surface] = surfaces[surface] === tool ? null : tool;
    await persist(pieza, estado, surfaces);
    if (surfaces[surface] && surfaces[surface] !== prev) {
      maybePropose(pieza, surfaces[surface], null);
    }
  };

  const onToothTap = (pieza: string, e: React.MouseEvent) => {
    // En móvil: abrir sheet; en desktop: aplicar herramienta
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches) {
      e.preventDefault();
      setSelectedPieza(pieza);
      setSheetOpen(true);
      return;
    }
    void applyGeneral(pieza, e);
  };

  const renderNums = (
    seq: string[],
    rightLen: number,
    style: React.CSSProperties,
    highlightSet?: Set<string>
  ) => (
    <div style={style} className="odo-nums">
      {seq.slice(0, rightLen).map((p) => (
        <NumCell
          key={`n-${p}`}
          pieza={p}
          highlight={highlightSet?.has(p)}
          selected={selectedPieza === p}
          sistema={sistema}
        />
      ))}
      <div aria-hidden />
      {seq.slice(rightLen).map((p) => (
        <NumCell
          key={`n-${p}`}
          pieza={p}
          highlight={highlightSet?.has(p)}
          selected={selectedPieza === p}
          sistema={sistema}
        />
      ))}
    </div>
  );

  const renderTeeth = (
    seq: string[],
    arch: "upper" | "lower",
    rightLen: number,
    style: React.CSSProperties,
    readOnly = false
  ) => (
    <div style={style} className="odo-teeth">
      {seq.slice(0, rightLen).map((p) => {
        const estado = isMarked(entries[p]?.estado) ? entries[p].estado : null;
        return (
          <ToothCell
            key={`t-${p}`}
            selected={selectedPieza === p}
            compare={changedPiezas.has(p) && tab === "comparar"}
          >
            <ToothSVG
              pieza={p}
              arch={arch}
              condicion={estado}
              selected={selectedPieza === p}
              onClick={(e) => {
                if (readOnly) {
                  e.preventDefault();
                  setSelectedPieza(p);
                  return;
                }
                onToothTap(p, e);
              }}
            />
          </ToothCell>
        );
      })}
      <div aria-hidden />
      {seq.slice(rightLen).map((p) => {
        const estado = isMarked(entries[p]?.estado) ? entries[p].estado : null;
        return (
          <ToothCell
            key={`t-${p}`}
            selected={selectedPieza === p}
            compare={changedPiezas.has(p) && tab === "comparar"}
          >
            <ToothSVG
              pieza={p}
              arch={arch}
              condicion={estado}
              selected={selectedPieza === p}
              onClick={(e) => {
                if (readOnly) {
                  e.preventDefault();
                  setSelectedPieza(p);
                  return;
                }
                onToothTap(p, e);
              }}
            />
          </ToothCell>
        );
      })}
    </div>
  );

  const renderCrosses = (
    seq: string[],
    rightLen: number,
    style: React.CSSProperties,
    readOnly = false
  ) => (
    <div style={style} className="odo-crosses">
      {seq.slice(0, rightLen).map((p) => {
        const surfaces = entries[p]?.superficies || emptySurfaces();
        const circled = Object.values(surfaces).some((v) => v === "obturacion");
        return (
          <div
            key={`c-${p}`}
            className="box-border flex w-full justify-center py-1 sm:py-1.5"
          >
            <SurfaceCross
              pieza={p}
              surfaces={surfaces}
              circled={circled}
              onSurfaceClick={(s, e) => {
                if (readOnly) return;
                void applySurface(p, s, e);
              }}
            />
          </div>
        );
      })}
      <div aria-hidden />
      {seq.slice(rightLen).map((p) => {
        const surfaces = entries[p]?.superficies || emptySurfaces();
        const circled = Object.values(surfaces).some((v) => v === "obturacion");
        return (
          <div
            key={`c-${p}`}
            className="box-border flex w-full justify-center py-1 sm:py-1.5"
          >
            <SurfaceCross
              pieza={p}
              surfaces={surfaces}
              circled={circled}
              onSurfaceClick={(s, e) => {
                if (readOnly) return;
                void applySurface(p, s, e);
              }}
            />
          </div>
        );
      })}
    </div>
  );

  const cellClass = (active: boolean) =>
    `flex min-h-[2rem] sm:min-h-[1.7rem] items-center justify-center border border-black bg-white px-0.5 py-1.5 sm:py-1 text-center text-[11px] sm:text-[10px] leading-tight text-black sm:text-[11px] ${
      active ? "bg-[#b8e0c8] font-semibold" : "hover:bg-slate-50"
    }`;

  const tabClass = (active: boolean) =>
    `border px-3 py-1.5 text-xs font-semibold ${
      active
        ? "border-slate-700 bg-slate-800 text-white"
        : "border-slate-400 bg-white text-slate-700 hover:bg-slate-50"
    }`;

  const showUpper = mobileArch === "both" || mobileArch === "upper";
  const showLower = mobileArch === "both" || mobileArch === "lower";

  const selectedEstado = selectedPieza
    ? isMarked(entries[selectedPieza]?.estado)
      ? entries[selectedPieza].estado
      : null
    : null;

  if (loading) {
    return <p className="text-sm text-slate-400">Cargando odontograma…</p>;
  }

  return (
    <div className="space-y-2">
      {saving && <p className="text-help text-brand-600">Guardando…</p>}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-600">Vista:</span>
        <div className="inline-flex gap-1" role="tablist">
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
              role="tab"
              aria-selected={tab === id}
              className={tabClass(tab === id)}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "actual" && (
        <>
          <div className="overflow-x-auto">
            {/* Leyenda: chips scroll en móvil, grilla en desktop */}
            <div className="sm:hidden">
              <div className="flex gap-2 overflow-x-auto pb-2">
                {ODONTOGRAM_CONDITIONS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setTool(c.id)}
                    className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-2 text-xs ${
                      tool === c.id
                        ? "border-emerald-700 bg-[#b8e0c8] font-semibold"
                        : "border-slate-400 bg-white"
                    }`}
                  >
                    <span
                      className="inline-block h-3 w-3 rounded-sm border border-slate-600"
                      style={{ backgroundColor: c.color }}
                    />
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div
              className="hidden min-w-[36rem] grid-cols-6 border border-black sm:grid"
              role="toolbar"
              aria-label="Condiciones del odontograma"
            >
              {ODONTOGRAM_CONDITIONS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setTool(c.id)}
                  className={cellClass(tool === c.id)}
                  title={c.label}
                >
                  <span
                    className="mr-1 inline-block h-2.5 w-2.5 shrink-0 border border-slate-600"
                    style={{ backgroundColor: c.color }}
                    aria-hidden
                  />
                  {c.label}
                </button>
              ))}
              <div className="min-h-[1.7rem] border border-black bg-white" aria-hidden />
              <div className="min-h-[1.7rem] border border-black bg-white" aria-hidden />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div
                className="inline-flex overflow-hidden border border-black"
                role="group"
                aria-label="Tipo de odontograma"
              >
                {(
                  [
                    ["permanente", "Adulto"],
                    ["temporal", "Niño"],
                    ["mixta", "Mixto"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setDenticion(id)}
                    className={`min-w-[4.75rem] border-r border-black px-3 py-2 text-xs font-semibold text-black last:border-r-0 sm:py-1.5 ${
                      denticion === id ? "bg-[#b8e0c8]" : "bg-white hover:bg-slate-50"
                    }`}
                    aria-pressed={denticion === id}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setSistema((s) => (s === "fdi" ? "universal" : "fdi"))}
                className="border border-black bg-white px-3 py-2 text-xs font-semibold text-black hover:bg-slate-50 sm:py-1.5"
                title="Alternar nomenclatura FDI / Universal"
              >
                {sistema === "fdi" ? "FDI" : "Universal"}
              </button>
              <button
                type="button"
                onClick={() => void clearAll()}
                className="border border-black bg-white px-3 py-2 text-xs font-semibold text-black hover:bg-slate-50 sm:py-1.5"
              >
                Limpiar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const snap = await saveSnapshot();
                  alert(`Estado de cita guardado: ${snap.label}`);
                  await reloadSnapshots();
                }}
                className="border border-emerald-700 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 sm:py-1.5"
              >
                Guardar estado de cita
              </button>
            </div>

            {/* Selector de arcada — solo móvil */}
            <div className="mt-2 flex gap-2 sm:hidden">
              {(
                [
                  ["upper", "Maxilar"],
                  ["lower", "Mandíbula"],
                  ["both", "Ambas"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMobileArch(id)}
                  className={`flex-1 border px-2 py-2 text-xs font-semibold ${
                    mobileArch === id
                      ? "border-slate-700 bg-slate-800 text-white"
                      : "border-slate-400 bg-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <p className="mt-1 text-[11px] text-slate-500">
              Herramienta:{" "}
              <span className="font-medium text-black">
                {conditionById(tool)?.label || tool}
              </span>
              <span className="text-slate-400">
                {" "}
                · Rojo = patología / a tratar · Azul = realizado · Nomenclatura {sistema.toUpperCase()}
              </span>
            </p>
          </div>

          <div
            className="overflow-x-auto border border-black bg-white [--odo-col:2.125rem] [--odo-mid:0.35rem] sm:[--odo-col:2.375rem] sm:[--odo-mid:0.45rem] md:[--odo-col:2.625rem] md:[--odo-mid:0.5rem] lg:[--odo-col:2.75rem] lg:[--odo-mid:0.55rem]"
          >
            <div className="flex min-w-0 flex-col gap-y-2 px-1 py-2.5 sm:gap-y-2.5 sm:px-2 sm:py-3 md:gap-y-3 md:py-3.5">
              {showUpper && (
                <>
                  {renderNums(upperSeq, ur, upperGrid)}
                  {showMixedNums &&
                    renderNums(
                      [...tempArches.upperRight, ...tempArches.upperLeft],
                      tempArches.upperRight.length,
                      gridStyle(tempArches.upperRight.length, tempArches.upperLeft.length)
                    )}
                  {renderTeeth(upperSeq, "upper", ur, upperGrid)}
                  {renderCrosses(upperSeq, ur, upperGrid)}
                </>
              )}
              {showUpper && showLower && (
                <div className="hidden flex-col gap-y-1.5 sm:flex md:gap-y-2">
                  {renderNums(upperSeq, ur, upperGrid)}
                  {renderNums(lowerSeq, lr, lowerGrid)}
                </div>
              )}
              {showLower && (
                <>
                  {renderCrosses(lowerSeq, lr, lowerGrid)}
                  {renderTeeth(lowerSeq, "lower", lr, lowerGrid)}
                  {showMixedNums &&
                    renderNums(
                      [...tempArches.lowerRight, ...tempArches.lowerLeft],
                      tempArches.lowerRight.length,
                      gridStyle(tempArches.lowerRight.length, tempArches.lowerLeft.length)
                    )}
                  {renderNums(lowerSeq, lr, lowerGrid)}
                </>
              )}
            </div>
          </div>

          {/* Panel de pieza */}
          {selectedPieza && (
            <div className="rounded-sm border border-slate-300 bg-slate-50 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Pieza {selectedPieza}
                    {selectedEstado && (
                      <span className="ml-2 font-normal text-slate-600">
                        — {labelCond(selectedEstado)}
                      </span>
                    )}
                  </p>
                  {entries[selectedPieza]?.updated_at && (
                    <p className="text-[11px] text-slate-500">
                      Última modificación: {formatDt(entries[selectedPieza].updated_at!)}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedEstado && onProposeTreatment && (
                    <button
                      type="button"
                      onClick={() =>
                        setPropose({ pieza: selectedPieza, condicion: selectedEstado })
                      }
                      className="border border-emerald-700 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900"
                    >
                      Proponer tratamiento
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setTab("historial");
                    }}
                    className="border border-slate-400 bg-white px-3 py-1.5 text-xs"
                  >
                    Ver historial
                  </button>
                </div>
              </div>
              <label className="mt-2 block text-xs text-slate-600">
                Notas de la pieza
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <VoiceDictation value={notesDraft} onChange={setNotesDraft} />
                </div>
                <textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  onBlur={() => {
                    const estado = selectedEstado;
                    const surfaces = entries[selectedPieza]?.superficies || emptySurfaces();
                    void persist(selectedPieza, estado, surfaces, notesDraft);
                  }}
                  rows={2}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  placeholder="Observaciones clínicas de esta pieza… (también puedes dictar)"
                />
              </label>
              <ToothAttachments patientId={patientId} pieza={selectedPieza} />
            </div>
          )}
        </>
      )}

      {tab === "historial" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-slate-600">
              Pieza
              <select
                value={selectedPieza || ""}
                onChange={(e) => setSelectedPieza(e.target.value || null)}
                className="ml-2 rounded border border-slate-300 px-2 py-1.5 text-sm"
              >
                <option value="">Todas</option>
                {[...upperSeq, ...lowerSeq].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void reloadHistory()}
              className="border border-slate-400 px-3 py-1.5 text-xs"
            >
              Actualizar
            </button>
            <span className="text-xs text-slate-500">
              Dentición: {denticion === "permanente" ? "Adulto" : "Niño"}
            </span>
          </div>
          {historyLoading ? (
            <p className="text-sm text-slate-400">Cargando historial…</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-slate-500">
              Sin cambios registrados aún. Cada marca en el odontograma queda con fecha y hora.
            </p>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-y-auto">
              {history.map((h) => (
                <li
                  key={h.id}
                  className="rounded border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold tabular-nums">
                      {h.pieza_fdi || "(todas)"}
                    </span>
                    <span className="text-[11px] text-slate-500">{formatDt(h.changed_at)}</span>
                  </div>
                  <p className="mt-0.5 text-slate-700">
                    {labelCond(h.estado_antes)} →{" "}
                    <span className="font-medium">{labelCond(h.estado_despues)}</span>
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {h.accion}
                    {h.user_name ? ` · ${h.user_name}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "comparar" && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Compara la evolución entre dos estados de cita guardados.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-slate-600">
              Estado A
              <select
                value={snapA}
                onChange={(e) => setSnapA(e.target.value ? Number(e.target.value) : "")}
                className="mt-1 block w-56 rounded border border-slate-300 px-2 py-1.5 text-sm"
              >
                <option value="">Seleccionar…</option>
                {snapshots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} — {formatDt(s.taken_at)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-600">
              Estado B
              <select
                value={snapB}
                onChange={(e) => setSnapB(e.target.value ? Number(e.target.value) : "")}
                className="mt-1 block w-56 rounded border border-slate-300 px-2 py-1.5 text-sm"
              >
                <option value="">Seleccionar…</option>
                {snapshots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} — {formatDt(s.taken_at)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!snapA || !snapB || snapA === snapB}
              onClick={async () => {
                if (!snapA || !snapB) return;
                const res = await compareSnapshots(Number(snapA), Number(snapB));
                setCompare(res);
              }}
              className="border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
            >
              Comparar
            </button>
            <button
              type="button"
              onClick={async () => {
                const snap = await saveSnapshot();
                await reloadSnapshots();
                alert(`Guardado: ${snap.label}`);
              }}
              className="border border-emerald-700 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900"
            >
              Guardar estado de cita
            </button>
          </div>
          {snapshots.length < 2 && (
            <p className="text-help text-amber-700">
              Necesitas al menos 2 estados guardados. Usa «Guardar estado de cita» en cada visita.
            </p>
          )}
          {compare && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-800">
                {compare.changed_count} pieza(s) con cambios entre «{compare.snapshot_a.label}» y
                «{compare.snapshot_b.label}»
              </p>
              <ul className="max-h-60 space-y-1 overflow-y-auto text-sm">
                {compare.diffs
                  .filter((d) => d.status !== "igual")
                  .map((d) => (
                    <li key={d.pieza_fdi} className="rounded border border-amber-200 bg-amber-50 px-2 py-1">
                      <span className="font-semibold tabular-nums">{d.pieza_fdi}</span>:{" "}
                      {d.status === "solo_a" && (
                        <>solo en A ({labelCond(d.estado_a)})</>
                      )}
                      {d.status === "solo_b" && (
                        <>solo en B ({labelCond(d.estado_b)})</>
                      )}
                      {d.status === "cambio" && (
                        <>
                          {labelCond(d.estado_a)} → {labelCond(d.estado_b)}
                        </>
                      )}
                    </li>
                  ))}
              </ul>
              <div className="overflow-x-auto border border-black bg-white py-1.5 opacity-95">
                <p className="px-2 pb-1 text-[11px] text-slate-500">
                  Odontograma actual (piezas cambiadas resaltadas en ámbar)
                </p>
                {renderNums(upperSeq, ur, upperGrid, changedPiezas)}
                {renderTeeth(upperSeq, "upper", ur, upperGrid, true)}
                {renderCrosses(upperSeq, ur, upperGrid, true)}
                <div className="mt-0.5">
                  {renderNums(upperSeq, ur, upperGrid, changedPiezas)}
                  {renderNums(lowerSeq, lr, lowerGrid, changedPiezas)}
                </div>
                {renderCrosses(lowerSeq, lr, lowerGrid, true)}
                {renderTeeth(lowerSeq, "lower", lr, lowerGrid, true)}
                {renderNums(lowerSeq, lr, lowerGrid, changedPiezas)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bottom sheet móvil */}
      {sheetOpen && selectedPieza && (
        <div className="fixed inset-0 z-40 sm:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Cerrar"
            onClick={() => setSheetOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[75vh] overflow-y-auto rounded-t-xl bg-white p-4 shadow-xl">
            <p className="text-base font-semibold">Pieza {selectedPieza}</p>
            <p className="text-sm text-slate-500">
              Actual: {labelCond(selectedEstado)} · Herramienta:{" "}
              {conditionById(tool)?.label}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                className="rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white"
                onClick={async () => {
                  const current = selectedEstado;
                  const surfaces = entries[selectedPieza]?.superficies || emptySurfaces();
                  const next = current === tool ? null : tool;
                  await persist(selectedPieza, next, surfaces);
                  maybePropose(selectedPieza, next, current);
                  setSheetOpen(false);
                }}
              >
                Aplicar {conditionById(tool)?.label || tool}
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-300 py-3 text-sm"
                onClick={async () => {
                  const surfaces = entries[selectedPieza]?.superficies || emptySurfaces();
                  await persist(selectedPieza, null, surfaces);
                  setSheetOpen(false);
                }}
              >
                Quitar marca
              </button>
            </div>
            <div className="mt-3">
              <p className="mb-1 text-xs font-medium text-slate-600">Superficies</p>
              <div className="flex justify-center py-2">
                <SurfaceCross
                  pieza={selectedPieza}
                  surfaces={entries[selectedPieza]?.superficies || emptySurfaces()}
                  circled={Object.values(
                    entries[selectedPieza]?.superficies || {}
                  ).some((v) => v === "obturacion")}
                  onSurfaceClick={(s, e) => void applySurface(selectedPieza, s, e)}
                />
              </div>
            </div>
            <button
              type="button"
              className="mt-2 w-full py-2 text-sm text-slate-500"
              onClick={() => setSheetOpen(false)}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      <ProposeTreatmentModal
        open={Boolean(propose)}
        pieza={propose?.pieza || ""}
        condicionId={propose?.condicion || ""}
        onClose={() => setPropose(null)}
        onConfirm={(item) => {
          onProposeTreatment?.(item);
        }}
      />
    </div>
  );
}
