# PROMPT PARA CURSOR — Sistema de UI Adaptable, Accesible e Inteligente
## N&K DentalSoft v1.0.0

---

## CONTEXTO DEL SISTEMA (léelo antes de tocar código)

Estás trabajando sobre **N&K DentalSoft**, un sistema de gestión odontológica mono-clínica en producción.

**Stack real (verificado en el Documento Maestro v4.0):**
- Backend: FastAPI ≥0.115.6, Python 3.12, SQLAlchemy ≥2.0.36, SQLite (WAL) con opción PostgreSQL 16, Alembic, JWT (PyJWT) con refresh tokens.
- Frontend: Next.js 14.2.35 (static export), React 18.3.1, TypeScript 5.7.2, Tailwind CSS 3.4.17, lucide-react 1.24.0.
- El frontend se sirve como SPA estática desde el mismo proceso FastAPI (no hay servidor Node en producción).
- Autenticación: cookie `ds_access_token` + localStorage (`access_token`/`refresh_token`), `AuthProvider` en `lib/auth.tsx`, refresh automático ante 401 en `lib/api.ts`.
- RBAC con 4 roles: ADMIN, DOCTOR, ASISTENTE, CAJERO. Control granular adicional vía `users.modulos_acceso`.

**Estructura de frontend relevante:**
```
frontend/src/
├── app/
│   ├── layout.tsx
│   ├── globals.css              # ~680 líneas
│   ├── dashboard/page.tsx
│   ├── agenda/
│   ├── caja/
│   ├── pacientes/
│   ├── reportes/
│   └── configuracion/
├── components/
│   ├── AppShell.tsx              # Layout principal
│   ├── Topbar.tsx
│   ├── Sidebar.tsx                # YA existe SidebarContext (colapso tablet + swipe)
│   ├── ui/                        # Badge, Button, Card, EmptyState, Toolbar
│   └── ...
└── lib/
    ├── api.ts                     # Cliente HTTP
    ├── auth.tsx                   # AuthProvider
    └── ...
```

**Importante:** ya existe un `SidebarContext` que maneja colapso en tablet con gestos swipe. **No lo dupliques ni lo reemplaces**: extiéndelo. Antes de escribir código nuevo, lee `components/Sidebar.tsx`, `components/AppShell.tsx` y `app/globals.css` completos para entender los patrones ya establecidos (nombres de variables CSS, convenciones de componentes, uso de Tailwind vs. CSS custom).

**Restricciones no negociables:**
1. No introducir dependencias pesadas nuevas sin justificarlo explícitamente en el PR (evita librerías de state management adicionales si Context API + hooks resuelven el caso).
2. No romper el flujo de autenticación, RBAC ni el guard de producción existente.
3. Todo debe seguir funcionando dentro de la SPA estática servida por FastAPI (sin asumir un servidor Node en producción).
4. Cualquier persistencia de preferencias de usuario debe ser local (localStorage/IndexedDB) — este sistema es mono-clínica, sin backend multi-tenant para preferencias de UI.
5. Mantener compatibilidad con los 4 roles y con `modulos_acceso`.
6. Cobertura de tests actual es baja (~30% frontend); todo lo nuevo debe incluir al menos pruebas Playwright básicas de humo.

---

## OBJETIVO GENERAL

Implementar una capa transversal de **UX adaptable, accesibilidad y rendimiento percibido** sobre la interfaz existente, organizada en 4 bloques. Cada bloque debe entregarse de forma incremental y revisable (PR por bloque, no un solo commit gigante).

---

## BLOQUE A — LAYOUT ADAPTABLE Y ESPACIO DE TRABAJO

### A.1 Paneles colapsables y flotantes
- Extender `SidebarContext` (no crear uno nuevo) para soportar tres estados por panel: `expanded | collapsed | floating`.
- El modo `floating` debe permitir que el sidebar se superponga temporalmente sobre el contenido (overlay con backdrop) sin desplazar el layout principal, útil para maximizar el área de trabajo en pantallas medianas.
- Extender el mismo patrón a cualquier panel lateral secundario existente (por ejemplo, paneles de detalle en `pacientes/[id]`, si existen paneles laterales en Ficha Clínica).
- Persistir el estado de colapso/flotación por usuario en `localStorage`, con clave namespaced (ej. `nk-ds:ui:panel:<panelId>`).
- Transición de estado debe respetar la preferencia de "reducción de movimiento" (ver A.4/Bloque B.3).

