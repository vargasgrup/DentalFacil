# Odontograma clínico con dientes realistas (PNG por FDI)

Guía de implementación reutilizable para proyectos similares (**DentalSimple / M&D Odontología**, **N&K DentalSoft**, etc.).

**Estado actual (producción):** layout clínico clásico + sprites PNG numerados por pieza FDI.  
**Referencia visual:** `docs/Odontograma.jpg` y `frontend/public/odontogram/Odontograma-referencia.jpg`.  
**Entrada UI:** `frontend/src/components/Odontograma.tsx` → `OdontogramaAnatomico`.

> Nota: existe un experimento Konva en `odontogram/realista/` (`docs/ODONTOGRAMA_REALISTA.md`). **No es el odontograma activo.** Esta guía documenta el sistema que sí está en uso.

---

## 1. Objetivo del diseño

Replicar un odontograma clínico estándar:

| Elemento | Descripción |
|----------|-------------|
| Grilla de condiciones | ~34 condiciones en tabla 6×6 (borde negro) |
| Dentición | Botones visibles **Adulto \| Niño \| Mixto** |
| Arcada superior | FDI `18…11 \| 21…28`, raíces hacia **arriba** |
| Cruces MDVLO | 5 casillas por pieza (Mesial, Distal, Vestibular, Lingual, Oclusal) |
| Arcada inferior | FDI `48…41 \| 31…38`, raíces hacia **abajo** |
| Dientes | PNG semi-realistas (corona + raíz), uno por número FDI |
| Marcas | Relleno / símbolos (X, diagonal, líneas) sobre el PNG |
| Persistencia | API REST por paciente + historial + snapshots |

---

## 2. Arquitectura (capas)

```
┌─────────────────────────────────────────────────────────┐
│  Ficha clínica  (pacientes/[id]/page.tsx)               │
│    └─ <Odontograma patientId onProposeTreatment />      │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│  Odontograma.tsx  (drop-in / punto de entrada)          │
│    └─ OdontogramaAnatomico.tsx                          │
│         ├─ Grilla condiciones + Adulto/Niño/Mixto       │
│         ├─ ToothSVG  ← PNG /dientes/{fdi}.png           │
│         ├─ SurfaceCross (MDVLO)                         │
│         ├─ ToothAttachments (Rx / foto + visualizador)  │
│         ├─ ProposeTreatmentModal → plan de tratamiento  │
│         └─ useOdontogramPatient (API)                   │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│  Backend FastAPI                                         │
│    /api/odontogram/{patientId}                          │
│    /api/odontogram/.../history|snapshots|compare        │
│    /api/tooth-media/{patientId}  (+ /file/{id})         │
└─────────────────────────────────────────────────────────┘
```

### Principio clave: separar contrato de presentación

| Conservar siempre | Se puede cambiar sin tocar API |
|-------------------|--------------------------------|
| Endpoints y modelo de datos | Render del diente (SVG vs PNG vs Konva) |
| Catálogo de condiciones (`id`, color, símbolo) | Layout visual (grilla, botones) |
| Superficies `M/D/V/L/O` | Zoom, paneo, estilos CSS |
| Props `{ patientId, onProposeTreatment? }` | Assets en `/public/dientes/` |

Así puedes portar el odontograma a **N&K DentalSoft** cambiando solo branding/UI, reutilizando el mismo contrato de datos.

---

## 3. Estructura de archivos (frontend)

```
frontend/
├── public/
│   ├── dientes/
│   │   ├── 11.png … 18.png
│   │   ├── 21.png … 28.png
│   │   ├── 31.png … 38.png
│   │   └── 41.png … 48.png          ← 32 PNG permanentes (obligatorio)
│   └── odontogram/
│       └── Odontograma-referencia.jpg
├── src/
│   ├── components/
│   │   ├── Odontograma.tsx                    ← entrada drop-in
│   │   └── odontogram/
│   │       ├── OdontogramaAnatomico.tsx       ← layout clínico
│   │       ├── ToothSVG.tsx                   ← PNG + overlay de marcas
│   │       ├── SurfaceCross.tsx               ← cruces MDVLO
│   │       ├── toothAssetsReferencia.ts       ← URL / mapeo FDI
│   │       ├── toothAnatomy.ts                ← paths SVG fallback
│   │       ├── ToothAttachments.tsx           ← media + modal Ver imagen
│   │       ├── ProposeTreatmentModal.tsx
│   │       ├── useOdontogramPatient.ts        ← hook API
│   │       └── realista/                      ← legado Konva (no activo)
│   └── lib/
│       ├── odontogramConditions.ts            ← catálogo + arcadas
│       ├── odontogramNumbering.ts             ← FDI / Universal
│       └── odontogramTreatments.ts            ← bridge al plan
```

---

## 4. Procedimiento: preparar imágenes de dientes

### 4.1 Requisitos de cada PNG

