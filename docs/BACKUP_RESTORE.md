# Respaldo y Migración (Backup / Restore)

Feature en Configuración → **Respaldo y Migración** (solo ADMIN).

## Qué incluye el paquete `.zip`

- `manifest.json` — metadatos, política de restore clínico, SHA-256 de la BD
- `database/clinica.db` — snapshot SQLite consistente
- `uploads/` — tooth_media, complementary_tests, historical_documents, clinic_uploads

## Qué se restaura (formato 1.1+)

**Sí:** pacientes, historia clínica, odontograma/periodontograma, evolución, citas, caja/finanzas, documentos generados, medios, usuarios/credenciales, datos del centro.

**No** (se conservan de la instalación destino):

- Esquema de software / `alembic_version` (se re-sanean migraciones al current HEAD)
- Config del módulo de backups (`backup_settings`, `backup_history`)
- Interfaz estática, binarios y comportamientos propios de la **versión instalada**

La restauración usa **fusión de tablas clínicas** (`merge_clinical_keep_app_schema`), no `os.replace` del archivo SQLite completo. Eso evita que un backup de versión anterior “vuelva” la UI o el comportamiento del sistema nuevo.

Los ZIP legacy 1.0 se aplican con la misma política de merge.

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
- Si Windows bloquea el archivo: merge clínico pendiente al reiniciar.