### A.2 Diseño fluido y adaptable (mobile → ultrawide)
- Auditar `globals.css` y los breakpoints de Tailwind actuales; definir (o confirmar) un set de breakpoints explícito: `mobile (<640px)`, `tablet (640–1024px)`, `desktop (1024–1920px)`, `ultrawide (>1920px)`.
- Para ultrawide: evitar que el contenido principal se estire sin límite (usar `max-width` con contenedor centrado o layout de columnas múltiples en vistas con muchos datos, como Agenda y Reportes).
- Verificar especialmente los componentes de mayor complejidad visual: grilla de Agenda (`app/agenda/`, ~655 líneas), Odontograma y Periodontograma — deben permanecer usables (sin scroll horizontal roto, sin overflow) en los 4 rangos.
- Entregable: tabla de verificación manual (o test Playwright con viewport variable) confirmando que Dashboard, Agenda, Caja, Pacientes y Ficha Clínica renderizan correctamente en al menos 5 resoluciones de referencia (375px, 768px, 1280px, 1920px, 2560px).

### A.3 Densidad de interfaz ajustable
- Agregar una preferencia global `density: 'compact' | 'comfortable'` (comfortable = default actual).
- Implementar vía atributo en `<html>` o `<body>` (ej. `data-density="compact"`) y variables CSS (`--spacing-unit`, `--row-height`, `--font-size-base`) consumidas por Tailwind (`theme.extend` o CSS vars) en vez de hardcodear paddings.
- Priorizar tablas/listas de alto volumen: lista de Pacientes, grilla de Agenda, historial de Caja.
- Control accesible desde Configuración (`app/configuracion/`) y opcionalmente desde un menú rápido en Topbar.
- Persistir en `localStorage` (`nk-ds:ui:density`).

---

## BLOQUE B — ACCESIBILIDAD Y CONTROL DEL USUARIO

### B.1 Navegación por teclado completa
- Auditar todos los flujos críticos (login, alta de paciente, odontograma, agenda, caja) y asegurar orden de tabulación lógico, `:focus-visible` consistente (usar el sistema de diseño ya presente en `ui/`, no estilos de foco ad-hoc).
- Implementar un registro central de atajos (`lib/shortcuts.ts` o similar) con acciones nombradas (ej. `nuevo-paciente`, `ir-agenda`, `abrir-caja`, `buscar-global`) en vez de listeners dispersos por componente.
- Atajos personalizables: UI en Configuración para reasignar combinaciones, con detección de conflictos y reseteo a default. Persistir mapeo en `localStorage`.
- Respetar los roles: un atajo no debe disparar una acción para la que el usuario no tiene permiso (reutilizar la misma lógica de RBAC del backend/frontend, no duplicar reglas).

### B.2 Escalado tipográfico dinámico
- Preferencia de usuario `fontScale` (ej. 3–4 niveles: 90%, 100%, 115%, 130%) aplicada vía variable CSS raíz (`--font-scale`) multiplicando los tamaños base, no reemplazando el sistema tipográfico.
- Verificar que layouts críticos (Odontograma, grilla de Agenda, tablas) no se rompan visualmente en el nivel más grande — usar `clamp()` y unidades relativas (`rem`) en vez de `px` fijos donde sea posible.
- Persistir en `localStorage` (`nk-ds:ui:font-scale`).

### B.3 Reducción de movimiento
- Respetar `prefers-reduced-motion: reduce` del sistema operativo por defecto.
- Agregar override manual en Configuración (independiente del OS) que fuerce desactivar animaciones/transiciones (sidebar, modales, toasts, dictado por voz, etc.).
- Centralizar duraciones de transición en variables CSS para poder anularlas globalmente con una sola regla cuando el modo esté activo.

### B.4 Contraste avanzado
- Agregar modo de alto contraste (paleta alternativa con ratios AA/AAA verificados, no solo invertir colores).
- Auditar componentes `ui/` (Badge, Button, Card, EmptyState, Toolbar) y el Odontograma/Periodontograma, que dependen fuertemente de color para indicar estado clínico — asegurar que en alto contraste esos estados sigan siendo distinguibles (agregar patrones/iconos como refuerzo, no solo color).
- Control en Configuración, persistido en `localStorage`.

**Nota de arquitectura para B.1–B.4:** todas estas preferencias deben vivir en un único store de preferencias de UI (ej. `lib/uiPreferences.tsx`, Context + hook `useUiPreferences()`) para evitar 4 sistemas de persistencia distintos. Aplicar los atributos `data-*` correspondientes en el root layout (`app/layout.tsx`) para que el CSS los consuma de forma predecible.

---

## BLOQUE C — INTELIGENCIA Y RENDIMIENTO

### C.1 Modo offline robusto
- Dado que el sistema corre en LAN/desktop y puede perder conectividad al backend FastAPI, implementar una capa de resiliencia:
  - Detección de estado de conexión (ping periódico ligero al endpoint `/health` ya documentado en la sección 6.20 del sistema).
  - Cola de escritura local (IndexedDB, no localStorage por volumen) para operaciones que fallen por desconexión: altas/ediciones de paciente, entradas de evolución, movimientos de caja.
  - Sincronización automática al recuperar conexión, con manejo explícito de conflictos (ej. si el registro fue modificado por otro usuario mientras tanto — dado que es mono-clínica pero puede haber varios equipos en LAN).
  - Indicador visible de estado (offline / sincronizando / sincronizado) en Topbar.
  - **No aplicar esto a Caja sin validación exhaustiva**: los movimientos de caja tienen implicancias de integridad financiera; si se implementa cola offline para caja, debe incluir idempotencia explícita (evitar duplicar transacciones al reintentar).