| Regla | Detalle |
|-------|---------|
| Nombre | Solo el número FDI: `38.png`, `16.png`, … |
| Formato | PNG con transparencia (RGBA) |
| Contenido | Un solo diente: corona + raíz(es) |
| Marcas clínicas | **Ninguna** en el asset base (sin X, caries, colores de demo) |
| Orientación superior (`11–28`) | Raíces **arriba**, corona **abajo** |
| Orientación inferior (`31–48`) | Raíces **abajo**, corona **arriba** |
| Fondo | Transparente (evitar negro opaco) |
| Resolución | Preferible alto (p. ej. 500–700 × 1500–1800); el UI escala a ~42×90 px |

### 4.2 Ubicación en el proyecto

```
{proyecto}/frontend/public/dientes/{fdi}.png
```

Ejemplo absoluto en este repo:

```
c:\PROYECTOS\DentalSimple\frontend\public\dientes\18.png
```

El navegador los sirve como:

```
https://{host}/dientes/18.png
```

### 4.3 Checklist de los 32 permanentes

```
18 17 16 15 14 13 12 11 | 21 22 23 24 25 26 27 28
48 47 46 45 44 43 42 41 | 31 32 33 34 35 36 37 38
```

Archivos: `11.png` … `48.png` (sin `19`, `29`, etc.).

### 4.4 Dentición temporal (Niño) sin PNG propios

No hace falta extraer `51.png`…`85.png` si no existen. El código mapea al permanente homólogo:

| Temporal | Permanente usado |
|----------|------------------|
| `51–55` | `11–15` |
| `61–65` | `21–25` |
| `71–75` | `31–35` |
| `81–85` | `41–45` |

Implementación: `permanentAssetPieza()` en `toothAssetsReferencia.ts`  
(`5→1`, `6→2`, `7→3`, `8→4`).

### 4.5 Extracción desde una imagen de referencia (opcional)

Si partes de un odontograma JPG completo:

1. Copia la referencia a `docs/Odontograma.jpg`.
2. Recorta **pieza a pieza** (Photopea / GIMP / Photoshop).
3. Exporta PNG transparente nombrado por FDI.
4. (Opcional) Script de apoyo en este repo: `scripts/extract_teeth_from_reference.py` — solo si las coordenadas están calibradas; **preferible recorte manual** por calidad.

---

## 5. Procedimiento: integrar el render del diente

### 5.1 Resolver URL del asset

```ts
// toothAssetsReferencia.ts
toothPieceUrl("38")        // → "/dientes/38.png"
toothPieceUrl("85")        // → "/dientes/45.png"  (homólogo)
hasToothPieceAsset("16")   // → true
```

### 5.2 Componente `ToothSVG`

Responsabilidades:

1. Mostrar `<img src={/dientes/{fdi}.png}>` **sin voltear** (la orientación ya viene en el PNG).
2. Si no hay asset o falla la carga → fallback SVG anatómico (`toothAnatomy.ts`).
3. Si hay condición clínica → capa SVG encima:
   - Relleno de corona (clip path)
   - Símbolos: `x` (ausente), `diagonal` (extraer), `lines` (fractura)
   - Bandas verticales (corona / prótesis fija)
4. En arcada inferior, **solo el overlay SVG** se espeja (`scaleY(-1)`), no la imagen.

### 5.3 No hacer

- No embebir marcas de una imagen demo dentro del PNG base.
- No aplicar `scaleY(-1)` a la imagen si el usuario ya orientó superior/inferior.
- No pintar relleno blanco opaco sobre el PNG cuando la pieza está sana (tapa el detalle realista).

---

## 6. Procedimiento: layout clínico (`OdontogramaAnatomico`)

### 6.1 Orden visual (arcada adulta)

```
[ Números superiores 18–28 ]
[ Dientes superiores PNG ]
[ Cruces MDVLO ]
[ Números (repaso) ]
[ Cruces MDVLO inferiores ]
[ Dientes inferiores PNG ]
[ Números inferiores 48–38 ]
```

### 6.2 Botones de dentición (obligatorios visibles)

```
[ Adulto ] [ Niño ] [ Mixto ]   +  FDI/Universal  +  Limpiar  +  Guardar estado de cita
```

| Modo | Arcadas mostradas |
|------|-------------------|
| `permanente` (Adulto) | `PERMANENT` 32 piezas |
| `temporal` (Niño) | `TEMPORAL` 20 piezas (`51–85`) |
| `mixta` (Mixto) | Permanentes + filas de numeración temporal auxiliares |

Definición de secuencias: `lib/odontogramConditions.ts` → `PERMANENT` / `TEMPORAL`.

### 6.3 Grilla de condiciones

Fuente: `ODONTOGRAM_CONDITIONS` (ids estables: `caries`, `corona`, `ausente`, …).  
Click en celda → `tool` activo → click en diente o casilla MDVLO aplica la condición.

Colores / símbolos: `conditionFillColor()`, `condition.symbol`.

### 6.4 Superficies MDVLO

`SurfaceCross.tsx` — cinco botones por pieza.  
Persistencia en `superficies: { M, D, V, L, O }`.

---

## 7. Contrato API (backend) — portar tal cual

### 7.1 Odontograma

