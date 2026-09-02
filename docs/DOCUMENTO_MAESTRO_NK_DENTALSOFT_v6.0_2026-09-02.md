# DOCUMENTO MAESTRO ÚNICO — N&K DentalSoft v6.0

> **Clasificación:** Confidencial — Uso Interno  
> **Naturaleza:** Single Source of Truth (SSOT)  
> **Regla de supervivencia:** Si desaparecen el código, el Git, los diagramas y el equipo, este documento debe bastar para reconstruir el sistema.  
> **Repositorio de referencia (histórico):** `C:\PROYECTOS\DentalSimple`  
> **Producto runtime:** N&K DentalSoft `1.0.0` (`backend/app/version.py`)  
> **Empaquetado Windows Server:** NSIS `4.0.3` (`packaging/server/installer.nsi`)  
> **Empaquetado Windows Client:** NSIS `4.0.0`  
> **Fecha:** 2026-09-02  
> **Supersede:** v5.0 (2026-08-11), v4.0 (2026-07-30) y anteriores  

---

# 0. PORTADA Y METADATOS

| Campo | Valor |
|---|---|
| Nombre del sistema | N&K DentalSoft |
| Nombre comercial de clínica de referencia (branding configurable) | Configurable en `clinic_settings` (ej. M&D Odontología Especializada) |
| Versión producto | `1.0.0` |
| Versión documento | **v6.0 — SSOT completo (estructura 1–44)** |
| Fecha | 2026-09-02 |
| Idioma del producto | Español (Perú) |
| Despliegues soportados | (A) LAN Desktop Windows 11 Server+Client; (B) Web/Cloud (Railway) same-origin SPA |
| Motor de datos principal clínica | SQLite (`clinica.db`) — Postgres opcional vía `DATABASE_URL` |
| Autoridad de este documento | Arquitectura / Producto / Implementación |

**Criterio de calidad de cada sección (obligatorio):** propósito · alcance · dependencias · entradas · salidas · responsables · reglas · restricciones · errores · casos límite · riesgos · decisiones · trazabilidad.

**Correcciones críticas respecto a v5.0 (no negociables):**

1. Restore **no** reemplaza `clinica.db` en instalación existente: es **merge clínico** (`merge_clinical_keep_app_schema`).
2. WebSocket real: **`/api/ws`**, no `/ws`.
3. Alembic HEAD actual: **`r13patient_especialidades`** (no `p5user_modulos`).
4. Desktop 4.0.2/4.0.3: recuperación de puerto 8001 + ACL ProgramData + tarea ONLOGON.
5. Envío de PDFs: Sistema Universal WhatsApp (Cloud → retry → Web Share → Desktop/Web); Meta Graph solo en backend.

---

# 1. FILOSOFÍA DEL PROYECTO

## 1.1 Propósito
Definir los axiomas no negociables que gobiernan todo diseño, código, empaquetado y operación de N&K DentalSoft.

## 1.2 Axiomas

1. **La clínica es dueña de sus datos.** El software es un instrumento; la migración/backup mueve pacientes y finanzas, nunca “baja” la versión del software instalado.
2. **Same-origin primero.** En Server desktop (`:8001`) la UI y la API viven juntos; no hardcodear `NEXT_PUBLIC_API_URL` a otro host en producción empaquetada.
3. **Un Server, N Clients.** SQLite nunca en carpeta SMB compartida. Clients consumen `http://IP_NUMERICA:8001/`.
4. **Integridad financiera > UX offline.** La Caja nunca se encola offline.
5. **Credenciales Admin protegidas en demos compartidas.** `DEMO_MODE` congela username/password del Admin; en clínica real permanece `false`.
6. **LAN verificada = congelada.** Tras verificación clínica (2026-07-27), no se rediseña discovery/firewall/bind sin orden explícita.
7. **Documentos PDF en RAM al enviar por WhatsApp.** Prohibido volcar base64 en el texto del chat; teléfono del paciente automático (`normalizePeruPhone`).
8. **RBAC dual:** rol + módulos (`modulos_acceso`). ADMIN siempre tiene todos los módulos; máximo 2 ADMIN.
9. **UUID string(36) como PK** en dominio clínico (excepto `revoked_tokens.jti` y singletons fijos).
10. **Idempotencia y auditoría donde el dinero o la clínica lo exigen** (allocation, void, restore, logout-all).

## 1.3 Anti-filosofía (prohibido)
- Sustituir la BD viva con `os.replace` como camino feliz de restore.
- Llamar a Meta Graph desde el frontend.
- Diseñar Clients que requieran mDNS obligatorio (IP numérica es el contrato).
- Permitir que un usuario estándar no pueda escribir `ProgramData\NKDentalSoft\data` tras instalar elevado.
- Mezclar “actualización de software” con “restauración de pacientes” en el mismo mensaje UX.

## 1.4 Trazabilidad
→ Objetivos (§3), Restricciones (§6), ADR (§41), Backup (§13/§24), Seguridad (§25).

---

# 2. VISIÓN

## 2.1 Propósito
Describir el estado deseado del producto a 5–10 años de operación clínica sin reescritura.

## 2.2 Visión de producto
N&K DentalSoft es el sistema operativo clínico de un centro odontológico peruano: ficha única del paciente, odontograma normativo, periodontograma, plan de tratamiento con economía, agenda con recordatorios, caja con cobros mixtos y asignación a deudas, documentos PDF multi-formato, respaldo migrable, y operación tanto en consultorio (LAN Windows) como en demo/cloud.

## 2.3 Visión técnica
Una sola base de código FastAPI + Next.js (static export embebible) que:

- Arranca como EXE Server Windows (PyInstaller onedir + NSIS) sirviendo SPA + API en `0.0.0.0:8001`.
- Arranca como proceso web (Railway) montando el mismo SPA.
- Expone contratos REST + WebSocket estables.
- Preserva datos clínicos a través de upgrades de software vía merge + `ensure_*_schema`.

## 2.4 Criterio de éxito de la visión
Un odontólogo y su asistente pueden operar un día completo (agenda → atención → evolución → cobro → comprobante WhatsApp → cierre de caja) en un PC Server Windows 11 sin depender de Internet, y un Client en otra PC de la misma LAN puede trabajar contra el mismo Server con la URL `http://192.168.x.x:8001/`.

---

# 3. OBJETIVOS

## 3.1 Objetivos de negocio
| ID | Objetivo | Métrica |
|---|---|---|
| O-B1 | Digitalizar ficha clínica y odontograma | 100% pacientes activos con ficha |
| O-B2 | Cobrar y conciliar caja diaria | Sesión abierta única; arqueo al cierre |
| O-B3 | Emitir/compartir documentos clínicos y de caja | PDF 80mm/A5/A4 + WhatsApp |
| O-B4 | Migrar clínica a otro PC sin perder pacientes | Restore merge clínico con `CONFIRMAR` |
| O-B5 | Demo compartida segura | `DEMO_MODE` impide robo de Admin |

## 3.2 Objetivos técnicos
| ID | Objetivo | Evidencia en código |
|---|---|---|
| O-T1 | API REST versionada por rutas `/api/*` | `main.py` routers |
| O-T2 | Auth JWT access+refresh + revocación | `core/security.py`, `revoked_tokens`, `token_version` |
| O-T3 | ACL por módulo en API y UI | `core/modules.py`, `lib/roles.ts` |
| O-T4 | Desktop arrancable sin “Ejecutar como Admin” | `grant_clinic_data_access.ps1`, task ONLOGON |
| O-T5 | Backup/restore clínico trazable | `sqlite_restore.py`, `test_backup.py` |

## 3.3 No-objetivos (explícitos)
- Multitenancy SaaS multi-clínica en un solo DB.
- Facturación electrónica SUNAT.
- RENIEC / pasarelas de pago / Twilio SMS.
- 2FA.
- Odontograma 3D/Konva en producción (deprecado).

---

# 4. PROBLEMA

## 4.1 Problema de negocio
Las clínicas odontológicas mixtas (papel + Excel + WhatsApp informal) pierden trazabilidad clínica, duplican fichas, no concilian pagos parciales por pieza/plan, y no pueden migrar su historia a un PC nuevo sin “bajar” de versión de software o perder medios.

## 4.2 Problemas técnicos que el sistema resuelve
1. **Historial clínico fragmentado** → ficha 1:1 + evolución + odontograma + perio + medios.
2. **Cobros parciales ambiguos** → `payment_allocation` waterfall + `a_cuenta`.
3. **Clientes LAN frágiles** → IP numérica + connect card + discovery UDP 37020 (congelado).
4. **Upgrade que “borra” la clínica** → merge clínico, nunca full-replace como path feliz.
5. **Demo pública vandalizable** → `DEMO_MODE` lock de Admin.
6. **Desktop solo abre como Admin** → ACL Users Modify sobre ProgramData + tarea autostart.

## 4.3 Síntomas observados (histórico 2026-08)
- `FATAL — server did not open port` tras install: hijo `--foreground` muerto/mutex + timeout corto.
- Solo abre como Administrador: `clinica.db` owned by Administrators; Users RX.
- Ventana PowerShell “colgada”: en realidad servidor `--foreground` healthy escuchando 8001.

---

# 5. ALCANCE

## 5.1 En alcance (producto actual)
- Módulos: Dashboard, Pacientes (ficha), Agenda, Caja, Reportes, Configuración.
- Odontograma anatómico FDI (37 condiciones), periodontograma, tooth media, pruebas complementarias, documentos históricos digitalizados.
- Consentimientos oficiales (plantillas COP), presupuesto, ficha PDF, evolución PDF, comprobantes, cierre de caja.
- Backup ZIP clínico + restore merge + bootstrap en PC vacía.
- WhatsApp Cloud opcional + fallbacks nativos.
- Vendor rescue / maintenance cycle (clave de mantenimiento).
- Offline queue limitada (pacientes/evolución; no caja).
- UX adaptativo (densidad, escala, contraste, reduced-motion), atajos, idle session.

