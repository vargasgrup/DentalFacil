> ⚠️ **Documento obsoleto** — ver `docs/DOCUMENTO_MAESTRO_DENTALSIMPLE_v1_2026-07-23.md` como fuente única de verdad.

# RESUMEN EJECUTIVO GENERAL — Agenda grilla de calendario

## Decisión de dependencias

**Grilla construida a mano** con CSS Grid / posicionamiento absoluto + Tailwind. Sin FullCalendar ni react-big-calendar.

## Comportamiento móvil

En anchos `< 768px` la vista por defecto es **Lista**. El toggle Grilla/Lista sigue disponible; si se elige grilla, se muestra aviso de scroll.

## Qué se entregó

| Fase | Resultado |
|---|---|
| 0 | Spec en `docs/AGENDA_GRILLA_SPEC.md` — 08:00–20:00, slots 30 min, 72px/hora |
| 1 | Vista Día con eje de horas, bloques por duración, colores por estado, línea “ahora” |
| 2 | Clic en vacío → formulario con fecha/hora (snap 30 min) y doctor si multi-columna |
| 3 | Clic en bloque → panel detalle (Ficha / Cancelar) |
| 4 | Vista Semana (lun–dom) con mismas interacciones |
| 5 | Solapes lado a lado (`layoutOverlaps`) |
| 6 | `clinic_settings` + `GET/PATCH /api/config/hours` + UI en Configuración |
| 7 | Toggle Grilla/Lista; lista intacta |
| 8 | Checklist abajo |

## Checklist de no-regresión

- [x] Crear cita desde grilla (día)
- [x] Crear cita desde grilla (semana)
- [x] Ver detalle / cancelar desde bloque
- [x] Abrir ficha clínica desde bloque
- [x] Detección de solape backend intacta (409)
- [x] Vista lista como alternativa
- [x] Recordatorios (scheduler) no afectados
- [x] Dashboard / Pacientes / Caja / Reportes / Config sin cambios de lógica
- [x] Horario de atención configurable y expandible si hay citas fuera de rango
