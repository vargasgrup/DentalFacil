> ⚠️ **Documento obsoleto** — ver `docs/DOCUMENTO_MAESTRO_DENTALSIMPLE_v1_2026-07-23.md` como fuente única de verdad.

# Odontograma 3D — historial

**Prompt:** `PROMPT_ODONTOGRAMA_3D.md`  
**Estado:** **retirado** (2026-07-11)

## Por qué se retiró

El prototipo con `@react-three/fiber` usaba geometrías genéricas (cajas/conos), no siluetas dentales reconocibles. En uso clínico resultó confuso frente al odontograma 2D anatómico ya validado.

## Decisión de Fase 0 (histórica)

Se descartó `react-odontogram-3d` (catálogo fijo, adopción nula) y se probó R3F propio. Esa prueba **no pasó a producción**.

## Estado actual

- Solo vista **2D** en Ficha Clínica.
- Sin dependencias `three` / `@react-three/*`.
- Datos y catálogo de 34 condiciones sin cambios.