## 5.2 Fuera de alcance
- Inventario de materiales, RRHH, contabilidad general, citas online públicas, teleodontología, IA clínica diagnóstica productiva (no hay motor IA clínico en runtime).
- Rediseño LAN Client↔Server.

## 5.3 Activos de código canónicos
| Área | Ruta |
|---|---|
| Backend | `backend/app/` |
| Frontend | `frontend/src/` |
| Packaging | `packaging/` |
| Tests backend | `backend/tests/` (~31 archivos, ~139 tests) |
| Reglas agente | `.cursor/rules/*.mdc` |

---

# 6. RESTRICCIONES

## 6.1 Restricciones de plataforma
| ID | Restricción |
|---|---|
| R-P1 | Server clínica: Windows 10/11 x64 |
| R-P2 | Python build Server: 3.12 |
| R-P3 | Node build UI: 20+ |
| R-P4 | Puerto HTTP Server: **8001** |
| R-P5 | Bind LAN: **`HOST=0.0.0.0`** |
| R-P6 | Discovery UDP: **37020** |
| R-P7 | SQLite path desktop: `%ProgramData%\NKDentalSoft\data\clinica.db` |

## 6.2 Restricciones de negocio
| ID | Restricción |
|---|---|
| R-B1 | Máximo 2 usuarios `ADMIN` |
| R-B2 | A lo sumo una `cash_sessions` abierta (`open_lock=1` unique) |
| R-B3 | Confirmación destructiva restore: texto exacto `CONFIRMAR` |
| R-B4 | Documentos WhatsApp: teléfono del paciente automático |

## 6.3 Restricciones de congelamiento
| ID | Artefacto | Estado |
|---|---|---|
| R-F1 | `ConnectClinic.cs`, `lan_*`, `firewall_lan`, `connect_card`, `repair_lan`, bind 8001 | **CONGELADO** 2026-07-27 |
| R-F2 | Generación de instaladores | Solo bajo demanda explícita |

## 6.4 Restricciones legales/operativas
- Textos UI en español.
- Datos de salud: minimizar exposición; soft-delete paciente (`activo`); auditoría clínica.
- No hay módulo ARCO formal (limitación documentada §40).

---

# 7. STAKEHOLDERS

| Rol | Interés | Interfaz principal |
|---|---|---|
| Dueño / Admin clínica | Control total, usuarios, backup, branding | `/configuracion`, `/ops/nk-svc` (vendor) |
| Doctor | Ficha, odontograma, plan, evolución | `/pacientes/[id]` |
| Asistente | Agenda, alta pacientes, recordatorios | `/agenda`, `/pacientes` |
| Cajero | Cobros, deudas, cierre | `/caja` |
| Vendor N&K | Rescue Admin, ciclo mantenimiento | `/ops/nk-svc` + `MAINTENANCE_ACCESS_KEY` |
| IT clínica | Install Server/Client, LAN, firewall | Setup NSIS, `repair_startup.cmd`, `Reparar-Red-LAN.bat` |
| Paciente (indirecto) | Recibe WhatsApp/PDF | No tiene login |

---

# 8. ARQUITECTURA GENERAL

## 8.1 Propósito
Definir los dos modos de despliegue y el mapa de componentes.

## 8.2 Diagrama textual — Modo LAN Desktop

```
[PC Server Windows]
  nkdentalsoft-server.exe
    ├── --foreground  → uvicorn FastAPI 0.0.0.0:8001 + SPA web/ + SQLite ProgramData
    ├── --desktop     → wait HTTP ready → WebView2 / Edge --app UI
    ├── Task Scheduler "NKDentalSoft Server" ONLOGON → --foreground (oculto deseado)
    ├── UDP discovery :37020
    └── connect.url / IP-DEL-SERVIDOR.txt

[PC Client Windows]
  ConnectClinic.exe → Edge --app → http://IP:8001/
  (sin base de datos local)
```

## 8.3 Diagrama textual — Modo Web/Cloud

```
Browser → https://host/
  FastAPI sirve SPA estática + /api/*
  DATABASE_URL sqlite:///data/... o Postgres
  WebSocket /api/ws
```

## 8.4 Detección de modo (frontend)
`frontend/src/lib/runtimeMode.ts`:
- `lan_desktop` si hostname localhost/127.0.0.1 **o** puerto 8001 **o** IP privada.
- En caso contrario `web_cloud`.
- **No cambia contratos API.**

## 8.5 Capas
1. UI React/Next static export  
2. API FastAPI routers  
3. Services (dominio)  
4. SQLAlchemy models + SQLite/Postgres  
5. Integraciones (WhatsApp, SMTP/Resend, firewall/LAN)  
6. Packaging (PyInstaller/NSIS)

## 8.6 Decisiones
- Un solo proceso Server por clínica (mutex foreground).
- SPA mount post-routers en `main.py`.
- Durante restore: middleware 503 excepto health.

---

# 9. ARQUITECTURA DE IA

## 9.1 Estado actual
**No existe un motor de IA clínica en producción** (sin LLM embebido, sin inferencia diagnóstica, sin prompts runtime de producto).

## 9.2 Uso de IA en el ciclo de vida del proyecto
- Agentes/IDE (Cursor) asisten desarrollo bajo reglas `.cursor/rules/*.mdc`.
- Skills de diseño/UI existen en `.cursor/skills/` y skills de usuario; **no forman parte del runtime clínico**.

## 9.3 Si se añade IA en el futuro (contrato mínimo)
- Nunca escribir diagnósticos sin confirmación humana.
- Nunca enviar PHI a proveedores cloud sin consentimiento y configuración explícita.
- Prompts oficiales vivirían en §32; hoy §32 documenta la ausencia.

## 9.4 VoiceDictation
Componente `VoiceDictation.tsx` usa APIs de dictado del navegador cuando disponibles; no es un modelo propio del producto.

---

# 10. ARQUITECTURA BACKEND

## 10.1 Entry
- Dev: `backend` + uvicorn.
- Frozen: `packaging/server/windows_service.py` → importa `server_entry.py` → `app.main:app`.

## 10.2 `main.py` — responsabilidades
1. Crear FastAPI + lifespan.
2. CORS (`CORS_ORIGINS` o `*`).
3. Middleware restore 503.
4. Lifespan: migraciones + `ensure_*` + APScheduler + LAN discovery + connect card + mDNS opcional.
5. Incluir routers.
6. `GET /api/health`.
7. `mount_frontend_static`.

## 10.3 Routers (prefijos)
`/api/auth`, `/api/users`, `/api/patients`, `/api/clinical`, `/api/odontogram`, `/api/periodontogram`, `/api/tooth-media`, `/api/complementary-tests`, `/api/historical-documents`, `/api/audit`, `/api/appointments`, `/api/config`, `/api/cash`, `/api/documents`, `/api/reports`, `/api/dashboard`, `/api/integrations/whatsapp`, `/api/system/maintenance`, `/api/system/vendor`, `/api/backup`, `/api/system`, `/api/ws`.

## 10.4 Dependencias de auth
- `get_current_user`
- `require_roles(...)`
- `require_module(...)` / `require_any_module(...)`

## 10.5 Scheduler
| Job | Intervalo | Primera ejecución |
|---|---|---|
| `generate_reminders_job` | 5 min | +1 min |
| `run_scheduled_backup_job` | 10 min | +2 min |

## 10.6 ensure_* (idempotentes, post-migrate)
auth, username, clinical evolution, complementary tests, historical docs, patient activo/document unique/lifecycle/especialidades, cash, maintenance, backup, alta retroactiva, odontogram unique.

## 10.7 Errores típicos de arranque desktop
- Readonly DB → proceso muere antes de listen.
- Mutex held + port closed → segundo foreground sale.
- Schema bootstrap lento → launcher debe esperar HTTP health, no solo TCP breve.

---

# 11. ARQUITECTURA FRONTEND

## 11.1 Stack
Next.js 14.2.x (App Router), React 18.3, TypeScript 5.7, Tailwind 3.4, Vitest, Playwright.

## 11.2 Builds
| Script | Salida |
|---|---|
| `npm run dev` | :3001 |
| `npm run build:desktop` | `frontend/out/` static export embebido en Server |
| `npm run build` | build Next estándar |

## 11.3 Shell y rutas
`AppShell` + layouts por módulo. Rutas: `/`, `/dashboard`, `/pacientes`, `/pacientes/nuevo`, `/pacientes/[id]`, `/agenda`, `/caja`, `/reportes`, `/configuracion`, `/recuperar-clave`, `/ops/nk-svc`.

## 11.4 Estado cliente
- Auth context (`auth.tsx`) + cookie `ds_access_token` (middleware).
- `clinicBrand`, `uiPreferences`, `connectionStatus`, `offlineSync`.
- Realtime: `useRealtimeSync` → `/api/ws?token=`.

## 11.5 API client
`lib/api.ts` → `getApiBase()` same-origin en desktop; tokens en storage controlado (lint `check-no-direct-token-access`).

## 11.6 Document Sender (SSOT envío PDF)
`DocumentActions` / `ShareDocumentButton` / `useDocumentSender` — ver §24.

## 11.7 Offline
IndexedDB `nk-ds-offline` store `outbox`. Kinds: `patient_create`, `patient_patch`, `evolution_create`. Caja hard-ban.

---

# 12. ARQUITECTURA DE DATOS

## 12.1 Principios
- UUID string PK.
- Sin `relationship()` ORM; FKs explícitas.
- Soft-delete pacientes: `activo`.
- Singletons: `clinic_settings`, `backup_settings` con IDs fijos.

## 12.2 IDs fijos (`models/ids.py`)
| Constante | Valor |
|---|---|
| `CLINIC_SETTINGS_ID` | `00000000-0000-4000-8000-000000000001` |
| `BACKUP_SETTINGS_ID` | `00000000-0000-4000-8000-000000000002` |

