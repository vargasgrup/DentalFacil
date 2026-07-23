> ⚠️ **Documento obsoleto** — ver `docs/DOCUMENTO_MAESTRO_DENTALSIMPLE_v1_2026-07-23.md` como fuente única de verdad.

# RESUMEN EJECUTIVO GENERAL — M&D Odontología Especializada

## Qué se construyó

**M&D Odontología Especializada** es un sistema completo de gestión odontológica para un solo centro (mono-clínica, Perú), construido desde cero en 12 fases secuenciales. Es un sistema hermano simplificado de N&K DentalSoft (multi-tenant), reutilizando la idea central validada en producción: **la Ficha Clínica como pantalla única**.

### Los 7 pilares del objetivo general — estado final

| Pilar | Estado | Descripción |
|---|---|---|
| **1. Usuarios** | ✅ | Autenticación JWT (access + refresh), setup wizard de primer uso, 3 roles (ADMIN/DOCTOR/ASISTENTE), gestión de usuarios por ADMIN, middleware de permisos. |
| **2. Ficha Clínica** | ✅ | Pantalla única: identificación + historia clínica + diagnóstico + plan + evolución (tabla relacional) + consentimiento + odontograma embebido + resumen financiero en vivo (calculado desde Caja). Guardado por bloque lógico. Buscador rápido visible desde cualquier parte. |
| **3. Agenda y recordatorios** | ✅ | Calendario día/semana, creación/edición de citas con detección de solapes, botón directo a Ficha Clínica. Scheduler APScheduler que auto-detecta citas próximas y genera recordatorios con mensaje pre-redactado. Widget de recordatorios pendientes con envío en un clic. |
| **4. Caja** | ✅ | Apertura/cierre diario, monto inicial, ingresos vinculados a paciente (botón desde Ficha Clínica), egresos, cierre con resumen por método de pago. Sincronización en vivo: todo pago actualiza el resumen de la Ficha Clínica sin recargar. |
| **5. Comprobantes multi-formato** | ✅ | Un solo motor (ReportLab) para todos los documentos (comprobante, cierre, ficha, evolución, consentimiento, reportes). Tres formatos (80mm/A5/A4) con la misma plantilla de datos. Selector de formato con memoria de última preferencia. |
| **6. WhatsApp** | ✅ | Sin API oficial. Botón "Enviar por WhatsApp" que descarga el PDF automáticamente + abre `wa.me` con mensaje pre-redactado. Texto de ayuda visible. Aplicado a comprobantes, documentos clínicos y recordatorios (texto solo). Registro de envío para trazabilidad. |
| **7. Reportes** | ✅ | Tres reportes (caja, pacientes atendidos, tratamientos/evolución) desde una sola pantalla con selector de tipo + rango de fechas. Exportable en PDF (mismo motor) y CSV. |

---

## Decisiones de arquitectura clave

1. **WhatsApp sin API oficial (deliberado):** El sistema usa enlaces `wa.me` que abren el WhatsApp del propio usuario. No requiere verificación de negocio, número dedicado ni proceso burocrático. El flujo compensa la imposibilidad de adjuntar archivos automáticamente: descarga PDF (auto) → abre chat (auto) → usuario adjunta y envía (manual, un paso). La UI deja claro este límite.

2. **Impresión vía SO (sin ESC/POS):** Se genera un PDF dimensionado a 80mm y se delega la impresión al diálogo del SO/navegador, compatible con la mayoría de impresoras tiqueteras. Mantiene el sistema simple; ESC/POS directo queda como evolución futura para impresión silenciosa.

3. **Un solo motor de PDF:** ReportLab para todos los documentos y formatos. La misma plantilla de datos alimenta 80mm/A5/A4 — solo cambian dimensiones. Sin duplicación de lógica de negocio entre formatos.

4. **Resumen financiero en vivo:** Calculado en tiempo real desde `cash_transactions` (ingresos del paciente), nunca almacenado como campo editable. Costo total = suma de evolución; Pagado = suma de ingresos en Caja; Saldo = costo - pagado.

5. **Evolución como tabla relacional:** `clinical_evolution_entries` desde el día uno, nunca JSON de texto libre. Lección aplicada del sistema original.

6. **Recordatorios: auto-detección, envío manual de un clic:** El scheduler genera los recordatorios automáticamente (sin intervención), pero el envío final requiere un clic humano (abre WhatsApp con el mensaje listo). Esto es el límite real sin API oficial, y la UI lo deja claro.

7. **Scheduler embebido:** APScheduler dentro del proceso del backend, revisando cada 5 minutos. Sin infraestructura de colas externa (sin Celery/Redis) — apropiado para una sola clínica.

8. **Sin multi-tenencia:** Una sola BD, sin `tenant_id`, sin RLS. Es para un solo centro odontológico.

---

