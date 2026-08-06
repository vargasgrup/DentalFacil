# UX adaptativo — Fases 2–5 (verificación)

Referencia: `docs/PROMPT_CURSOR_UX_ADAPTATIVO_NK_DENTALSOFT.md`.  
Fecha de cierre de implementación: 2026-08-06.

## Fase 2 — Bloque B (accesibilidad)

| Ítem | Estado | Notas |
|------|--------|--------|
| Atajos centralizados | OK | `frontend/src/lib/shortcuts.ts` + `ShortcutsListener` |
| Personalización UI | OK | Config → Interfaz; conflictos y reset |
| RBAC en atajos | OK | `canAccessModule` por definición |
| Font scale 90–130% | OK | `data-font-scale` + `--font-scale` |
| Reducción de movimiento | OK | OS + override `data-reduced-motion` |
| Alto contraste | OK | `data-contrast="high"` en `globals.css` |
| Focus brand util | OK | `.focus-brand` restaurada |

## Fase 3 — Bloque C.3 (rendimiento percibido)

| Ítem | Estado | Notas |
|------|--------|--------|
| Skeleton | OK | `components/ui/Skeleton.tsx` + CSS `.skeleton` |
| Dynamic Odontograma | OK | `EvaluacionTab` con `next/dynamic` |

## Fase 4 — Bloque C.1 (offline resiliencia)

| Ítem | Estado | Notas |
|------|--------|--------|
| Health / estado | OK | `connectionStatus` → Topbar |
| Cola IndexedDB | OK | `offlineQueue` (`nk-ds-offline`) |
| Sync al volver online | OK | `OfflineSyncProvider` |
| Integración `apiFetch` | OK | Encola solo mutaciones seguras en fallo de red |
| **Caja no offline** | OK | Hard ban en `apiOffline` y en flush |

## Fase 5 — C.2 + Bloque D

| Ítem | Estado | Notas |
|------|--------|--------|
| Sugerencias locales tratamientos | OK | `treatmentFreq` + frecuencias en autocomplete |
| Privacidad / sesión panel | OK | Config → Privacidad |
| Logout all devices | OK | `POST /api/auth/logout-all` (token_version) |
| Limpiar datos UI locales | OK | localStorage + cola IDB |

### Gaps documentados (sin full backend ARCO)

- Listado de sesiones remotas por dispositivo.
- Endpoints ARCO formales (Ley 29733).
- Caja offline: **no implementada** a propósito (integridad financiera).

## Tests

- Frontend: `npx tsc --noEmit` limpio.
- E2E: `frontend/e2e/ux-layout.spec.ts` (viewports + density + a11y attrs).
- Backend: `test_logout_all_invalidates_previous_token` en `tests/test_auth.py`.

## No tocado (congelado)

- Código LAN cliente/servidor (`packaging/client`, discovery, etc.).
- Generación de instaladores Windows.