## 12.3 Motores
- Default desktop: SQLite file.
- Opcional: `postgresql+psycopg://...`.
- SQLite vacío: bootstrap metadata + stamp Alembic head.

## 12.4 Medios en disco (no solo DB)
| Env / path | Contenido |
|---|---|
| `UPLOAD_DIR` / ProgramData `uploads` | uploads genéricos / logos |
| `TOOTH_MEDIA_ROOT` | fotos por pieza |
| `COMPLEMENTARY_TESTS_ROOT` | pruebas |
| `HISTORICAL_DOCUMENTS_ROOT` | fichas digitalizadas |

## 12.5 Política backup/restore
Ver §24 y `docs/BACKUP_RESTORE.md`. Manifest: `package_kind=clinical_data`, `restore_mode=merge_clinical_keep_app_schema`.

---

# 13. ARQUITECTURA DE INFRAESTRUCTURA

## 13.1 Desktop ProgramData
```
%ProgramData%\NKDentalSoft\
  config\.env
  data\clinica.db
  logs\startup.log, foreground.log, install_autostart.log, grant_data_access.log, lan_repair.log
  certs\
  uploads\, tooth_media\, complementary_tests\, historical_documents\
  updates\
  connect.url
  IP-DEL-SERVIDOR.txt
  HOTSPOT.txt (opcional)
```

## 13.2 ACL obligatoria post-install
`grant_clinic_data_access.ps1` concede a `BUILTIN\Users` (SID `S-1-5-32-545`) **Modify (OI)(CI)** sobre el árbol ProgramData. Sin esto, doble clic falla con DB readonly.

## 13.3 Autostart
Tarea `NKDentalSoft Server`, ONLOGON, grupo Users, HighestAvailable, acción `--foreground`. Creación vía `Register-ScheduledTask` o `schtasks /XML` (nunca ArgumentList sin comillas).

## 13.4 Firewall
Reglas TCP 8001 y UDP 37020 + allow EXE (best-effort).

## 13.5 Railway
Variables: `APP_ENV=production`, `JWT_SECRET`, `MAINTENANCE_ACCESS_KEY`, `PUBLIC_APP_URL`, `CORS_ORIGINS`, `DATABASE_URL`, `DEMO_MODE=false`. No definir `NEXT_PUBLIC_API_URL`.

## 13.6 Artefactos dist
- `NKDentalSoft-Server-Setup-x64.exe`
- `NKDentalSoft-Client-Setup-x64.exe`
- Clean-All / Desinstalador total (conservan datos clínicos salvo clean total)

---


# 14. MODELO DE DOMINIO

## 14.1 Bounded contexts
1. **Identidad y acceso** — User, roles, modules, JWT, password reset, vendor rescue.
2. **Paciente y ficha** — Patient, ClinicalRecord, evolution, specialties.
3. **Odontología gráfica** — Odontogram entries/changelog/snapshots, periodontogram, tooth media.
4. **Agenda** — Appointment, reminders.
5. **Caja** — CashSession, CashTransaction, allocation.
6. **Documentos** — DocumentGenerated, PDFs, consentimientos, WhatsApp meta.
7. **Configuración clínica** — ClinicSettings, hours, specialties, branding.
8. **Continuidad** — Backup settings/history, restore merge, maintenance cycle.
9. **Tiempo real** — WebSocket events.
10. **Integraciones** — WhatsApp Cloud, SMTP/Resend.

## 14.2 Agregados clave
| Agregado | Raíz | Invariantes |
|---|---|---|
| Paciente | `patients` | `numero_ficha` unique; documento compuesto unique; soft-delete |
| Historia | `clinical_records` | 1:1 patient_id unique |
| Odontograma | entries por (patient, pieza, dentición) unique | changelog audita |
| Sesión caja | `cash_sessions` | una abierta (`open_lock=1`) |
| Cobro | `cash_transactions` | anulación no borra; allocation actualiza `a_cuenta` |
| Clínica | `clinic_settings` | singleton ID fijo |

## 14.3 Lenguaje ubicuo (extracto)
| Término | Significado |
|---|---|
| Ficha | Paciente + número `numero_ficha` / display `FC-#####` |
| Evolución | Entrada clínica con costo/`a_cuenta`/estado |
| Plan item | Elemento JSON del plan (`pi_…`) |
| Sesión de caja | Turno abierto/cerrado |
| Grupo de pago | `grupo_pago_id` cobro mixto |
| Merge clínico | Restore que fusiona tablas clínicas preservando schema app |
| Connect card | Internet Shortcut con URL LAN |

---

# 15. MODELO ENTIDAD-RELACIÓN (TEXTUAL)

## 15.1 Cardinalidades
```
User 1──* Appointment (doctor)
User 1──* CashSession
User 1──* ClinicalEvolutionEntry (doctor)
Patient 1──1 ClinicalRecord
Patient 1──* ClinicalEvolutionEntry
Patient 1──* OdontogramEntry
Patient 1──* OdontogramChangeLog
Patient 1──* OdontogramSnapshot
Patient 1──* PeriodontogramEntry
Patient 1──* ToothMedia
Patient 1──* ComplementaryTestFile
Patient 1──* HistoricalDocument
Patient 1──* Appointment
Patient 1──* CashTransaction (nullable)
Appointment 1──* AppointmentReminder
CashSession 1──* CashTransaction
ClinicalEvolutionEntry 0..1──* CashTransaction (evolution_entry_id)
ClinicalEvolutionEntry 0..1──* OdontogramSnapshot
User 1──* PasswordResetToken
User 0..* RevokedToken
ClinicSettings 1 (singleton)
BackupSettings 1 (singleton)
BackupHistory * (no restaurar)
DocumentGenerated * (patient nullable)
ClinicalAuditLog * (patient nullable)
```

## 15.2 Notas ER
- No hay cascadas ORM declaradas salvo `password_reset_tokens.user_id` ON DELETE CASCADE.
- `CashSession.cerrada_por_id` y `CashTransaction.anulado_por_id` sin FK declarado (histórico).
- `plan_item_ref` / `plan_item_id` son referencias lógicas al JSON del plan, no FK SQL.

---

# 16. DICCIONARIO DE DATOS

## 16.1 Inventario de tablas (22 modelos)

### users
PK `id` UUID. `nombre`, `username` UNIQUE, `email` UNIQUE nullable, `password_hash`, `rol` (ADMIN|DOCTOR|ASISTENTE|CAJERO), `activo`, `token_version` int, `modulos_acceso` Text JSON, `created_at`.

### revoked_tokens
PK `jti`. `expires_at`, `user_id` FK users nullable, `reason`, `revoked_at`. **Nunca restore.**

### patients
PK `id`. `numero_ficha` UNIQUE int. Identidad: nombres, apellidos, tipo_documento, numero_documento (UNIQUE compuesto). Demografía: fecha_nacimiento, telefono, email, direccion, contacto_emergencia, alergias, lugar_nacimiento, ocupacion, estado_civil, sexo. Tutor: nombre/parentesco/telefono/documento_responsable. `especialidad` (legacy) + `especialidades` JSON. Migración: `es_migrado`, `fecha_ingreso_clinica`, `resumen_historia_previa`. `activo`, `created_at`.

### clinical_records
PK `id`. `patient_id` UNIQUE FK. Textos clínicos + `plan_tratamiento` JSON + consentimiento/firmas + `doctor_responsable_id` + `updated_at`.

### clinical_evolution_entries
PK `id`. FK patient, doctor nullable. `especialidad`, `tratamiento_descripcion`, `pieza_fdi`, `cantidad`, `costo_unitario`, `costo`, `a_cuenta`, `estado` (pendiente|en_proceso|completado), `plan_item_id`, `proxima_cita_fecha`, `origen` (tiempo_real|migracion), `fecha`, `created_at`.

### odontogram_entries
UNIQUE (patient_id, pieza_fdi, denticion). `estado` default sano, `superficies` JSON M/D/V/L/O, notas, updated_at.

### odontogram_change_log / odontogram_snapshots
Auditoría y copias JSON completas; snapshot puede ligar `evolution_entry_id`.

### periodontogram_entries
UNIQUE (patient, pieza, denticion). movilidad, recesión, sondaje V/L/M/D, sangrado, placa, notas.

### tooth_media / complementary_test_files / historical_documents
Metadatos de archivos en disco (`stored_path`, content_type, size, uploaded_by).

### appointments / appointment_reminders
Citas con estado, especialidad, `recordatorio_enviado`. Reminders canal whatsapp, estado pendiente/enviado.

### cash_sessions / cash_transactions
Sesión: monto_inicial/final, open_lock UNIQUE, monto_contado, diferencia, cierre_notas, estado abierta|cerrada.  
Tx: tipo ingreso|egreso, concepto, monto, metodo_pago, grupo_pago_id, plan_item_ref, pieza_fdi, evolution_entry_id, anulado+motivo.

### documents_generated
tipo, formato, archivo_ref, marcado_enviado_whatsapp_en.

### clinic_settings
Singleton. Horario, identidad (RUC, dirección, COP, logo_path), especialidades JSON, reminder_*, maintenance_cycle_started_at.

### backup_settings / backup_history
Config y bitácora local del módulo backup. **Nunca restore.**

### password_reset_tokens
token_hash UNIQUE, code_hash, code_plain, expires_at, used_at, email_sent.

## 16.2 Catálogos no tabulares
- Condiciones odontograma: 37 IDs en `odontogram/conditions.py` (34 grilla + abrasion/erosion/anomalia_des).
- Superficies: M D V L O.
- Especialidades default: lista en `constants/especialidades.py` (override en clinic_settings).
- Módulos: dashboard, pacientes, agenda, caja, reportes, configuracion.
- Plan JSON: `{active_id, alternatives:[{id,nombre,items[]}]}` — ver `odontogram/plans.py`.

## 16.3 Alembic HEAD
`r13patient_especialidades`. Cadena desde baseline UUID SQLite documentada en inventario de migraciones del repo (`backend/alembic/versions/`).

