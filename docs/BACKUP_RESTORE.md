# Respaldo y Migración (Backup / Restore)

Feature añadida en Configuración → **Respaldo y Migración** (solo ADMIN).

## Qué incluye el paquete `.zip`

- `manifest.json` — metadatos, `HEAD_REVISION`, conteos, SHA-256 de la BD
- `database/clinica.db` — snapshot SQLite consistente (`sqlite3.Connection.backup`)
- `uploads/` — tooth_media, complementary_tests, historical_documents, clinic_uploads

## Uso rápido

1. **Generar:** Configuración → Generar backup ahora → Descargar desde el historial (USB/Drive).
2. **Automático:** activar en el mismo panel (diario / 12h / semanal + hora).
3. **Restaurar (PC con datos):** validar zip → escribir `CONFIRMAR` → restaurar (crea backup de seguridad previo).
4. **PC nueva vacía:** en el wizard inicial elegir **Restaurar backup**.

## API

| Método | Ruta | Auth |
|--------|------|------|
| GET/PATCH | `/api/backup/settings` | ADMIN |
| POST | `/api/backup/generate` | ADMIN |
| GET | `/api/backup/history` | ADMIN |
| GET | `/api/backup/{id}/download` | ADMIN |
| DELETE | `/api/backup/{id}` | ADMIN |
| POST | `/api/backup/validate` | ADMIN |
| POST | `/api/backup/restore` | ADMIN |
| POST | `/api/backup/restore-bootstrap` | solo si `users=0` |

## Notas

- Pensado para **SQLite local** (caso clínica offline / 3 PCs).
- Durante restore: API responde `503` (excepto `/api/health`).
- Tras restore: se incrementa `token_version` de usuarios → deben volver a iniciar sesión.
- Carpeta de salida: `backend/app/backups/` (gitignored).

Prompt de origen: `Recursos DentalSoft/PROMPT_BACKUP_RESTORE_DENTALSIMPLE.md`
