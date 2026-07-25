# Respaldo y Migración (Backup / Restore)

Feature en Configuración → **Respaldo y Migración** (solo ADMIN).

## Qué incluye el paquete `.zip`

- `manifest.json` — metadatos, `HEAD_REVISION`, conteos, SHA-256 de la BD
- `database/clinica.db` — snapshot SQLite consistente (`sqlite3.Connection.backup`)
- `uploads/` — tooth_media, complementary_tests, historical_documents, clinic_uploads

## Uso rápido

1. **Generar:** Configuración → Generar backup ahora → Descargar desde el historial (USB/Drive).
2. **Automático:** activar en el mismo panel (diario / 12h / semanal + hora) y, si desea, indicar la **carpeta de almacenamiento** (ruta absoluta en Windows).
3. **Restaurar (PC con datos):** validar zip → escribir `CONFIRMAR` → restaurar (crea backup de seguridad previo).
4. **PC nueva vacía:** en el wizard inicial elegir **Restaurar backup**.

## Windows 10 / 11 (instalación local en clínica)

El caso de uso real es **1 SQLite por PC** (no una BD compartida por Wi‑Fi/RJ45). El zip sirve para migrar o clonar una PC a otra.

| Tema | Requisito |
|------|-----------|
| Datos escribibles | **No** instalar DB/backups/uploads bajo `Program Files`. Usar `%LOCALAPPDATA%\NKDentalSoft\` (o `NKDENTALSOFT_DATA_DIR`). Instalaciones antiguas pueden seguir en `DentalSimple`. |
| `DATABASE_URL` | Preferir ruta **absoluta** en el `.env` del instalador. |
| Rutas de medios | Misma raíz de datos: `TOOTH_MEDIA_ROOT`, `COMPLEMENTARY_TESTS_ROOT`, `HISTORICAL_DOCUMENTS_ROOT`, `BACKUP_DIRECTORY`. |
| Restore | Cierra sesiones, pausa scheduler, limpia `-wal`/`-shm`, `os.replace`. Si Windows bloquea el archivo → restore pendiente al reiniciar. |
| Tras restaurar | Reiniciar el backend/app (`restart_required: true`) e iniciar sesión de nuevo. |
| 3 PCs en red | Cada PC tiene su copia local. Migración = USB/zip. **No** montar `clinica.db` en un recurso SMB compartido. |
| Zona horaria | Fechas de historial/UI en **America/Lima**. Timestamps naive de SQLite se tratan como UTC. |
| Selector de carpeta | `POST /api/backup/choose-directory` (Win32 → PowerShell → tkinter). No retiene la BD abierta. |

Ejemplo `.env` de instalador:

```env
DATABASE_URL=sqlite:///C:/Users/Clinica/AppData/Local/NKDentalSoft/clinica.db
BACKUP_DIRECTORY=C:/Users/Clinica/AppData/Local/NKDentalSoft/backups
TOOTH_MEDIA_ROOT=C:/Users/Clinica/AppData/Local/NKDentalSoft/tooth_media
COMPLEMENTARY_TESTS_ROOT=C:/Users/Clinica/AppData/Local/NKDentalSoft/complementary_tests
HISTORICAL_DOCUMENTS_ROOT=C:/Users/Clinica/AppData/Local/NKDentalSoft/historical_documents
NKDENTALSOFT_DATA_DIR=C:/Users/Clinica/AppData/Local/NKDentalSoft
```

## API

| Método | Ruta | Auth |
|--------|------|------|
| GET/PATCH | `/api/backup/settings` | ADMIN |
| POST | `/api/backup/choose-directory` | ADMIN — abre el selector nativo de carpeta (escritorio) y guarda la ruta |
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
- Tras restore: se incrementa `token_version` → deben volver a iniciar sesión.
- Carpeta de salida por defecto: `backend/app/backups/` (gitignored).
- **Prioridad de carpeta:** `backup_settings.backup_directory` (UI / «Elegir carpeta…») → env `BACKUP_DIRECTORY` → `backend/app/backups/`.
- En escritorio Windows use **Elegir carpeta…** (selector nativo). El diálogo no retiene la conexión SQLite; si no aparece delante, revise la barra de tareas.
- Vacío / «Usar predeterminada» vuelve al default/env. No use Program Files ni `C:\Windows`.

Prompt de origen: `Recursos DentalSoft/PROMPT_BACKUP_RESTORE_DENTALSIMPLE.md`
