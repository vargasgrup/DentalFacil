# Migration Audit — PostgreSQL → SQLite + Integer PK → UUID

**Fecha:** 2026-07-14  
**Repo:** DentalSimple  
**Alcance:** Infraestructura de datos únicamente (motor + tipo de PK/FK). Sin cambios de lógica clínica del odontograma.

## Resumen ejecutivo

| Hallazgo | Detalle |
|----------|---------|
| Tablas en modelos | **17** (16 con PK `id` entero + `revoked_tokens` con PK `jti` string) |
| JSONB en modelos ORM | **0** (todo `sqlalchemy.JSON`) |
| JSONB en migraciones históricas | Sí (`f1030bfb1b16`, `e2b3c4d5e6f7`, etc.) — **bloquean `upgrade` limpio en SQLite** |
| Índices parciales Postgres | **1**: `ux_patients_tipo_numero_documento` (`postgresql_where`) |
| Triggers / vistas / functions | **Ninguno** en `backend/` (`CREATE TRIGGER\|VIEW\|FUNCTION` → 0 matches) |
| Numeric en caja/evolución | Ya `Numeric(10,2)` — OK (no Float) |
| DateTime TZ | 28 columnas `DateTime(timezone=True)` + `func.now()` — ORM portable; app debe persistir UTC |
| `server_default=sa.text("now()")` | En migraciones históricas (Postgres). Modelos usan `func.now()` (OK en SQLite) |

**Conclusión para Alembic:** las migraciones históricas **no** son ejecutables de punta a punta contra SQLite vacío. Estrategia: SQLite greenfield = `create_all` desde modelos UUID + stamp a `head`; migración nueva documenta el esquema final y opcionalmente convierte Postgres int→UUID; ETL aparte `pg → sqlite` con remapeo de FKs.

---

## 1. Inventario por tabla (modelos actuales)

### Equivalencia de tipos (Postgres → SQLite)

| Tipo ORM actual | Postgres | SQLite | Acción |
|-----------------|----------|--------|--------|
| `Integer` PK | SERIAL | INTEGER | → `String(36)` UUID app-generated |
| `Integer` FK | INT | INTEGER | → `String(36)` |
| `Integer` de negocio (`numero_ficha`, `duracion_minutos`, `token_version`, …) | INT | INTEGER | **Sin cambio** |
| `String` / `Text` | VARCHAR/TEXT | TEXT | Sin cambio |
| `Boolean` | BOOLEAN | INTEGER 0/1 | Sin cambio (SQLAlchemy) |
| `Numeric(p,s)` | NUMERIC | NUMERIC | Sin cambio |
| `Date` | DATE | DATE/TEXT | Sin cambio |
| `DateTime(timezone=True)` | TIMESTAMPTZ | TEXT/NUMERIC | Guardar UTC en app; sin `TIMESTAMPTZ` nativo |
| `JSON` | JSON/JSONB | TEXT JSON | Ya JSON portable |
| `JSONB` (solo migraciones viejas) | JSONB | N/A | No usar en modelos nuevos |

### Tablas y PK/FK a UUID

| # | Tabla | PK actual | FKs → UUID |
|---|-------|-----------|------------|
| 1 | `users` | `id` int | — |
| 2 | `patients` | `id` int | — |
| 3 | `clinic_settings` | `id` int (=1) | → UUID fijo conocido |
| 4 | `appointments` | `id` int | `patient_id`, `doctor_id` |
| 5 | `appointment_reminders` | `id` int | `appointment_id`, `marcado_enviado_por_user_id` |
| 6 | `cash_sessions` | `id` int | `usuario_id` |
| 7 | `cash_transactions` | `id` int | `cash_session_id`, `patient_id` |
| 8 | `clinical_records` | `id` int | `patient_id`, `doctor_responsable_id` |
| 9 | `clinical_evolution_entries` | `id` int | `patient_id`, `doctor_id` |
| 10 | `odontogram_entries` | `id` int | `patient_id` |
| 11 | `odontogram_change_log` | `id` int | `patient_id`, `user_id` |
| 12 | `odontogram_snapshots` | `id` int | `patient_id`, `taken_by`, `evolution_entry_id` |
| 13 | `periodontogram_entries` | `id` int | `patient_id`, `updated_by` |
| 14 | `tooth_media` | `id` int | `patient_id`, `uploaded_by` |
| 15 | `clinical_audit_log` | `id` int | `patient_id`, `user_id` |
| 16 | `documents_generated` | `id` int | `patient_id` |
| 17 | `revoked_tokens` | `jti` string | `user_id` → UUID (PK `jti` se mantiene) |

