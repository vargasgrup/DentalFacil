# Odontograma realista (Konva)

## FASE 1 — Análisis (qué se tocó)

### Conservado (contrato obligatorio)
| Pieza | Rol |
|---|---|
| `useOdontogramPatient.ts` | GET/PUT/DELETE `/api/odontogram`, superficies MDVLO |
| `odontogramConditions.ts` | Catálogo de condiciones / colores |
| `ProposeTreatmentModal` + plan `origen: "odontogram"` | Vínculo a plan de tratamiento |
| `ToothAttachments` | Media por pieza |
| Props de `Odontograma` | `{ patientId, onProposeTreatment? }` |

### Reemplazado (solo presentación)
| Antes | Ahora |
|---|---|
| `OdontogramaAnatomico` + `ToothSVG` (SVG geométrico) | `OdontogramaRealista` + `DienteImagenReal` (Konva + PNG/SVG) |

El componente anatómico **sigue en el repo** por si se necesita volver a activarlo.

### Archivos nuevos
```
frontend/src/components/odontogram/realista/
  OdontogramaRealista.tsx
  DienteImagenReal.tsx
  PanelTratamientoRealista.tsx
  OdontogramaRealista.css
  mapeoDientesRealista.ts
  zonasTratamientoRealista.ts
  useOdontogramaRealista.ts
  cargadorImagenes.ts
frontend/public/dientes/   ← PNG Servier aquí
```

Dependencias: `konva@9`, `react-konva@18`, `use-image@1` (compatibles con React 18).

---

## FASE 2 — Cómo obtener imágenes (Servier Medical Art)

Licencia: **CC BY 3.0 / CC BY 4.0** (atribuir a Servier Medical Art).

### Pasos
1. Abre [https://smart.servier.com](https://smart.servier.com)
2. Crea cuenta gratuita (si pide login).
3. Busca: `tooth`, `molar`, `incisor`, `dental anatomy`, `teeth`.
4. Descarga el pack / ilustraciones individuales en **PNG** o **SVG**.
5. En un editor (Photoshop, GIMP, Photopea, Affinity):
   - Recorta **un diente por archivo** (corona + raíces).
   - Elimina el fondo → transparencia.
   - Exporta **512×512** o **1024×1024** PNG.
6. Guarda en `frontend/public/dientes/` con nombres:
   - `11_vestibular.png` … `48_vestibular.png`
   - Opcional: `##_lingual.png`, `##_oclusal.png` (posteriores)
7. Atribución (Configuración / pie de documentos clínicos):
   > Ilustraciones dentales adaptadas de Servier Medical Art (CC-BY).

### Alternativas si Servier no está disponible
- [Wikimedia Commons — Tooth](https://commons.wikimedia.org/wiki/Category:Teeth) (revisar licencia por archivo)
- Modelos 3D gratuitos (Sketchfab / NIH 3D) → Blender → render PNG transparente por pieza
- Mientras no haya PNG, el sistema usa **SVG procedural anatómico** (corona + raíces + furca)

### Checklist mínimo para producción
- [ ] 32 permanentes vestibular (`11`–`18`, `21`–`28`, `31`–`38`, `41`–`48`)
- [ ] Opcional temporales `51`–`85`
- [ ] `16/26/36/46` también oclusal
- [ ] `default.png` genérico

---

## FASE 3–4 — Comportamiento

- Clic en zona (V/M/D/O/L) → marca superficie con la herramienta activa (PUT API)
- Clic en raíz/furca → marca **estado general** del diente
- Doble clic → cicla vista vestibular → lingual → oclusal
- Zoom (rueda) + paneo (arrastrar stage)
- Panel lateral: herramienta, vista, ausente/sano/limpiar, notas, proponer al plan
- Historial / comparar / adjuntos se mantienen

---

## FASE 5 — Casos de prueba

1. Abrir ficha → Odontograma carga sin error (fallback SVG si no hay PNG).
2. Marcar caries en oclusal de 36 → recargar → persiste.
3. Marcar ausente en 18 → aparece “X” y baja opacidad.
4. Proponer tratamiento → aparece ítem en plan con `pieza_fdi`.
5. Zoom + paneo en tablet; `prefers-reduced-motion` no rompe interacción.
6. Colocar `36_vestibular.png` en `/public/dientes/` → hard refresh → se ve el PNG.

### Volver al odontograma SVG clásico
En `Odontograma.tsx`, importar `OdontogramaAnatomico` en lugar de `OdontogramaRealista`.
