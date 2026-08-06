# Respaldo y Migración (Backup / Restore)

Feature en Configuración → **Respaldo y Migración** (solo ADMIN).

---

## REGLA UNIVERSAL DEL MÓDULO

> **Backup y restauración migran datos de la clínica, no el software.**

| | |
|--|--|
| **Objeto del backup/restore** | Pacientes, historia clínica, finanzas (caja), agenda, medios, usuarios/credenciales, identidad del centro |
| **Nunca se restaura** | Interfaz gráfica, binarios, esquema/versión del producto, configuración del módulo de backups del destino |
| **Modo de restore** | Fusión clínica en la BD de la instalación destino (`merge_clinical_keep_app_schema`) |
| **Prohibido** | Reemplazar enteramente `clinica.db` en una instalación existente (revierte `alembic_version` y “baja” la versión efectiva) |

Fuente de verdad en código: `CLINICAL_DATA_TABLES` y `SYSTEM_TABLES_NEVER_RESTORE` en `backend/app/sqlite_restore.py`.  
Regla de agente: `.cursor/rules/backup-restore-clinical-data.mdc`.

Los paquetes **legacy 1.0** se aplican con la **misma** política (merge clínico). No hay excepción de “full replace para backups antiguos”.

---

## Qué incluye el paquete `.zip`

- `manifest.json` — metadatos, política de restore clínico, SHA-256 de la BD, `package_kind: clinical_data`, `restore_mode: merge_clinical_keep_app_schema`
- `database/clinica.db` — snapshot SQLite consistente (fuente de datos; **no** se vuelve a volcar completo sobre destino)
- `uploads/` — tooth_media, complementary_tests, historical_documents, clinic_uploads

## Qué se restaura (formato 1.1+)

**Sí:** pacientes, historia clínica, odontograma/periodontograma, evolución, citas, caja/finanzas, documentos generados, medios, usuarios/credenciales, datos del centro (`clinic_settings`).

**No** (se conservan de la instalación destino):

- Esquema de software / `alembic_version` (se re-sanean migraciones al HEAD de la versión instalada)
- Config del módulo de backups (`backup_settings`, `backup_history`)
- Interfaz estática, binarios y comportamientos propios de la **versión instalada**
- Tokens revocados (se limpian; re-login)

Tras el merge se ejecutan migraciones / `ensure_*_schema` de la app actual y se incrementa `token_version`.

## Uso rápido

1. **Generar:** Configuración → Generar backup ahora → Descargar desde el historial.
2. **Automático:** panel de backups + carpeta configurable.
3. **Restaurar:** validar zip → `CONFIRMAR` → merge clínico (+ safety backup previo).
4. **PC vacía:** wizard → Restaurar backup (`restore-bootstrap`).

## API

| Método | Ruta | Auth |
|--------|------|------|
| GET/PATCH | `/api/backup/settings` | ADMIN |
| POST | `/api/backup/choose-directory` | ADMIN |
| POST | `/api/backup/generate` | ADMIN |
| GET | `/api/backup/history` | ADMIN |
| GET | `/api/backup/{id}/download` | ADMIN |
| DELETE | `/api/backup/{id}` | ADMIN |
| POST | `/api/backup/validate` | ADMIN |
| POST | `/api/backup/restore` | ADMIN |
| POST | `/api/backup/restore-bootstrap` | solo si `users=0` |

## Notas

- SQLite local mono-clínica / USB migration.
- Durante restore: API 503 excepto health.
- Tras restore: `token_version` ↑, re-login.
- Si Windows bloquea el archivo: merge clínico pendiente al reiniciar (`.pending_clinical`), no full-replace preferente.
