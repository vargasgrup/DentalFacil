# Odontograma realista (Konva) — LEGADO

> **Estado:** experimento / no activo en producción.  
> **Implementación actual:** ver **[`ODONTOGRAMA_CLINICO_REALISTA.md`](./ODONTOGRAMA_CLINICO_REALISTA.md)**  
> (layout clínico + PNG por FDI en `public/dientes/{n}.png`, entrada `OdontogramaAnatomico`).

El punto de entrada `frontend/src/components/Odontograma.tsx` renderiza `OdontogramaAnatomico`, no el canvas Konva.

El código en `frontend/src/components/odontogram/realista/` se conserva por referencia histórica.

---

## Qué era este experimento

Canvas Konva con zoom/paneo, zonas clicables (V/M/D/O/L, raíces) y panel lateral. Assets previstos como `##_vestibular.png` estilo Servier, con fallback SVG procedural.

### Conservado (sigue vigente en el odontograma actual)
| Pieza | Rol |
|---|---|
| `useOdontogramPatient.ts` | GET/PUT/DELETE `/api/odontogram`, superficies MDVLO |
| `odontogramConditions.ts` | Catálogo de condiciones / colores |
| `ProposeTreatmentModal` + plan `origen: "odontogram"` | Vínculo a plan de tratamiento |
| `ToothAttachments` | Media por pieza (+ visualizador) |
| Props de `Odontograma` | `{ patientId, onProposeTreatment? }` |

### Archivos del experimento Konva
```
frontend/src/components/odontogram/realista/
  OdontogramaRealista.tsx
  DienteImagenReal.tsx
  PanelTratamientoRealista.tsx
  …
```

Dependencias (solo si se reactiva): `konva@9`, `react-konva@18`, `use-image@1`.

Para portar el odontograma a **N&K DentalSoft** u otro proyecto, usar la guía clínica actual, no este documento.