## Cómo levantar el proyecto

### Local
```bash
make db          # Inicia PostgreSQL (Docker)
make install     # Instala dependencias backend + frontend
make migrate     # Ejecuta migraciones Alembic
make backend     # Inicia FastAPI en :8001
make frontend    # Inicia Next.js en :3001
```

Al abrir `http://localhost:3001` por primera vez, el sistema muestra el wizard de configuración para crear la cuenta ADMIN.

### Producción (Railway)
1. Crear proyecto en Railway con dos servicios (backend + frontend) + plugin PostgreSQL.
2. Backend: usar `backend/Dockerfile`, configurar `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`.
3. Frontend: usar `frontend/Dockerfile`, configurar `NEXT_PUBLIC_API_URL`.
4. Ejecutar `alembic upgrade head` después del primer deploy.

---

## Estructura del proyecto

```
DentalSimple/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app + lifespan (scheduler)
│   │   ├── config.py            # Settings (Pydantic)
│   │   ├── database.py          # SQLAlchemy engine + Base
│   │   ├── core/
│   │   │   ├── security.py      # JWT + bcrypt (directo, sin passlib)
│   │   │   ├── roles.py         # Enum ADMIN/DOCTOR/ASISTENTE
│   │   │   └── deps.py          # get_current_user, require_roles
│   │   ├── models/              # SQLAlchemy models (10 tablas)
│   │   ├── schemas/             # Pydantic schemas
│   │   ├── routers/             # auth, patients, clinical, odontogram,
│   │   │   │                      appointments, cash, documents, reports
│   │   └── services/
│   │       └── pdf_generator.py # Único motor PDF (todos los doc types/formatos)
│   ├── alembic/                 # Migraciones
│   ├── requirements.txt
│   ├── Dockerfile
│   └── railway.toml
├── frontend/
│   ├── src/
│   │   ├── app/                 # Next.js App Router
│   │   │   ├── page.tsx         # Login / Setup wizard
│   │   │   ├── dashboard/
│   │   │   ├── pacientes/       # Lista + nuevo + [id] Ficha Clínica
│   │   │   ├── agenda/
│   │   │   ├── caja/
│   │   │   ├── reportes/
│   │   │   └── configuracion/
│   │   ├── components/          # Button, Input, Sidebar, PatientSearch,
│   │   │   │                      Odontograma, DocumentActions, ...
│   │   └── lib/                 # api.ts, auth.tsx, whatsapp.ts, validators.ts
│   ├── Dockerfile
│   └── railway.toml
├── docs/
│   └── ER_diagram.md           # Diagrama Mermaid del modelo
├── docker-compose.yml           # PostgreSQL
├── Makefile                     # Comandos: db, install, migrate, backend, frontend
└── README.md
```

---

## Modelo de datos (10 tablas)

- `users` — usuarios del sistema (3 roles)
- `patients` — pacientes (con número_ficha autogenerado)
- `clinical_records` — ficha clínica (1:1 con paciente)
- `clinical_evolution_entries` — evolución (tabla relacional, N por paciente)
- `odontogram_entries` — estado por pieza FDI
- `appointments` — citas
- `appointment_reminders` — recordatorios generados por scheduler
- `cash_sessions` — sesiones de caja (una activa a la vez)
- `cash_transactions` — ingresos/egresos
- `documents_generated` — registro central de documentos emitidos (trazabilidad)

---

## Próximos pasos sugeridos (fuera de alcance de v1)

- Facturación electrónica SUNAT (boletas/facturas electrónicas)
- Integración RENIEC/SUNAT para validación de DNI/RUC en tiempo real
- 2FA (modelo de usuario preparado)
- Impresión ESC/POS directa (impresión silenciosa sin diálogo)
- Google Calendar (sincronización de citas)
- Módulo de laboratorio dental
- Inventario de insumos
- Migración del envío de WhatsApp de `wa.me` (manual) a la API oficial de WhatsApp Business — solo si el centro crece y lo justifica

---

## Checklist final de los 7 pilares

- [x] **Usuarios** — JWT, 3 roles, setup wizard, gestión de usuarios ✅
- [x] **Ficha Clínica** — pantalla única, evolución relacional, resumen financiero en vivo, odontograma embebido ✅
- [x] **Agenda y recordatorios** — calendario, scheduler, recordatorios auto-generados, envío en un clic ✅
- [x] **Caja** — apertura/cierre, ingresos/egresos, pago desde ficha, sync en vivo ✅
- [x] **Comprobantes multi-formato** — un motor, 3 formatos (80mm/A5/A4), selector con memoria ✅
- [x] **WhatsApp** — wa.me, descarga PDF + abre chat, recordatorios texto, registro de envío, texto de ayuda ✅
- [x] **Reportes** — caja, pacientes, tratamientos, export PDF/CSV, pantalla única ✅