| Método | Ruta | Uso |
|--------|------|-----|
| GET | `/api/odontogram/{patientId}?denticion=` | Cargar marcas |
| PUT | `/api/odontogram/{patientId}/{pieza}` | Guardar estado + superficies + notas |
| DELETE | `/api/odontogram/{patientId}?denticion=` | Limpiar dentición |
| GET | `/api/odontogram/{patientId}/history` | Historial de cambios |
| GET/POST | `/api/odontogram/{patientId}/snapshots` | Estado de cita |
| GET | `/api/odontogram/{patientId}/compare?a=&b=` | Diff entre snapshots |

Payload típico por pieza:

```json
{
  "pieza_fdi": "16",
  "estado": "caries",
  "denticion": "permanente",
  "superficies": { "M": null, "D": "caries", "V": null, "L": null, "O": null },
  "notas": "Observación clínica"
}
```

Hook frontend: `useOdontogramPatient.ts`.

### 7.2 Media por pieza (Rx / foto)

| Método | Ruta | Uso |
|--------|------|-----|
| GET | `/api/tooth-media/{patientId}?pieza_fdi=` | Listar |
| POST | `/api/tooth-media/{patientId}` | Multipart upload |
| GET | `/api/tooth-media/file/{id}` | Binario (requiere Bearer) |
| DELETE | `/api/tooth-media/{id}` | Eliminar |

**Visualizador:** no usar `<img src={url}>` directo si el archivo exige JWT.  
Patrón correcto (`ToothAttachments.tsx`):

1. `fetch(url, { headers: { Authorization: Bearer … } })`
2. `URL.createObjectURL(blob)`
3. Modal a pantalla completa (**Ver imagen**)
4. `revokeObjectURL` al cerrar

---

## 8. Integración en ficha clínica

```tsx
// pacientes/[id]/page.tsx (o equivalente en N&K DentalSoft)
<Section title="Odontograma" noSave>
  <Odontograma
    patientId={patientId}
    onProposeTreatment={addPlanFromOdontogram}
  />
</Section>
```

Al marcar una condición, `ProposeTreatmentModal` puede empujar ítems al plan con `origen: "odontogram"`.

---

## 9. Checklist para portar a N&K DentalSoft (u otro proyecto)

### Backend
- [ ] Tablas: odontograma por pieza, changelog, snapshots, `tooth_media`
- [ ] Rutas listadas en §7
- [ ] Auth JWT en listado, PUT, upload y **file**
- [ ] Storage de media en disco/volumen persistente (`TOOTH_MEDIA_ROOT`)

### Frontend
- [ ] Copiar carpeta `odontogram/` + libs `odontogram*.ts`
- [ ] Punto de entrada drop-in `Odontograma.tsx`
- [ ] Colocar 32 PNG en `public/dientes/{fdi}.png`
- [ ] Verificar orientación superior/inferior
- [ ] Botones **Adulto / Niño / Mixto** visibles
- [ ] Proxy API same-origin (evitar CORS) o `NEXT_PUBLIC_API_URL` coherente
- [ ] Modal **Ver imagen** con fetch autenticado
- [ ] Branding: colores de botones activos (este proyecto usa `#b8e0c8`)

### QA clínico
- [ ] Marcar condición en corona (Adulto)
- [ ] Marcar superficie en cruz MDVLO
- [ ] Cambiar a Niño: numeración temporal + mismos sprites
- [ ] Mixto: permanentes + números temporales
- [ ] Limpiar dentición
- [ ] Guardar snapshot / historial
- [ ] Subir Rx y abrir **Ver imagen**
- [ ] Proponer tratamiento → aparece en plan

---

## 10. Decisiones de diseño (resumen)

| Decisión | Motivo |
|----------|--------|
| PNG por FDI, no por “tipo” | Anatomía correcta por pieza (molares distintos, etc.) |
| Homólogo temporal → permanente | Evita 20 assets extra hasta tener temporales reales |
| Layout HTML/CSS + SVG overlay | Más simple de mantener que Konva para este estilo clínico |
| Overlay solo con condición | El PNG sano se ve realista, sin “lavado” blanco |
| Visualizador con blob + Bearer | El endpoint `/file/{id}` está protegido |

---

## 11. Referencias en este repositorio

| Recurso | Ruta |
|---------|------|
| Imagen de referencia clínica | `docs/Odontograma.jpg` |
| Spec de catálogo / réplica | `docs/ODONTOGRAMA_SPEC.md` |
| Experimento Konva (legado) | `docs/ODONTOGRAMA_REALISTA.md` |
| Script extracción (opcional) | `scripts/extract_teeth_from_reference.py` |
| Assets producción | `frontend/public/dientes/*.png` |

---

## 12. Historial breve de commits relevantes

| Tema | Idea del commit |
|------|-----------------|
| Layout clínico | Restaurar `OdontogramaAnatomico` según JPG M&D |
| Assets | Integrar `/dientes/{n}.png` por FDI |
| Dentición | Botones visibles Adulto / Niño / Mixto + mapeo temporal |
| Media | Modal **Ver imagen** con blob autenticado |

---

*Documento orientado a reutilización en productos dentales del mismo stack (Next.js + FastAPI) o equivalentes. Al portar a N&K DentalSoft, conservar el contrato API y la convención de nombres de PNG; adaptar solo tokens visuales del design system.*
