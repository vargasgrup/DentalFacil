> ⚠️ **Documento obsoleto** — ver `docs/DOCUMENTO_MAESTRO_DENTALSIMPLE_v1_2026-07-23.md` como fuente única de verdad.

# Product

## Register

product

## Users

Odontólogo (y eventualmente asistente/admin) en un solo centro odontológico en Perú. Opera el sistema solo o con poco personal: hace de recepcionista, cajero, doctor y administrador a la vez. Usa el sistema en consultorio, a menudo desde tablet o laptop, bajo presión de tiempo entre pacientes.

## Product Purpose

M&D Odontología Especializada (MiniOS / DentalSimple) es un sistema de gestión odontológica mono-clínica. Concentra la operación diaria en pocos clics: Ficha Clínica como pantalla única, agenda con recordatorios WhatsApp (`wa.me`), caja diaria, comprobantes multi-formato (80mm/A5/A4) y reportes. Éxito = completar cualquier flujo operativo (agendar, cobrar, documentar, recordar) sin fricción ni pantallas de más.

## Brand Personality

Profesional, clínico, ágil. Confianza de herramienta de consultorio, no de marketing. Claridad y densidad bien balanceada por encima de decoración.

## Anti-references

- Emojis como iconografía funcional
- Banners de recordatorio duplicados por pantalla
- Badges/estados inconsistentes (texto plano vs pill según pantalla)
- Acciones como texto subrayado sin affordance de botón
- UI genérica “SaaS púrpura”, cream/terracotta editorial, o dashboards recargados de stats falsos
- Frameworks de UI pesados (Material, Ant Design) que inflen el bundle

## Design Principles

1. **Un par de clics** — cada cambio de layout debe reducir o mantener el número de clics; nunca aumentarlo.
2. **La herramienta desaparece en la tarea** — familiaridad de producto (Linear/Stripe-like), no rareza visual.
3. **Un solo sistema, seis pantallas** — mismos tokens, badges, botones y toolbars en todas partes.
4. **Densidad con jerarquía** — información operativa visible sin ruido; tipografía y espaciado hacen el trabajo.
5. **No romper lo que funciona** — cero cambios de backend o lógica; solo presentación y UX.

## Accessibility & Inclusion

Objetivo WCAG 2.1 AA en contraste y foco visible. Soporte `prefers-reduced-motion`. Uso real en tablet: sidebar colapsable, topbar usable en anchos angostos. Placeholders y texto secundario con contraste suficiente (≥4.5:1).
