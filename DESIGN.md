# Design System — M&D Odontología Especializada

## Theme
Clinical product UI: restrained blue brand, dense but calm surfaces, familiar SaaS patterns. Light mode only. Design serves the task (ficha, agenda, caja), not decoration.

## Colors
| Token | Value | Role |
|---|---|---|
| `brand-600` | `#1c66e8` | Primary actions, active nav, focus rings |
| `brand-50` | `#eef6ff` | Active nav bg, soft highlights |
| `surface` | `#ffffff` | Cards, panels |
| `surface-muted` | `#f8fafc` | Page background |
| `surface-subtle` | `#f1f5f9` | Table headers, input idle bg |
| `success-600` | `#16a34a` | Ingresos, confirmaciones |
| `warning-500` | `#f59e0b` | Recordatorios pendientes |
| `danger-600` | `#dc2626` | Cerrar caja, desactivar, cancelar |
| `info-600` | `#2563eb` | Estados informativos (cita programada) |
| Ink | `slate-800` / `slate-500` / `slate-400` | Primary / secondary / tertiary text |

## Typography
Family: Plus Jakarta Sans (product UI), with system-ui fallbacks. Product scale (fixed rem, not fluid):
- `text-page-title` — 1.5rem / 700 — page H1
- `text-section-title` — 1.125rem / 600 — card/section H2
- `text-label` — 0.875rem / 500 — field labels
- `text-data` — 0.875rem — table/body data
- `text-help` — 0.75rem — hints, secondary

## Spacing & Radius
- Cards: `rounded-card` (0.75rem), padding `p-5`
- Buttons/inputs: `rounded-lg` (0.5rem)
- Badges: `rounded-pill`
- Page content: `p-6`, max-width ~5xl on list modules

## Elevation
- `shadow-card` — resting cards
- `shadow-card-hover` — row/card hover
- `shadow-dropdown` — menus, search results
- Prefer border OR soft shadow — not both heavy

## Components
| Component | Path | Variants |
|---|---|---|
| `Badge` | `components/ui/Badge` | success, warning, danger, info, neutral, brand |
| `Button` | `components/ui/Button` | primary, secondary, ghost, danger (+ loading, icon) |
| `Card` / `StatCard` | `components/ui/Card` | padding none/sm/md/lg |
| `EmptyState` | `components/ui/EmptyState` | icon + title + description + action |
| `Toolbar` | `components/ui/Toolbar` | search + actions slot |
| `Input` | `components/Input` | label, error |
| `AppShell` | `components/AppShell` | sidebar + topbar + mobile drawer |
| `Topbar` | `components/Topbar` | search, Bell notifications, +Nuevo, user menu |

## Icons
`lucide-react` only. Mapping: Home, Users, Calendar, Wallet, BarChart3, Settings, Bell, Plus, Search, Menu, Download, MessageCircle, FileSpreadsheet, Clock, ChevronLeft/Right, LogOut, KeyRound, UserX, Check.

## Motion
- `transition-smooth` (~150–200ms ease)
- Hover/focus/pressed on interactive controls
- Skeleton shimmer for loading blocks
- Respect `prefers-reduced-motion`

## Layout
- Desktop: fixed sidebar 14rem + sticky topbar
- Tablet/mobile (`<lg`): hamburger drawer sidebar; topbar search remains primary
- Z-index: sidebar 30 → topbar/dropdowns 40 → mobile overlay 40 → drawer 50
