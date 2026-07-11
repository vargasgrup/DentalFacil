# Especificación — Grilla de Agenda (Fase 0)

## Parámetros base

| Parámetro | Valor | Notas |
|---|---|---|
| Horario por defecto | **08:00 – 20:00** | Definido en Configuración; la grilla **nunca** se expande fuera de este rango |
| Zona horaria | **America/Lima** | Las citas se validan contra el reloj local del centro |
| Slot base | **30 minutos** | Snap al crear desde la grilla |
| Altura de 1 hora | **72 px** | Cita de 30 min ≈ 36 px; 60 min ≈ 72 px |
| Dependencias | **Ninguna** | CSS Grid + `position: absolute` + Tailwind |

## Doctores

- Vista Día: **1 columna** si hay ≤1 doctor activo; **N columnas** (una por doctor) si hay 2+.
- Vista Semana: citas mezcladas por día (etiqueta de doctor en el bloque si hay varios). Prioriza legibilidad.

## Estructura visual (Vista Día)

```
┌────────┬─────────────────────────────┐
│ 08:00  │                             │
│        │  ┌──────────────┐           │
│ 08:30  │  │ Paciente A   │ ← bloque  │
│        │  │ 30 min       │   abs pos │
│ 09:00  │  └──────────────┘           │
│   ─ ─ ─│─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ← ahora │
│ 09:30  │                             │
│   …    │  clic vacío → nueva cita    │
│ 20:00  │                             │
└────────┴─────────────────────────────┘
```

## Colores por estado

| Estado | Estilo |
|---|---|
| `programada` | `bg-info-50 border-info-300 text-info-800` |
| `completada` | `bg-success-50 border-success-300 text-success-800` |
| `cancelada` | `bg-danger-50 border-danger-200 text-danger-600 opacity-60` |

## Solapes

Dentro de la misma columna (mismo doctor), citas solapadas se reparten el ancho (`left` / `width` %).

## Móvil

En `< md` (768px): **Lista por defecto**; toggle Grilla disponible. En desktop: **Grilla por defecto**.