### Columnas JSON (7)

`clinic_settings.especialidades`, `clinical_records.plan_tratamiento`, `odontogram_entries.superficies`, `odontogram_change_log.superficies_*`, `odontogram_snapshots.entries`, `clinical_audit_log.detail`.

### Columnas Numeric (dinero / perio)

- Caja: `cash_sessions.monto_*`, `cash_transactions.monto` → `Numeric(10,2)` ✓  
- Evolución: `costo`, `a_cuenta` → `Numeric(10,2)` ✓  
- Perio: `recesion_mm`, `sondaje_*` → `Numeric(4,1)` ✓  

### Índice parcial (riesgo SQLite)

```text
ux_patients_tipo_numero_documento ON (tipo_documento, numero_documento)
  postgresql_where = numero_documento IS NOT NULL AND btrim(numero_documento) <> ''
```

**Plan:** en SQLite usar índice único compuesto + unicidad en aplicación (ya existe `_assert_unique_document`), o índice único sobre expresión si se prefiere. No usar `postgresql_where`.

### `server_default` Postgres-específicos

- Migraciones: `sa.text("now()")`, `server_default="false"`, casts `'…'::jsonb`.  
- Modelos: `server_default=func.now()` / `server_default="0"` — preferir también `default=` Python para inserts ORM.

---

## 2. Confirmación: sin triggers / vistas / SP

Búsqueda en `backend/`: `CREATE TRIGGER`, `CREATE VIEW`, `CREATE FUNCTION`, `CREATE PROCEDURE` → **0 coincidencias**.

---

## 3. Impacto fuera de modelos

| Área | Impacto |
|------|---------|
| FastAPI path params | `patient_id: int` → `str` / UUID en todos los routers |
| Schemas Pydantic | `id: int` → `str` |
| Frontend TS | `id: number` → `string` (URLs `/pacientes/[id]` ya son string de ruta) |
| JWT `sub` | Ya es string del user id — pasa a UUID string |
| Tests | Fixtures e asserts contra UUID |
| `clinic_settings` singleton | Dejar de asumir `id=1`; usar UUID constante |
| `DATABASE_URL` | Default `sqlite:///./data/clinica.db`; Postgres opcional |
| Alembic | `render_as_batch=True`; greenfield SQLite sin re-ejecutar 13 revisiones PG |

---

## 4. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| `alembic upgrade` desde 2905… en SQLite falla en JSONB | Bypass: create_all + stamp head en SQLite vacío |
| Pérdida de FKs al convertir | Script de remapeo int→uuid en una transacción |
| Producción Railway aún en Postgres | Mantener `DATABASE_URL` configurable; ETL pg_dump → sqlite antes de corte |
| Frontend asume `id` number | Tipado `string` + sin `parseInt` de ids |

---

## 5. Checklist post-auditoría (Tareas 2–5)

- [x] Inventario completo → este documento  
- [ ] Modelos UUID + engine SQLite (WAL, FK ON)  
- [ ] Alembic batch + migración/baseline nueva  
- [ ] Tests núcleo + E2E FK  
- [ ] Docs ER + Changelog v1.2 + `.env.example`

**Siguiente:** Tarea 2 (modelos + `database.py` / `config.py`).