### C.2 Respuestas predictivas con IA / asistencia contextual
- Definir alcance realista para esta fase: autocompletado inteligente en campos repetitivos (ej. sugerencias de tratamiento frecuente en Evolución, autocompletar procedimientos en Odontograma según historial del paciente) usando datos ya existentes en el sistema (sin depender de un LLM externo en esta primera iteración, salvo que el equipo confirme presupuesto/infraestructura para ello).
- Si se decide integrar un LLM externo, debe ser un módulo aislado y opcional (feature flag), sin bloquear el flujo clínico si el servicio no está disponible, y sin enviar datos clínicos de pacientes a servicios externos sin que esto se documente y apruebe explícitamente (Ley 29733 — ver sección 22 del Documento Maestro).
- Para esta fase, priorizar: sugerencias basadas en reglas/heurísticas sobre datos locales (frecuencia de uso, historial del paciente) antes que IA generativa.

### C.3 Carga instantánea
- Auditar el bundle actual del frontend (Next.js static export) e identificar componentes pesados candidatos a `dynamic import` con `ssr:false` donde aplique (Odontograma, Periodontograma, VoiceDictation, SignaturePad son buenos candidatos por su complejidad visual).
- Implementar skeleton states / loading states consistentes (reutilizar o crear un componente `Skeleton` en `components/ui/`) en vez de spinners genéricos, para reducir la percepción de espera en Dashboard, Agenda y Ficha Clínica.
- Revisar memoización (`React.memo`, `useMemo`, `useCallback`) en listas grandes (lista de Pacientes, grilla de Agenda) para evitar renders innecesarios.
- Medir antes/después con Lighthouse o similar y documentar el resultado en el PR.

---

## BLOQUE D — PRIVACIDAD VISIBLE

### D.1 Controles de datos y permisos de sesión
- Agregar en Configuración (visible para todos los roles, con las secciones que correspondan según `modulos_acceso`) un panel de "Privacidad y sesión" que muestre:
  - Sesiones activas del usuario (si el backend expone esa información vía JWT/refresh tokens; si no existe endpoint, documentar como gap y proponer uno mínimo).
  - Última fecha de acceso y dispositivo/navegador (si es factible sin sobre-ingeniería).
  - Botón para cerrar sesión en todos los dispositivos (invalidar refresh tokens — coordinar con backend).
  - Resumen en lenguaje simple de qué datos se guardan localmente en este equipo (cola offline, preferencias de UI) y opción de limpiarlos.
- Esto es especialmente relevante dado que el Documento Maestro (sección 22.1) señala que el sistema **no tiene mecanismo explícito de consentimiento de datos ni endpoints ARCO** — este bloque no resuelve eso completamente, pero debe dejar la superficie de UI lista para cuando se implemente esa capa en backend. No inventar endpoints backend que no existen: si faltan, listarlos como pendientes explícitos en el PR.

---

## ENTREGABLES Y FASES SUGERIDAS

1. **Fase 1 (Bloque A):** layout adaptable + densidad. Es la base visual de todo lo demás.
2. **Fase 2 (Bloque B):** store central de preferencias de UI + accesibilidad completa.
3. **Fase 3 (Bloque C.3):** rendimiento percibido (bajo riesgo, alto impacto, hazlo antes de offline/IA).
4. **Fase 4 (Bloque C.1):** modo offline (mayor riesgo, requiere pruebas exhaustivas antes de tocar Caja).
5. **Fase 5 (Bloque C.2 y D):** asistencia contextual y privacidad visible.

Para cada fase entregar:
- PR independiente con descripción de qué se tocó y por qué.
- Capturas o video corto del antes/después.
- Lista de archivos nuevos vs. modificados.
- Tests Playwright de humo para los flujos afectados.
- Cualquier gap detectado en backend que bloquee la fase, documentado explícitamente (no simulado en frontend).

---

## CRITERIOS DE ACEPTACIÓN GLOBALES

- Ningún cambio debe romper los tests existentes (`pytest` backend, `Vitest`/`Playwright` frontend).
- Ninguna preferencia de UI debe requerir reiniciar sesión para aplicarse.
- Todo texto nuevo de interfaz debe estar en español (idioma actual del sistema).
- El sistema debe seguir siendo operable con un solo profesional (odontólogo solo, sin personal de soporte) — no agregar fricción a los flujos clínicos core (Odontograma, Evolución, Cobro) en nombre de estas mejoras.