---

# 17. REGLAS DE NEGOCIO

| ID | Regla | Enforcement |
|---|---|---|
| RN-01 | Máx. 2 ADMIN | users create/update |
| RN-02 | ADMIN siempre todos los módulos | `normalize_modules` |
| RN-03 | dashboard always-on | `ALWAYS_ON` |
| RN-04 | Una sola caja abierta | `open_lock` UNIQUE = 1 |
| RN-05 | Anulación de tx no elimina fila | `anulado=true` |
| RN-06 | Ingreso asigna a deudas/plan/evolución | `allocate_ingreso` |
| RN-07 | Autoridad de `a_cuenta` = Σ cash no anulado | sync post-allocation |
| RN-08 | Caja nunca offline | `apiOffline` hard ban |
| RN-09 | DEMO bloquea username/password Admin | `demo_guard` 403 |
| RN-10 | logout-all / reset pwd / restore / vendor rescue → `token_version++` | auth/backup/vendor |
| RN-11 | Paciente soft-delete | `activo=false` |
| RN-12 | Documento paciente unique (tipo+número) | índice UX |
| RN-13 | Odontograma unique pieza+dentición | índice + ensure |
| RN-14 | Restore requiere `CONFIRMAR` | backup router |
| RN-15 | Restore merge; nunca full replace path feliz | sqlite_restore |
| RN-16 | Tablas sistema no restaurables | SYSTEM_TABLES_NEVER_RESTORE |
| RN-17 | WhatsApp PDF: Cloud→retry→share→desktop | documentSender |
| RN-18 | Teléfono PE normalizado al enviar docs | whatsapp_cloud / FE |
| RN-19 | Rate limits login/setup/forgot/vendor | rate_limit |
| RN-20 | Production exige JWT_SECRET seguro y MAINTENANCE_ACCESS_KEY | config guards |

### Algoritmo allocation (RN-06/07) — pseudocódigo
```
allocate_ingreso(tx):
  reconcile_plan_evolution_costs()
  if target evolution_entry_id or plan_item_id:
      apply_to_target or AllocationError
  else:
      waterfall over list_payment_targets(patient)
  flush
  sync_evolution_a_cuenta_from_cash(patient)  # sum ingresos no anulados
```

### Plan item estados
`pendiente` | `en_proceso` | `completado`

### Orígenes evolución/snapshot
`tiempo_real` | `migracion`

---

# 18. CASOS DE USO

| ID | Actor | Caso | Resultado |
|---|---|---|---|
| CU-01 | IT | Instalar Server Setup como Admin | EXE+web+task+ACL; datos en ProgramData |
| CU-02 | Admin | Setup primer usuario | POST /api/auth/setup |
| CU-03 | Usuario | Login | JWT access+refresh |
| CU-04 | Asistente | Alta paciente | Ficha + especialidades |
| CU-05 | Doctor | Registrar odontograma | PUT pieza + changelog |
| CU-06 | Doctor | Proponer tratamiento a plan | plan JSON + sync evolución |
| CU-07 | Doctor | Evolución clínica | POST evolution |
| CU-08 | Asistente | Crear cita | Appointment + reminder job |
| CU-09 | Cajero | Abrir caja | open_lock |
| CU-10 | Cajero | Cobro mixto | transactions + allocation |
| CU-11 | Cajero | Emitir comprobante + WhatsApp | documents + documentSender |
| CU-12 | Cajero | Cerrar caja | arqueo monto_contado |
| CU-13 | Admin | Generar backup | ZIP clinical_data |
| CU-14 | Admin | Restaurar backup | CONFIRMAR + merge |
| CU-15 | Usuario | Forgot/reset password | SMTP/Resend o inline LAN |
| CU-16 | Vendor | Rescue Admin | /ops/nk-svc + RESCATAR |
| CU-17 | Client PC | ConnectClinic pegar URL | Edge --app |
| CU-18 | Demo visitor | Usar Admin compartido | DEMO_MODE lock |

---

# 19. FLUJOS

## 19.1 Arranque desktop
1. Logon → Task `--foreground` (o Start-Server).
2. `prepare_environment` carga `.env`, init clinic si falta, HOST=0.0.0.0, DB ProgramData.
3. bootstrap schema + ensure_*.
4. uvicorn listen 8001.
5. Usuario doble clic Open-UI.bat → `--desktop` espera HTTP `/api/system/health` → WebView2/browser.

## 19.2 Atención clínica (día)
Login → Agenda → abrir ficha → Evaluación (odontograma/plan) → Seguimiento (evolución) → Caja cobro → PDF/WhatsApp → (fin día) cierre caja.

## 19.3 Offline seguro
Offline → encolar patient/evolution → online + health OK → flush con Idempotency-Key. Caja rechazada offline.

## 19.4 Restore clínico
Validate ZIP → CONFIRMAR → safety backup → merge tablas clínicas + medios → heal schema → bump token_version → 503 durante proceso → re-login.

## 19.5 WhatsApp documento
Ver §24 orden fijo 1–4.

## 19.6 Logout-all
POST `/api/auth/logout-all` → token_version++ → todos los JWT con ver antigua fallan.

---

# 20. DIAGRAMAS (DESCRITOS TEXTUALMENTE)

## 20.1 Contenedores C4
- **Browser/WebView** habla HTTPS/HTTP same-origin con **Server Process**.
- **Server Process** habla SQLite file + filesystem medios + opcional Meta Graph + SMTP/Resend.
- **Client ConnectClinic** solo lanza browser hacia Server.

## 20.2 Secuencia cobro
Cajero UI → POST /cash/transactions → allocate_ingreso → update evolution/plan a_cuenta → commit → WS cash.transaction.created → UI refresh deudas.

## 20.3 Secuencia desktop failure modes
--desktop → port closed → start detached --foreground → wait HTTP → if child dead/mutex stale → recover/retry/in-process → if data not writable → mensaje repair_startup (no timeout opaco).

## 20.4 ER resumido
Ver §15.

---

# 21. SERVICIOS

