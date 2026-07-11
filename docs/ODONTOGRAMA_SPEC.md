# Odontograma — Corrección réplica literal

**Referencia:** `docs/Odontograma.jpg`  
**Prompt:** `PROMPT_CORRECCION_ODONTOGRAMA_REPLICA_LITERAL.md`

## Verificación previa

1. Imagen abierta y revisada en `docs/Odontograma.jpg`.
2. Discrepancias confirmadas: catálogo inventado, dientes sin relleno, SVG genérico, marcas de ejemplo ausentes, cruz sin color.

## Fase 0 — Catálogo literal (34)

| Col1 | Col2 | Col3 | Col4 | Col5 | Col6 |
|------|------|------|------|------|------|
| Caries | Corona | Corona (Temp.) | Ausente | Fractura | Diastema |
| Obturación | Prótesis Remov. | Desplazamiento | Rotación | Fusión | Remanente Rad |
| Erupción | Transposición | Supernumerario | Pulpa | Prótesis | Perno |
| Ortodoncia Fija | Prótesis Fija | Implante | Macrodoncia | Microdoncia | Discromia |
| Desgaste | Impactado/P | Intrusión | Edentulismo | Ectópico | Impactado |
| Ortod. Remov | Extrusión | Poste | Extraer | *(vacío)* | *(vacío)* |

**Acciones (no condiciones):** Adulto, Limpiar — recuadros con borde.

### Marcas de ejemplo (referencia)

| Pieza | Efecto | Condición / símbolo |
|-------|--------|---------------------|
| 18–16 | Corona celeste | Caries `#7dd3fc` |
| 15–25 (salvo 24) | Lavanda | Prótesis Fija `#a78bfa` |
| 14 | + rojos en cruz | superficies D/L/O = Caries |
| 12 | círculo azul en cruz | Obturación en O + círculo |
| 11 | diagonal roja | Extraer |
| 24 | X azul | Ausente |
| 26–28 | verde-teal | Erupción `#86efac` |
| 45–35 | rosado | Discromia `#e9d5ff` / rosado |
| 36 | doble línea | Fractura |

### Datos previos (decisión)

Marcas del catálogo inventado (Sellante, Pulpotomía, etc.) en pacientes de prueba: **se descartan / se normalizan** vía `LEGACY_ESTADO_MAP` solo para ids conocidos (caries, obturación, ausente, corona, extraer, pulpa←endodoncia). El resto queda sin marca al normalizar. No hay migración silenciosa de nombres inventados.

## Símbolos ↔ condiciones

| Símbolo | Condición |
|---------|-----------|
| X azul | Ausente, Edentulismo |
| Diagonal roja | Extraer |
| Doble línea horizontal | Fractura |
| Círculo azul en cruz | Obturación en cualquier superficie |

## Colores de ejemplo (imagen)

- Celeste corona: `#8ec5d9` (Caries)
- Lavanda: `#c5b3de` (Prótesis Fija / Corona) — bandas verticales en corona
- Verde: `#8fd4a0` (Erupción)
- Rosado: `#f2b4c4` (Discromia)
- Rojo superficies: `#e03131`
- Selección leyenda / Adulto: `#b8e0c8`
- Símbolos X / círculo / líneas: `#1e3a8a`

## Ajuste fino (PROMPT_AJUSTE_FINO)

### 1. Panel único
**Discrepancia encontrada:** dos tarjetas separadas (maxilar / mandíbula).  
**Corregido:** un solo contenedor continuo:
números top → dientes ↑ → cruces ↑ → franja doble (18–28 / 48–38 pegadas) → cruces ↓ → dientes ↓ → números pie.

### 2. Colores pieza a pieza (referencia vs demo)

| Pieza | Referencia | Implementación (demo) | ¿Coincide? |
|-------|------------|----------------------|------------|
| 18–16 | Celeste | Caries `#7dd3fc` | Sí |
| 15–13, 12, 21–23, 25 | Lavanda | Prótesis Fija `#a78bfa` | Sí |
| 11 | Sin relleno + diagonal roja | Extraer (fill blanco + diagonal) | Sí |
| 14 | Lavanda + M/D/O rojos | Prótesis Fija + superficies caries | Sí |
| 12 | Lavanda + círculo cruz | Prótesis Fija + O obturación + círculo | Sí |
| 24 | Sin relleno + X azul | Ausente (fill blanco + X) | Sí |
| 26–28 | Verde-teal (desde 26) | Erupción `#86efac` | Sí |
| 48–44 | Lavanda | Prótesis Fija | Sí |
| 43–35 | Rosado | Discromia `#f9a8d4` | Sí |
| 36 | Sin relleno + doble línea | Fractura (fill blanco + lines) | Sí |
| 37–38 | Sin marca | — | Sí |

### 3. Franja doble intermedia
Orden confirmado: fila superior 18…11 / 21…28 **inmediatamente encima** de 48…41 / 31…38, sin espacio grande.

## Vista 3D

**Retirada.** El prototipo con geometrías abstractas (R3F) resultó confuso en uso clínico. El odontograma queda solo en **vista 2D** (fuente de verdad). Ver nota en `docs/ODONTOGRAMA_3D.md`.

## Cumplimiento producto M&D (2026-07-11)

1. **Registro visual:** Adulto/Niño/Mixta, FDI/Universal, colores, superficies, panel + notas.
2. **Historial:** `odontogram_change_log`; pestaña Historial.
3. **Comparar citas:** snapshots + Comparar + «Guardar estado de cita».
4. **Plan/presupuesto:** modal; alternativas A/B/C; PDF presupuesto; columna Pieza.
5. **Móvil:** arcada, chips, bottom sheet.
6. **Periodontograma:** movilidad, recesión, sondaje, sangrado/placa.
7. **Dictado de voz:** notas de pieza y evolución.
8. **Imágenes por pieza:** Rx / foto / panorámica.
9. **Trazabilidad:** `clinical_audit_log` + panel en ficha.
10. **Consentimiento:** vinculado al plan activo en PDF.

