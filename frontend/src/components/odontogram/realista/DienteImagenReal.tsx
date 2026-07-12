"use client";

import { useEffect, useState } from "react";
import { Group, Image as KonvaImage, Path, Rect, Text } from "react-konva";
import useImage from "use-image";
import { conditionById, type SurfaceKey } from "@/lib/odontogramConditions";
import { cargarImagenDiente, type VistaDiente } from "./cargadorImagenes";
import { colorOverlay, NOMBRE_DIENTE } from "./mapeoDientesRealista";
import { zonasParaPieza, type ZonaId } from "./zonasTratamientoRealista";

export interface DienteImagenRealProps {
  pieza: string;
  x: number;
  y: number;
  width: number;
  height: number;
  vista: VistaDiente;
  selected?: boolean;
  estadoGeneral?: string | null;
  superficies?: Partial<Record<SurfaceKey, string | null>>;
  onSelect: (pieza: string) => void;
  onZonaClick: (pieza: string, zonaId: ZonaId, surface: SurfaceKey | null) => void;
}

export function DienteImagenReal({
  pieza,
  x,
  y,
  width,
  height,
  vista,
  selected,
  estadoGeneral,
  superficies = {},
  onSelect,
  onZonaClick,
}: DienteImagenRealProps) {
  const [src, setSrc] = useState<string>("");
  const [image] = useImage(src, "anonymous");

  useEffect(() => {
    let alive = true;
    void cargarImagenDiente(pieza, vista).then((url) => {
      if (alive) setSrc(url);
    });
    return () => {
      alive = false;
    };
  }, [pieza, vista]);

  const zonas = zonasParaPieza(pieza, vista);
  const ausente = estadoGeneral === "ausente" || estadoGeneral === "edentulismo";
  const nombre = NOMBRE_DIENTE[pieza] || `Pieza ${pieza}`;

  return (
    <Group
      x={x}
      y={y}
      onClick={() => onSelect(pieza)}
      onTap={() => onSelect(pieza)}
    >
      {/* Hit area */}
      <Rect width={width} height={height} fill="transparent" />

      {image && (
        <KonvaImage
          image={image}
          width={width}
          height={height * 0.88}
          y={0}
          opacity={ausente ? 0.25 : 1}
          listening={false}
        />
      )}

      {/* Overlay de estado general (corona) */}
      {estadoGeneral && !ausente && (
        <Rect
          x={width * 0.12}
          y={height * 0.02}
          width={width * 0.76}
          height={height * 0.42}
          fill={colorOverlay(estadoGeneral)}
          cornerRadius={6}
          listening={false}
        />
      )}

      {/* Zonas cliqueables — coordenadas 0–100 escaladas con Group */}
      <Group x={0} y={0} scaleX={width / 100} scaleY={(height * 0.88) / 100}>
        {zonas.map((z) => {
          const fill =
            z.surface && superficies[z.surface]
              ? colorOverlay(superficies[z.surface])
              : "rgba(0,0,0,0)";
          return (
            <Path
              key={z.id}
              data={z.path}
              fill={fill === "transparent" ? "rgba(255,255,255,0.01)" : fill}
              stroke={selected ? "rgba(28,102,232,0.55)" : "rgba(15,23,42,0.08)"}
              strokeWidth={selected ? 1.2 : 0.4}
              onClick={(e) => {
                e.cancelBubble = true;
                onSelect(pieza);
                onZonaClick(pieza, z.id, z.surface);
              }}
              onTap={(e) => {
                e.cancelBubble = true;
                onSelect(pieza);
                onZonaClick(pieza, z.id, z.surface);
              }}
              onMouseEnter={(e) => {
                const stage = e.target.getStage();
                if (stage) stage.container().style.cursor = "pointer";
              }}
              onMouseLeave={(e) => {
                const stage = e.target.getStage();
                if (stage) stage.container().style.cursor = "default";
              }}
            />
          );
        })}
      </Group>

      {ausente && (
        <>
          <Path
            data={`M ${width * 0.2} ${height * 0.15} L ${width * 0.8} ${height * 0.7}`}
            stroke="#94a3b8"
            strokeWidth={3}
            listening={false}
          />
          <Path
            data={`M ${width * 0.8} ${height * 0.15} L ${width * 0.2} ${height * 0.7}`}
            stroke="#94a3b8"
            strokeWidth={3}
            listening={false}
          />
        </>
      )}

      {selected && (
        <Rect
          width={width}
          height={height * 0.88}
          stroke="#1c66e8"
          strokeWidth={2.5}
          cornerRadius={8}
          shadowColor="#1c66e8"
          shadowBlur={12}
          shadowOpacity={0.45}
          listening={false}
        />
      )}

      <Text
        text={pieza}
        width={width}
        y={height * 0.9}
        align="center"
        fontSize={11}
        fontStyle="bold"
        fill={selected ? "#1c66e8" : "#334155"}
        listening={false}
      />

      {/* Tooltip via title on container is HTML; Konva uses label on hover optionally */}
      <Rect
        width={width}
        height={height}
        fill="transparent"
        listening={false}
        name={nombre}
      />
    </Group>
  );
}

export function etiquetaCondicion(id: string | null | undefined) {
  if (!id) return "Sano";
  return conditionById(id)?.label || id;
}