| Servicio | Archivo | Responsabilidad |
|---|---|---|
| payment_allocation | services/payment_allocation.py | Dinero → deudas |
| backup_service | services/backup_service.py | ZIP/restore/jobs |
| sqlite_restore | sqlite_restore.py | merge clínico |
| whatsapp_cloud | services/whatsapp_cloud.py | Meta Graph PDF |
| pdf_generator / pdf_helpers / ticket_comprobante | services/* | PDFs |
| demo_guard | services/demo_guard.py | lock Admin demo |
| vendor_rescue | services/vendor_rescue.py | break-glass |
| lan_discovery / lan_network / firewall_lan / mdns_announce / connect_card | services/* | LAN (congelado) |
| password_reset / mailer | services/* | recuperación |
| maintenance_cycle | services/maintenance_cycle.py | ciclo 12m |
| clinic_profile | services/clinic_profile.py | branding |
| dashboard_service / reports_service / cash_overview | services/* | lecturas |
| plan_evolution_sync | services/plan_evolution_sync.py | plan↔evolución |
| reminder_messages | services/* | textos reminder |
| consent_official_templates | services/* | COP |
| patient_especialidades / patient_access / audit | services/* | soporte dominio |

---

# 22. APIs

## 22.1 Convenciones
- Base: `/api`
- Auth: Bearer access JWT (también cookie/query en casos desktop/WS)
- Errores: HTTP + `detail` español
- PDF: `application/pdf` bytes + filename headers

## 22.2 Mapa por dominio (resumen normativo)
Ver inventario exhaustivo en auditoría 2026-09-02 (código vivo). Endpoints críticos:

### Auth
setup-status, setup, login, refresh, logout, logout-all, change-password, forgot/validate/reset-password, password-reset-requests (ADMIN).

### Users
CRUD admin, /me, /doctors, reset-password admin.

### Patients
search, CRUD, deactivate/reactivate.

### Clinical
record, consentimiento, evolution CRUD, financial, payment-targets.

### Odontogram / Periodontogram / Media / Complementary / Historical / Audit
CRUD según routers homónimos.

### Appointments + Config
citas/reminders; hours; especialidades; clinic branding público; clinic ADMIN; logo.

### Cash
session open/close, transactions, void, deudas, movements, patient history.

### Documents
comprobante, cierre-caja, ficha, evolucion, consentimiento(+tipos), presupuesto, whatsapp-sent markers.

### Reports / Dashboard
resumen, caja, pacientes, tratamientos; /dashboard/home.

### WhatsApp integration
status, share, send-document, metrics.

### System / Maintenance / Vendor / Backup
health, version, env-check, lan, connect-info, connections; maintenance status/reset; vendor list-admins/rescue; backup settings/generate/history/download/validate/restore/restore-bootstrap.

### Realtime
WS `/api/ws?token=`

## 22.3 Contratos WS eventos
`realtime.connected`, `pong`, `patient.*`, `appointment.*`, `clinical.evolution.*`, `odontogram.updated`, `cash.session.*`, `cash.transaction.*`.

---

# 23. EVENTOS

| Evento | Emisor | Consumidores |
|---|---|---|
| patient.created/updated | patients router | Clients WS |
| appointment.created/updated/deleted | appointments | Clients WS |
| clinical.evolution.created/updated | clinical | Clients WS |
| odontogram.updated | odontogram | Clients WS |
| cash.session.opened/closed | cash | Clients WS |
| cash.transaction.created/voided | cash | Clients WS |
| Scheduler reminders tick | APScheduler | DB reminders |
| Scheduler backup tick | APScheduler | ZIP si due |
| Install autostart | NSIS/ps1 | Task + ACL |

No hay bus externo (Kafka etc.). Eventos = WS in-process `connection_manager`.

---

# 24. INTEGRACIONES

## 24.1 WhatsApp Cloud API (opcional)
Env: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_API_VERSION`, timeouts.  
Backend only: upload media + send document. Teléfono PE `51…`.

### Orden obligatorio envío PDF
1. `POST /api/integrations/whatsapp/share`  
2. `POST .../send-document` si falló y no `CLOUD_API_NOT_CONFIGURED`  
3. Web Share API files  
4. WhatsApp Desktop/Web + clipboard PDF (sin Guardar como en ese clic)

## 24.2 SMTP / Resend
Password reset emails. `PASSWORD_RESET_INLINE_CODE` para LAN air-gapped.

## 24.3 Windows
Firewall netsh, Scheduled Tasks, WebView2/Edge, folder picker backup.

## 24.4 No integradas
SUNAT, RENIEC, pasarelas pago, Twilio SMS, Google Calendar.

---

# 25. SEGURIDAD

## 25.1 Autenticación
- Passwords bcrypt (truncate 72).
- JWT HS256: access 480 min + role + jti + ver; refresh 7 días.
- Revocación jti + token_version.

## 25.2 Autorización
Roles + módulos. ADMIN bypass módulos=all.

## 25.3 Rate limiting
Login 10/min, setup 3, forgot 5; vendor/maintenance/bootstrap acotados.

## 25.4 Secretos
`.env` ProgramData; production aborta secretos default/cortos.

## 25.5 Vendor
`MAINTENANCE_ACCESS_KEY` ≥16 ≠ legacy `Solo,yo1532`. Rescue requiere frase `RESCATAR`.

## 25.6 DEMO
Bloqueo credenciales Admin; resto usable.

## 25.7 Superficie pública
setup-status, login, branding/logo, health/version, connect-info, client-manifest, forgot/reset flows, vendor endpoints (key), restore-bootstrap (users=0).

---

# 26. AUDITORÍA

| Mecanismo | Tabla/canal | Qué registra |
|---|---|---|
| clinical_audit_log | DB | entity_type/action/detail |
| odontogram_change_log | DB | antes/después pieza |
| backup_history | DB local | runs backup (no merge restore source) |
| documents whatsapp markers | documents_generated | enviado |
| logs startup/foreground | filesystem | arranque desktop |
| WS actor field | realtime | userId emisor |

No hay SIEM externo.

---

# 27. LOGS

| Log | Ubicación | Contenido |
|---|---|---|
| startup.log | ProgramData/logs | prepare_environment, schema, listen, desktop ensure |
| foreground.log | ProgramData/logs | stdout/stderr hijo --foreground |
| install_autostart.log | ProgramData/logs | task/ACL post-install |
| grant_data_access.log | ProgramData/logs | icacls |
| lan_repair.log | ProgramData/logs | repair_lan |
| App logger | dentalfacil.* | uvicorn/app |

Niveles: INFO normal; WARNING mDNS skip / upgrade notes; ERROR fallos schema/uvicorn.

---

# 28. TELEMETRÍA

## 28.1 Actual
- Health payload: db, migrations, schema, jwt, ui_mounted, user_count, railway_warnings.
- WhatsApp `POST /metrics` (client fallback counters) — best effort.
- Scheduler health embebido en /health.

## 28.2 No implementado
APM, OpenTelemetry export, analytics de producto, crash reporting cloud.

---

# 29. MOTOR DE REGLAS

No hay motor DROOLS/externo. Reglas = código Python + validaciones Pydantic + guards FastAPI + invariants SQL (unique/open_lock) + políticas FE (`validators.ts`, `roles.ts`).

Puntos de extensión naturales futuros: centralizar RN-* en un registry; hoy viven en services/routers.

---

# 30. ALGORITMOS

| Algoritmo | Ubicación | Descripción |
|---|---|---|
| allocate_ingreso | payment_allocation.py | Waterfall cobros |
| sync a_cuenta | payment_allocation.py | Σ cash autoridad |
| plan↔evolution sync | plan_evolution_sync.py | Consistencia costos |
| FDI↔Universal | odontogram/numbering.py | Mapas permanente/temporal |
| Legacy estado map | conditions.py | Sano/obturado→canónico |
| Search pacientes | patients router | Tokens nombre/DNI/ficha |
| Desktop wait_until_ready | desktop_runtime.py | Poll HTTP + child liveness |
| data_writable | desktop_runtime.py | Detecta ACL readonly |
| Merge clinical restore | sqlite_restore.py | Column intersection copy |
| Reminder generation | appointments job | Citas → mensajes |
| Password reset | password_reset.py | SHA-256 token + código 6 |
| Normalize PE phone | whatsapp helpers | 9 dígitos → 51… |

---

# 31. MOTOR IA

**Ausente en runtime.** Ver §9. Cualquier feature futura debe:
1. Ser opt-in.
2. Auditar prompts y salidas.
3. No mutar plan/diagnóstico sin confirmación.
4. Documentarse en §32 antes de merge.

---

# 32. PROMPTS OFICIALES

## 32.1 Estado
Sin prompts de producto en backend.

## 32.2 Prompts de gobernanza de desarrollo (referencia)
- Reglas Cursor: document-whatsapp-sender, backup-restore-clinical-data, lan-client-server-freeze, installers-on-demand.
- Skills de diseño no afectan runtime clínico.

## 32.3 Plantillas de mensaje (no LLM)
- `reminder_template` en clinic_settings / reminder_messages.py.
- Textos DEMO_ADMIN_CREDENTIALS_DETAIL.
- Consentimientos COP en consent_official_templates.py (texto clínico legal, no prompt IA).

---

# 33. CATÁLOGO DE DOCUMENTOS

| Tipo | Endpoint / origen | Formatos | Envío WA |
|---|---|---|---|
| Comprobante caja | `/api/documents/comprobante/{tx}` | 80mm, A5, A4 | Sí (universal) |
| Cierre caja | `/api/documents/cierre-caja/{session}` | 80mm/A5/A4 | Sí |
| Ficha clínica | `/api/documents/ficha/{patient}` | A4/A5/80mm | Sí |
| Evolución | `/api/documents/evolucion/{entry}` | idem | Sí |
| Consentimiento | `/api/documents/consentimiento/{patient}` + tipos | A4… | Sí |
| Presupuesto | `/api/documents/presupuesto/{patient}` | idem | Sí |
| Reportes | `/api/reports/*` | json/pdf/csv | Según UI |
| Connect card | connect.url / .url escritorio | Internet Shortcut | N/A |
| Backup ZIP | `/api/backup/generate` | zip | N/A |

Regla: todo PDF clínico/caja usa DocumentActions/ShareDocumentButton.

---

# 34. UX

## 34.1 Principios
- Español clínico claro.
- Desktop-first clínica; mobile bottom nav asistente.
- Feedback DocumentSendToast único canal WA.
- Offline visible en Topbar; caja nunca silenciosa offline.

## 34.2 Accesibilidad adaptativa
localStorage `nk-ds:ui:*`: density comfortable/compact, font-scale 90–130%, contrast high, reduced-motion.

## 34.3 Atajos
11 atajos en `shortcuts.ts`, gated por módulo; editables en Configuración → Interfaz.

## 34.4 Idle / resume
IdleSessionGuard, DesktopResumeGuard.

## 34.5 Ficha UX
3 tabs: Historia | Evaluación y plan | Seguimiento clínico.

---

# 35. UI

## 35.1 Design system pragmático
Tailwind + componentes `components/ui/*` + BrandLogo + tokens densidad/contraste vía data-attributes.

## 35.2 Navegación
Sidebar rail + Topbar + MobileBottomNav. Items filtrados por `canAccessHref`.

## 35.3 Odontograma UI
**Producción:** `OdontogramaAnatomico` (SVG FDI).  
**Prohibido en prod:** `_deprecated/odontogram-realista` (Konva).

## 35.4 Caja UI
OpenCashPanel → Dashboard sesión → Income/Expense → Debts → Close confirm/summary → void.

## 35.5 Config secciones
datos, cuenta, usuarios, recuperacion, horario, especialidades, recordatorios, equipos, interfaz, privacidad, respaldo.

## 35.6 Login
LoginPremiumShell; setup; restore bootstrap; forgot/reset; banner DEMO.

---


# 36. TESTING

## 36.1 Propósito
Definir la red de seguridad mínima para no romper dinero, auth, restore ni desktop.

## 36.2 Backend (pytest)
~31 archivos / ~139 tests en `backend/tests/`.

| Área | Archivos representativos |
|---|---|
| Auth/RBAC | test_auth, test_auth_rate_limit, test_users_roles, test_user_modules, test_module_api_acl, test_jwt_secret_guard, test_password_reset, test_demo_mode |
| Pacientes/clínica | test_patients, test_alta_retroactiva, test_odontogram_unique, test_plan_auto_sync, test_complementary_tests |
| Caja/dinero | test_cash, test_payment_allocation |
| Docs/WA | test_documents, test_pdf_helpers, test_whatsapp_integration |
| Backup | test_backup (incluye preservación settings destino) |
| System/vendor | test_system, test_vendor_rescue, test_maintenance_cycle, test_dashboard, test_reports_pacientes |
| Packaging helpers | test_desktop_runtime, test_generate_production_secrets, test_frontend_static, test_alembic_config_path |
| Otros | test_appointments, test_uuid_chain, test_prefetch_and_logging |

`conftest.py` fuerza `DEMO_MODE=false` salvo tests que lo activan.

## 36.3 Frontend
- Vitest: api/documentSender/whatsapp phone, etc.
- Playwright e2e: `frontend/e2e/ux-layout.spec.ts` (viewports/density/a11y).

## 36.4 Gaps conocidos (no inventar cobertura)
- Sin suite de carga.
- Cobertura WebSocket limitada.
- Periodontograma UI sin e2e profundo.
- No CI/CD cloud obligatorio en repo (ver §37).

## 36.5 Criterios de aceptación por cambio
| Cambio | Tests mínimos |
|---|---|
| Caja/allocation | test_cash + test_payment_allocation |
| Restore | test_backup verdes + preservar backup_settings |
| Auth | test_auth + logout-all |
| Desktop startup | test_desktop_runtime |
| WhatsApp docs | test_whatsapp_integration |
| Módulos ACL | test_module_api_acl |

---

# 37. DEVOPS

## 37.1 Build Server
`packaging/scripts/build_server.ps1`:
1. venv `.venv-build` Python 3.12
2. pip backend + pyinstaller + pywin32 + pywebview
3. `npm run build:desktop`
4. PyInstaller `packaging/server/pyinstaller.spec` onedir
5. Copiar web/scripts/bats (**no** soltar `server_entry.py` suelto)
6. NSIS `installer.nsi` → dist Setup
7. Firma Authenticode opcional

## 37.2 Build Client
`build_client.ps1 -ForceNsis` → compile ConnectClinic.cs → NSIS Client.

## 37.3 Build all
`build_all.ps1` = Server + Client. **Solo bajo demanda explícita.**

## 37.4 Upgrade in-place Server
stop_for_upgrade → prepare_overwrite (purge product tree, **no** ProgramData) → copy onedir → register_desktop_autostart (ACL+task) → healthcheck.

## 37.5 Railway
Deploy backend sirviendo SPA; vars en docs Railway; helper `scripts/railway_apply_vars.ps1` si existe.

## 37.6 CI
No hay pipeline cloud mandatorio documentado como verde permanente. Calidad = pytest local + builds packaging.

## 37.7 Versionado
| Capa | Fuente |
|---|---|
| Producto API | `backend/app/version.py` = 1.0.0 |
| Installer Server | `PRODUCT_VERSION` NSIS 4.0.3 |
| Installer Client | 4.0.0 |
| BUILD_ID | archivo en onedir Server |

---

# 38. ROADMAP

## 38.1 Hecho (baseline v6.0)
Desktop LAN + Cloud, ficha completa, odontograma anatómico, caja+allocation, docs+WA universal, backup merge, DEMO_MODE, offline parcial, UX adaptativo, vendor rescue, ACL/autostart 4.0.3.

## 38.2 Deuda técnica priorizada
1. Ocultar consola de tarea `--foreground` (evitar “PowerShell colgado” percibido) sin romper autostart.
2. Sustituir `Query(..., regex=)` por `pattern=` (FastAPI deprecation).
3. Ampliar e2e clínicos (caja, odontograma, restore).
4. CI automatizado pytest + typecheck.
5. Formalizar ARCO/privacidad si mercado lo exige.

## 38.3 Posibles evoluciones (no comprometidas)
- Motor IA clínico opt-in (§31).
- Facturación electrónica.
- Multitenancy verdadero.
- App móvil nativa.

## 38.4 Congelado
LAN Client↔Server design.

---

# 39. RIESGOS

| ID | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| RK-01 | DEMO_MODE=true en clínica real | Admin no cambia clave | Default false; documentar |
| RK-02 | Full replace restore | “Baja de versión” | Prohibido; merge only |
| RK-03 | ACL ProgramData Admin-owned | Solo abre como Admin | grant_clinic_data_access |
| RK-04 | Task ONLOGON no registrada | Tras reboot no hay server | exit 3 install + repair_startup |
| RK-05 | Consola foreground visible | Usuario cree que está colgado | UX/docs + fix ocultar |
| RK-06 | SQLite en red SMB | Corrupción | Arquitectura 1 Server |
| RK-07 | Scheduler in-process Railway | Jobs se pierden al sleep | Conocido; volumen persistente |
| RK-08 | SmartScreen/Defender primer escaneo | Timeout arranque | waits largos 4.0.2 |
| RK-09 | Mutex zombie | Segundo foreground sale | recover stale + HTTP wait |
| RK-10 | Offline conflict edits | Duplicados/last-write | Gap; Idempotency-Key parcial |
| RK-11 | Tocar LAN congelada | Regresión clínica | Regla freeze |
| RK-12 | Secretos default en prod | Compromiso | boot guards |

---

# 40. LIMITACIONES

1. Sin 2FA / SSO.
2. Sin facturación SUNAT.
3. Sin RENIEC.
4. Sin multi-clínica en un DB.
5. Sin motor IA clínico.
6. Offline incompleto (solo subset mutaciones).
7. mDNS opcional; contrato real = IP.
8. Una sesión de caja abierta global (no multi-caja paralela por usuario diseñada vía open_lock único).
9. Sin módulo ARCO formal.
10. WebSocket sin auth refresh automático sofisticado (re-connect client-side).
11. Odontograma realista deprecado no soportado.
12. Telemetría APM ausente.
13. CI cloud no garantizado.
14. Postgres soportado pero camino feliz clínica = SQLite desktop.

---

# 41. ADR (ARCHITECTURE DECISION RECORDS)

### ADR-001 — SQLite mono-clínica en desktop
**Contexto:** Consultorios sin DBA.  
**Decisión:** SQLite en ProgramData; un Server.  
**Consecuencias:** Simple backup ZIP; no SMB; upgrades via merge.

### ADR-002 — Same-origin SPA+API en :8001
**Decisión:** Embebido `web/` en Server.  
**Consecuencias:** Sin CORS LAN doloroso; Clients apuntan a IP:8001.

### ADR-003 — JWT + token_version + revoked jti
**Decisión:** Doble mecanismo revocación.  
**Consecuencias:** logout-all y restore fuerzan re-login.

### ADR-004 — RBAC rol + módulos
**Decisión:** `modulos_acceso` JSON.  
**Consecuencias:** Cajero sin reportes; ADMIN full.

### ADR-005 — Caja nunca offline
**Decisión:** Hard ban.  
**Consecuencias:** Integridad financiera > continuidad UX.

### ADR-006 — Allocation server-side SSOT
**Decisión:** `payment_allocation` autoridad de `a_cuenta`.  
**Consecuencias:** UI no “inventa” saldos.

### ADR-007 — Restore merge clínico
**Decisión:** `merge_clinical_keep_app_schema`.  
**Consecuencias:** Software destino manda esquema; pacientes migran.

### ADR-008 — WhatsApp universal en RAM
**Decisión:** documentSender cascada; Meta solo backend.  
**Consecuencias:** Un clic Cloud cuando hay token; fallbacks locales.

### ADR-009 — LAN congelada
**Decisión:** No rediseñar discovery/bind tras clínica OK.  
**Consecuencias:** Estabilidad operativa > experimentación.

### ADR-010 — Desktop-first sin servicio Win32 zombie
**Decisión:** Scheduled Task user session + --foreground; eliminar servicio Session-0.  
**Consecuencias:** UI/WebView confiables; cuidado con consola visible y ACL.

### ADR-011 — DEMO_MODE
**Decisión:** Lock credenciales Admin.  
**Consecuencias:** Demos Railway seguras; peligro si se activa en clínica.

### ADR-012 — Odontograma anatómico SVG
**Decisión:** Retirar Konva realista de prod.  
**Consecuencias:** Menos peso; catálogo 37 condiciones.

### ADR-013 — ensure_* además de Alembic
**Decisión:** DDL idempotente en lifespan.  
**Consecuencias:** DBs stamped viejas ganan columnas sin drama.

### ADR-014 — ACL Users Modify ProgramData
**Decisión:** Script grant post-install.  
**Consecuencias:** Doble clic sin elevación.

### ADR-015 — PyInstaller onedir + NSIS
**Decisión:** Setup = actualizador.  
**Consecuencias:** Un artefacto clínico; no “hotfix” paralelo.

---

# 42. GLOSARIO

| Término | Definición |
|---|---|
| SSOT | Single Source of Truth — este documento + código canónico citado |
| N&K DentalSoft | Nombre producto |
| lan_desktop / web_cloud | Modos runtime FE |
| open_lock | Semáforo SQL una caja abierta |
| a_cuenta | Monto abonado acumulado en evolución/plan |
| grupo_pago_id | ID lógico cobro mixto |
| FDI | Numeración dental internacional |
| ProgramData | `%ProgramData%\NKDentalSoft` datos clínica |
| merge clínico | Restore que copia tablas clínicas sin pisar alembic_version |
| connect card | .url con http://IP:8001/ |
| DEMO_MODE | Lock Admin credentials |
| token_version | Entero en users invalidando JWT viejos |
| documentSender | Sistema universal envío PDF |
| Cloud API | WhatsApp Meta Graph |
| ensure_* | Reparadores schema arranque |
| BUILD_ID | Identificador build onedir |
| ConnectClinic | Cliente LAN WinForms |
| WebView2 | Host UI nativa desktop |
| Idempotency-Key | Header flush offline |
| COP | Colegio Odontológico del Perú (plantillas) |
| Vendor rescue | Break-glass Admin |
| HighestAvailable | RunLevel tarea autostart |

---

# 43. HISTORIAL DE VERSIONES DEL DOCUMENTO

| Versión | Fecha | Cambios |
|---|---|---|
| **v6.0** | 2026-09-02 | SSOT estructura 1–44. Corrige restore merge, WS `/api/ws`, HEAD Alembic r13, desktop 4.0.2/4.0.3 ACL/autostart, inventario 22 modelos/routers/services, ADR, algoritmos, catálogo docs, limitaciones. |
| v5.0 | 2026-08-11 | Contraste DEMO/offline/shortcuts/UX/logout-all (parcial; errores restore/HEAD). |
| v4.0 | 2026-07-30 | Base 27 secciones |
| v3.x–v1.0 | 2026-07 | Iteraciones auditoría previas |

**Política:** Toda decisión arquitectónica nueva debe añadir ADR y actualizar la sección afectada en el mismo cambio de documentación. El código no es SSOT si contradice este documento; en conflicto, **arreglar código o enmendar documento explícitamente** — nunca dejar divergencia silenciosa.

---

# 44. ANEXOS

## Anexo A — Reconstrucción mínima del monorepo

```
DentalSimple/
  backend/
    app/                 # FastAPI app
    alembic/ + alembic.ini
    tests/
    requirements.txt
  frontend/
    src/app, components, lib, hooks
    package.json
    scripts/build-static-export.cjs
  packaging/
    server/  # windows_service.py, server_entry.py, desktop_runtime.py, installer.nsi, scripts/
    client/  # ConnectClinic.cs, installer.nsi
    scripts/ # build_server.ps1, build_client.ps1, build_all.ps1
  docs/      # este SSOT + BACKUP_RESTORE.md + packaging/README.md
  .cursor/rules/  # reglas operativas agentes
```

## Anexo B — Variables de entorno (resumen normativo)

`DATABASE_URL`, `APP_ENV`, `JWT_SECRET`, `JWT_ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `REFRESH_TOKEN_EXPIRE_DAYS`, rate limits, `SMTP_*`, `RESEND_API_KEY`, `PASSWORD_RESET_*`, `MAINTENANCE_ACCESS_KEY`, `APP_NAME`, `PRODUCT_*`, `CLINIC_*`, `CORS_ORIGINS`, `BACKEND_PORT`, `HOST`, `PUBLIC_APP_URL`, `REMINDER_HOURS_BEFORE`, `WHATSAPP_*`, `PDF_CACHE_MAX_SIZE`, `MAX_RETRY_ATTEMPTS`, `DEMO_MODE` / `NKDENTALSOFT_DEMO`, `NKDENTALSOFT_MDNS`, `NKDENTALSOFT_DISABLE_TLS`, `NKDENTALSOFT_FORCE_TLS`, `NKDENTALSOFT_FORCE_BROWSER`, `NKDENTALSOFT_DATA_DIR`, `UPLOAD_DIR`, `TOOTH_MEDIA_ROOT`, `COMPLEMENTARY_TESTS_ROOT`, `HISTORICAL_DOCUMENTS_ROOT`, `ALEMBIC_CONFIG`, `RAILWAY_ENVIRONMENT`.

## Anexo C — Tablas CLINICAL_DATA_TABLES (restore SÍ)
`users`, `patients`, `clinic_settings`, `clinical_records`, `clinical_evolution_entries`, `odontogram_entries`, `odontogram_change_log`, `odontogram_snapshots`, `periodontogram_entries`, `tooth_media`, `complementary_test_files`, `historical_documents`, `appointments`, `appointment_reminders`, `cash_sessions`, `cash_transactions`, `documents_generated`, `clinical_audit_log`, `password_reset_tokens`.

## Anexo D — SYSTEM_TABLES_NEVER_RESTORE
`alembic_version`, `backup_settings`, `backup_history`, `revoked_tokens`.

## Anexo E — Condiciones odontograma (IDs)
caries, corona, corona_temp, ausente, fractura, diastema, obturacion, protesis_remov, desplazamiento, rotacion, fusion, remanente_rad, erupcion, transposicion, supernumerario, pulpa, protesis, perno, ortodoncia_fija, protesis_fija, implante, macrodoncia, microdoncia, discromia, desgaste, impactado_p, intrusion, edentulismo, ectopico, impactado, ortod_remov, extrusion, poste, extraer, abrasion, erosion, anomalia_des.

## Anexo F — Defaults módulos por rol
- ADMIN: all  
- DOCTOR: dashboard, pacientes, agenda, caja, reportes, configuracion  
- ASISTENTE: dashboard, pacientes, agenda, configuracion  
- CAJERO: dashboard, pacientes, caja  

## Anexo G — Checklist instalación clínica Server
1. Setup Admin, misma carpeta previa en upgrade.  
2. Verificar task `NKDentalSoft Server`.  
3. `icacls ...\clinica.db` muestra Usuarios (M).  
4. Doble clic icono abre UI sin “Ejecutar como administrador”.  
5. `http://127.0.0.1:8001/api/system/health` → ok.  
6. Configuración → copiar URL IP para Clients.  
7. No cerrar proceso servidor (si se ve consola, minimizar).  

## Anexo H — Checklist Client
1. Instalar Client Setup.  
2. Pegar `http://IP:8001/`.  
3. Topbar En línea.  

## Anexo I — Archivos congelados LAN (no modificar sin orden)
`packaging/client/ConnectClinic.cs`, `build_client_connector.ps1`, `packaging/client/installer.nsi` (atajos connect/repair), `backend/app/services/lan_network.py`, `lan_discovery.py`, `firewall_lan.py`, `connect_card.py`, scripts `repair_lan.ps1`, `enable_clinic_hotspot.ps1`, `detect_lan_ip.ps1`, BATs Reparar-Red / Hotspot, bind en `server_entry.py`, endpoints connect-info en `system.py`.

## Anexo J — Dependencias runtime backend
Ver `backend/requirements.txt` (FastAPI, uvicorn, SQLAlchemy, Alembic, psycopg, pydantic-settings, bcrypt, PyJWT, reportlab, qrcode, APScheduler, httpx, tzdata, zeroconf, cryptography, pywebview).

## Anexo K — Dependencias frontend
Ver `frontend/package.json` (next, react, lucide-react, pdfjs-dist; tailwind/typescript/vitest/playwright en dev).

## Anexo L — Matriz trazabilidad (extracto)

| Problema §4 | Objetivo | Requisito/RN | Arquitectura | Test |
|---|---|---|---|---|
| Histórico fragmentado | O-B1 | RN-11..13 | §14–16 ficha | test_patients |
| Cobros ambiguos | O-B2 | RN-04..07 | payment_allocation | test_payment_allocation |
| Migración PC | O-B4 | RN-14..16 | sqlite_restore | test_backup |
| Demo vandalizable | O-B5 | RN-09 | demo_guard | test_demo_mode |
| Solo abre Admin | O-T4 | ACL | grant script | test_desktop_runtime |
| LAN frágil | — | R-F1 | LAN freeze | verificación clínica |

## Anexo M — Errores frecuentes y respuesta operativa

| Síntoma | Causa probable | Acción |
|---|---|---|
| FATAL port 8001 | foreground muerto/mutex/AV | logs startup+foreground; repair_startup; wait HTTP |
| Solo Admin abre | ACL RX en clinica.db | grant_clinic_data_access / Setup 4.0.3 |
| Ventana textos uvicorn “colgada” | Task --foreground consola | Minimizar; UI vía icono Open-UI / http://127.0.0.1:8001 |
| Restore “bajó versión” | full replace ilegal | Reinstalar software actual + merge clínico |
| WA no adjunta PDF | usó openWhatsAppText | Usar documentSender |
| schtasks 0x80004005 | ArgumentList sin quotes | register_desktop_autostart con Quote-Arg / cmdlets |

## Anexo N — Procedimiento de reconstrucción (ingeniero nuevo)

1. Leer este SSOT completo.  
2. Crear estructura Anexo A.  
3. Implementar models §16 + migraciones hasta HEAD r13 + ensure_*.  
4. Implementar security/roles/modules.  
5. Implementar routers §22 y services §21.  
6. Implementar FE rutas §11/§35 con RBAC.  
7. Implementar PDFs + documentSender.  
8. Implementar backup merge Anexo C/D.  
9. Empaquetar packaging Server/Client según §37 y README packaging.  
10. Ejecutar batería §36 hasta verde.  
11. Verificar checklist Anexo G/H en Windows 11.  

Si algún paso no está especificado aquí, **está incompleto el SSOT** — enmendar este documento antes de improvisar.

---

# DECLARACIÓN FINAL DE AUTORIDAD

Este Documento Maestro v6.0 es la **memoria permanente** de N&K DentalSoft para desarrollo, mantenimiento, auditoría, pruebas, capacitación y evolución.

- No es marketing.  
- No asume memoria institucional.  
- Ante duda entre conversación oral y este texto, prevalece este texto (y el código citado cuando se enmiende juntos).  

**Fin del Documento Maestro Único — N&K DentalSoft v6.0 (SSOT)**

*Conversión sugerida:*  
`pandoc docs/DOCUMENTO_MAESTRO_NK_DENTALSOFT_v6.0_2026-09-02.md -o N&K_DentalSoft_SSOT_v6.0.docx --toc --toc-depth=3 --from=markdown --to=docx`


## Anexo O — Inventario detallado de modelos (columnas)

### O.1 User (`users`) — `backend/app/models/user.py`
| Columna | Tipo | Nulo | Default | Constraints |
|---|---|---|---|---|
| id | String(36) | No | new_uuid | PK |
| nombre | String(120) | No | | |
| username | String(40) | No | | UNIQUE INDEX |
| email | String(180) | Sí | | UNIQUE INDEX |
| password_hash | String(255) | No | | |
| rol | String(20) | No | DOCTOR | enum lógico Rol |
| activo | Boolean | No | True | |
| token_version | Integer | No | 0 | bump invalida JWT |
| modulos_acceso | Text | Sí | | JSON lista módulos |
| created_at | DateTime(tz) | No | utcnow | |

### O.2 Patient (`patients`) — campos de ciclo de vida
Además de demografía: `especialidad` (string legacy indexado), `especialidades` (JSON lista), `es_migrado`, `fecha_ingreso_clinica`, `resumen_historia_previa`, `activo` (soft-delete), UNIQUE (`tipo_documento`,`numero_documento`), UNIQUE `numero_ficha`.

### O.3 ClinicalRecord
1:1 `patient_id` UNIQUE. Campos texto anamnesis/diagnóstico/observaciones; `plan_tratamiento` JSON canónico; consentimiento_firmado/fecha; firmas texto; doctor_responsable_id; updated_at onupdate.

### O.4 ClinicalEvolutionEntry
Economía: cantidad, costo_unitario, costo, a_cuenta Numeric(10,2). Estados: pendiente|en_proceso|completado. origen tiempo_real|migracion. plan_item_id lógico.

### O.5 OdontogramEntry
denticion permanente|temporal (y valores usados en UI). superficies JSON keys M,D,V,L,O → condicion_id|null. UNIQUE (patient_id, pieza_fdi, denticion).

### O.6 CashSession / CashTransaction
Sesión: open_lock Integer UNIQUE nullable (valor 1 cuando abierta). Cierre: monto_contado, diferencia, cierre_notas, cerrada_por_id, cerrada_en.  
Tx: tipo ingreso|egreso; metodo_pago default efectivo; anulado + anulado_en + anulado_por_id + anulacion_motivo; vínculos evolution_entry_id, plan_item_ref, pieza_fdi, grupo_pago_id, patient_id nullable (egresos).

### O.7 ClinicSettings (singleton)
hora_apertura/cierre HH:MM; identidad fiscal/comercial; logo_path; especialidades JSON; reminder_hours_before; reminder_template; maintenance_cycle_started_at; PK fijo CLINIC_SETTINGS_ID.

### O.8 BackupSettings / BackupHistory
frequency daily|…; preferred_hour; retention_count; keep_manual; backup_directory; last_backup_at. History: triggered_by, status, size_bytes, duration_ms, keep, error_message. **No restore.**

---

## Anexo P — Endpoints REST (contrato reconstruible)

Auth JWT salvo nota. Módulo = require_module.

### P.1 Auth `/api/auth`
| Método | Path | Auth | Notas |
|---|---|---|---|
| GET | /setup-status | público | needs_setup, demo_mode, demo_admin_credentials_locked |
| POST | /setup | público+RL | solo si users=0 |
| POST | /login | público+RL | username/password |
| POST | /refresh | refresh token | |
| POST | /logout | JWT opcional | revoca jti |
| POST | /logout-all | JWT | token_version++ |
| POST | /change-password | JWT | demo guard Admin |
| POST | /forgot-password | RL | anti-enum |
| POST | /validate-reset | RL | |
| POST | /reset-password | RL | token_version++ |
| GET | /password-reset-requests | ADMIN | |

### P.2 Users `/api/users`
GET /doctors (JWT); GET/POST `` (ADMIN); GET/PATCH /me; PATCH /{id} ADMIN; POST /{id}/reset-password ADMIN (demo guard).

### P.3 Patients `/api/patients` módulo pacientes
GET /search?q=; GET/POST ``; GET/PATCH /{id}; POST /{id}/deactivate|reactivate; DELETE /{id}.

### P.4 Clinical `/api/clinical` módulo pacientes
GET/PATCH /{id}/record; PATCH /{id}/consentimiento; GET/POST /{id}/evolution; PATCH /evolution/{entry_id}; DELETE /{id}/evolution/{entry_id}; GET /{id}/financial; GET /{id}/payment-targets.

### P.5 Odontogram `/api/odontogram`
GET /conditions; /treatments/catalog; /treatments/suggest/{condicion_id}; GET /{id}; PUT /{id}/{pieza_fdi}; DELETE /{id}; DELETE /{id}/{pieza_fdi}; GET /{id}/history; GET/POST /{id}/snapshots; GET /{id}/compare?a&b.

### P.6 Periodontogram `/api/periodontogram`
GET /{patient_id}; PUT /{patient_id}/{pieza_fdi}.

### P.7 Tooth-media `/api/tooth-media`
GET/POST /{patient_id}; GET /file/{media_id}; DELETE /{media_id}.

### P.8 Complementary-tests `/api/complementary-tests`
GET /{id}; GET /{id}/organized; POST /{id}; GET /file/{file_id}; DELETE /{file_id}.

### P.9 Historical-documents `/api/historical-documents`
GET /meta; GET/POST /{patient_id}; GET /file/{file_id}; DELETE /file/{file_id}.

### P.10 Audit `/api/audit`
GET /{patient_id}.

### P.11 Appointments `/api/appointments` módulo agenda
GET/POST ``; PATCH/DELETE /{id}; GET /reminders/pending; POST /reminders/{id}/send.

### P.12 Config `/api/config`
GET/PATCH /reminders; GET /hours; PATCH /hours ADMIN; GET/PUT /especialidades; POST /especialidades/reset ADMIN; GET /clinic/branding público; GET/PATCH /clinic; POST /clinic/logo ADMIN; GET /clinic/logo-file público.

### P.13 Cash `/api/cash` módulo caja
GET /session; POST /session/open; POST /session/close; GET /transactions; GET /deudas; GET /movements; GET /transactions/patient/{id} (pacientes|caja); POST /transactions; POST /transactions/{id}/void.

### P.14 Documents `/api/documents`
GET /comprobante/{tx_id}?fmt=; /cierre-caja/{session_id}; /ficha/{patient_id}; /evolucion/{entry_id}; /consentimiento-tipos; /consentimiento/{patient_id}; /presupuesto/{patient_id}; POST /whatsapp-sent; POST /whatsapp-sent/{document_id}.

### P.15 Reports `/api/reports` módulo reportes
GET /resumen; /caja; /pacientes; /tratamientos (query start/end/fmt/csv_export/doctor_id).

### P.16 Dashboard `/api/dashboard`
GET /home.

### P.17 WhatsApp `/api/integrations/whatsapp`
GET /status; POST /share; POST /send-document; POST /metrics.

### P.18 System `/api/system`
GET /health público; /version; /env-check ADMIN; /client-manifest.json; /lan ADMIN; /connect-info público; /connections ADMIN.

### P.19 Maintenance `/api/system/maintenance`
GET /status JWT; POST /reset vendor key.

### P.20 Vendor `/api/system/vendor`
POST /list-admins; POST /rescue-admin-password (RESCATAR).

### P.21 Backup `/api/backup` ADMIN salvo bootstrap
GET/PATCH /settings; POST /choose-directory; GET /suggested-directories; POST /apply-directory; POST /generate; GET /history; GET /{id}/download; DELETE /{id}; POST /validate; POST /restore; POST /restore-bootstrap (users=0).

### P.22 Health alias
GET /api/health = system health.

### P.23 WebSocket
WS /api/ws?token=<access JWT>. Close 4401 si inválido. ping→pong.

---

## Anexo Q — Plan de tratamiento JSON (contrato)

```json
{
  "active_id": "alt_…",
  "alternatives": [
    {
      "id": "alt_…",
      "nombre": "Plan A",
      "items": [
        {
          "id": "pi_…",
          "item": "Obturación",
          "cantidad": 1,
          "costo_unitario": 80.0,
          "a_cuenta": 0.0,
          "estado": "pendiente",
          "origen": "odontogram",
          "pieza_fdi": "16",
          "condicion_id": "caries",
          "evolution_entry_id": null
        }
      ]
    }
  ]
}
```
`estado` ∈ {pendiente, en_proceso, completado}; `origen` ∈ {odontogram, manual}.

---

## Anexo R — Flujo de dinero (caja) detallado

1. Abrir sesión: crea CashSession estado=abierta, open_lock=1, monto_inicial.  
2. Ingreso: valida sesión abierta; crea CashTransaction(s) (una por método si mixto, mismo grupo_pago_id); llama allocate_ingreso; publica WS.  
3. Egreso: sin allocation clínica; concepto/monto.  
4. Void: marca anulado; recalcula a_cuenta; WS voided.  
5. Close: captura monto_contado; calcula diferencia; open_lock=NULL; estado=cerrada; PDF cierre disponible.  
6. Deudas: targets con saldo > 0 desde evolución/plan.

Errores: 409 si ya hay sesión abierta; 400 AllocationError si target inválido; 403 sin módulo caja.

---

## Anexo S — Desktop launcher contrato CLI

```
nkdentalsoft-server.exe --init-clinic [--host IP]
nkdentalsoft-server.exe --foreground | -f
nkdentalsoft-server.exe --desktop [--no-browser]
nkdentalsoft-server.exe          # frozen sin args → desktop
nkdentalsoft-server.exe install|start|stop|remove  # legacy service (evitar)
```

`desktop_runtime.py`: DESKTOP_WAIT_SECONDS=180, RETRY=90, INPROCESS=180; server_ready = HTTP health|/ ; data_writable probe.

---

## Anexo T — Seguridad: claims JWT

Access payload mínimo: `sub`=user_id, `type`=`access`, `role`, `jti`, `ver`=token_version, `exp`.  
Refresh: `type`=`refresh`, `jti`, `sub`, `ver`, `exp`.  
Validación: firma + type + user activo + ver match + jti no revoked.

---

## Anexo U — Especialidades default

Odontología general; Rehabilitación oral; Ortodoncia; Endodoncia; Cirugía bucal y maxilofacial; Prótesis dental; Implantología oral; Estética dental; Otros.

---

## Anexo V — Contadores de verificación (2026-09-02)

| Elemento | Cantidad verificada |
|---|---|
| Modelos SQLAlchemy exportados | 22 |
| Routers API montados | 20 módulos + config + health + ws |
| Condiciones odontograma | 37 |
| Módulos ACL | 6 |
| Roles | 4 |
| Tests backend archivos | 31 |
| Installer Server | 4.0.3 |
| PRODUCT_VERSION app | 1.0.0 |
| Alembic HEAD | r13patient_especialidades |

---

## Anexo W — Corrección explícita de errores del Documento v5.0

| Afirmación v5.0 | Realidad v6.0 |
|---|---|
| Restore reemplaza BD | **Falso** — merge clínico |
| WS `/ws` | **`/api/ws`** |
| HEAD `p5user_modulos` | **`r13patient_especialidades`** |
| Gaps “sin tests backup” | Existen `test_backup.py` y otros |
| Omitía ACL/autostart | Documentado 4.0.2/4.0.3 |

---

## Anexo X — Responsables lógicos (RACI resumido)

| Área | R | A | C | I |
|---|---|---|---|---|
| Dominio clínico | Dev backend | Product Owner | Doctor líder | Asistentes |
| Caja/allocation | Dev backend | Product Owner | Cajero | Admin |
| Packaging desktop | Dev packaging | Architect | IT clínica | Usuarios |
| LAN | — | Congelado | — | Clínica |
| SSOT documento | Architect/TW | Product Owner | Devs | Todos |

---

**Fin Anexos O–X (parte integral del SSOT v6.0)**


