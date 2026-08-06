# UX adaptativo — Fase 1 (Bloque A) — verificación

Implementación según `docs/PROMPT_CURSOR_UX_ADAPTATIVO_NK_DENTALSOFT.md`.

## Entregado

| Ítem | Estado |
|------|--------|
| A.1 Sidebar `expanded \| collapsed \| floating` + persistencia `nk-ds:ui:panel:sidebar` | OK |
| A.2 Breakpoints documentados + `PageContainer` tope ultrawide | OK |
| A.3 Densidad `comfortable \| compact` (`data-density`, `nk-ds:ui:density`) | OK |
| Store base `lib/uiPreferences.tsx` (+ base B.2–B.4 attrs) | OK (completo en Fase 2) |
| Configuración → **Interfaz y densidad** | OK |
| Accesos rápidos Topbar (densidad + modo barra) | OK |
| Playwright humo viewports | `frontend/e2e/ux-layout.spec.ts` |

## Resoluciones de referencia (manual / e2e)

| Viewport | Uso | Módulos a revisar |
|----------|-----|-------------------|
| 375×812 | Mobile | Login, menú inferior, Caja |
| 768×1024 | Tablet | Sidebar compacto/flotante, Agenda |
| 1280×800 | Desktop | Dashboard, Pacientes |
| 1920×1080 | Full HD | Agenda grilla, Reportes |
| 2560×1080 | Ultrawide | Contenido centrado (`PageContainer`) |

## Archivos principales

- `frontend/src/lib/uiPreferences.tsx` (nuevo)
- `frontend/src/components/SidebarContext.tsx` (nuevo)
- `frontend/src/components/AppShell.tsx`, `Sidebar.tsx`, `Topbar.tsx`
- `frontend/src/components/config/UiAppearancePanel.tsx` (nuevo)
- `frontend/src/app/globals.css`, `PageContainer.tsx`
- `frontend/e2e/ux-layout.spec.ts`

## Gaps / siguiente fase

- B.1 Atajos de teclado centralizados
- B.2–B.4 UI completa de escala tipográfica, reducción de movimiento y alto contraste (attrs ya cableados)
- C y D según prompt (no en esta fase)
- No se tocó Caja offline ni flujos de cobro

## Cómo probar

1. Abrir Configuración → **Interfaz y densidad** y alternar densidades.
2. Topbar: ícono de filas (densidad) y de panel (modo barra).
3. Sidebar: **Compactar** → íconos; de nuevo → flotante; botón chevron o Menú para superponer.
4. `npx playwright test e2e/ux-layout.spec.ts` (con stack de e2e habitual).
