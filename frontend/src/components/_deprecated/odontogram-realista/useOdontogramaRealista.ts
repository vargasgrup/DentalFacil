"use client";

import { useCallback, useState } from "react";
import type { VistaDiente } from "./cargadorImagenes";
import { useOdontogramPatient } from "../useOdontogramPatient";

/**
 * Extiende el hook de paciente con estado de UI del odontograma realista (vista, zoom).
 */
export function useOdontogramaRealista(patientId: string) {
  const api = useOdontogramPatient(patientId);
  const [selectedPieza, setSelectedPieza] = useState<string | null>(null);
  const [vistaPorPieza, setVistaPorPieza] = useState<Record<string, VistaDiente>>({});
  const [vistaGlobal, setVistaGlobal] = useState<VistaDiente>("vestibular");
  const [scale, setScale] = useState(1);

  const vistaDe = useCallback(
    (pieza: string): VistaDiente => vistaPorPieza[pieza] || vistaGlobal,
    [vistaPorPieza, vistaGlobal]
  );

  const setVistaPieza = useCallback((pieza: string, vista: VistaDiente) => {
    setVistaPorPieza((prev) => ({ ...prev, [pieza]: vista }));
  }, []);

  const cycleVista = useCallback(
    (pieza: string) => {
      const order: VistaDiente[] = ["vestibular", "lingual", "oclusal"];
      const cur = vistaDe(pieza);
      const next = order[(order.indexOf(cur) + 1) % order.length];
      setVistaPieza(pieza, next);
    },
    [setVistaPieza, vistaDe]
  );

  return {
    ...api,
    selectedPieza,
    setSelectedPieza,
    vistaGlobal,
    setVistaGlobal,
    vistaDe,
    setVistaPieza,
    cycleVista,
    scale,
    setScale,
  };
}

export type OdontogramaRealistaApi = ReturnType<typeof useOdontogramaRealista>;
