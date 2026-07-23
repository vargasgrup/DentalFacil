> ⚠️ **Documento obsoleto** — ver `docs/DOCUMENTO_MAESTRO_DENTALSIMPLE_v1_2026-07-23.md` como fuente única de verdad.

# Guía breve — Sistema de diseño MiniOS

Ver también `DESIGN.md` en la raíz del proyecto (fuente canónica).

## Paleta
- **Primario:** `brand-600` (#1c66e8) — CTAs, nav activo
- **Fondo:** `surface-muted` (#f8fafc) / cards blancas
- **Éxito:** `success-*` — ingresos
- **Advertencia:** `warning-*` — recordatorios
- **Peligro:** `danger-*` — cerrar caja, desactivar, cancelar
- **Info:** `info-*` — estados neutros informativos

## Tipografía
`text-page-title` → `text-section-title` → `text-label` → `text-data` → `text-help`

## Componentes reutilizables
Importar desde `@/components/ui`:
- `Badge`, `Button`, `Card`, `StatCard`, `EmptyState`, `Toolbar`

## Iconos
Solo `lucide-react`. No emojis como iconografía funcional.
