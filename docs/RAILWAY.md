> ⚠️ **Documento obsoleto** — ver `docs/DOCUMENTO_MAESTRO_DENTALSIMPLE_v1_2026-07-23.md` como fuente única de verdad.

# Despliegue en Railway — DentalFacil (staging remoto SQLite + UUID)

El producto final corre **en local / Tauri** con SQLite + UUID.  
Railway se usa como **entorno de pruebas remoto** para usuarios geográficamente lejos — **mismo motor** que producción local.

> No uses Postgres integer PK con este build: el boot aborta con `FATAL SCHEMA MISMATCH`.

---

## Settings (no mezclar)

### Backend
| Setting | Valor |
|---|---|
| Root Directory | **vacío** (`/`) |
| Config as Code | `/backend/railway.toml` |
| Dockerfile | `Dockerfile.backend` |
| Réplicas | **1** (SQLite no soporta multi-writer) |

### Frontend
| Setting | Valor |
|---|---|
| Root Directory | **`/frontend`** |
| Config as Code | `/frontend/railway.toml` |
| Dockerfile | `frontend/Dockerfile` |

---

## Cutover Postgres → SQLite en Railway (obligatorio una vez)

### 0. Backup
En la máquina local o desde un cliente PG:

```bash
pg_dump "$POSTGRES_URL" -Fc -f md_odontologia_pre_sqlite.dump
```

Guarda el dump **fuera** del repo.

### 1. Volume persistente
En el servicio **Backend** → **Volumes**:

| Campo | Valor |
|-------|--------|
| Mount path | `/data` |
| Nombre | p. ej. `backend-sqlite-data` |

Sin esto, cada redeploy borra la BD.

### 2. Variables Backend (orden)

| Variable | Valor |
|----------|--------|
| `SOURCE_DATABASE_URL` | **Variable Reference** → Postgres → `DATABASE_URL` (solo durante el cutover) |
| `DATABASE_URL` | `sqlite:////data/clinica.db` ← **cuatro** barras tras `sqlite:` |
| `JWT_SECRET` | cadena larga (no cambiar si quieres mismos tokens… de todas formas tras cutover conviene re-login) |
| `CORS_ORIGINS` | `https://mdodontologia.up.railway.app` |
| `PUBLIC_APP_URL` | misma URL del frontend |

Importante: deja de usar el `DATABASE_URL` de Postgres como primario. Muévelo a `SOURCE_DATABASE_URL`.

### 3. Deploy
Redeploy Backend con el código que incluye:
- `scripts/railway_sqlite_cutover.py`
- `app/schema_guard.py`

Tras el deploy, si el volumen está vacío el API arranca con SQLite vacío (`user_count: 0` en `/api/health`) — el login fallará hasta el paso 4.

### 4. ETL (one-shot en Railway shell)

Abre **Backend → Shell** (o one-off):

```bash
python -m scripts.railway_sqlite_cutover
```

Equivale a leer Postgres (`SOURCE_DATABASE_URL`) y escribir `/data/clinica.db` con UUID + stamp Alembic.

Si el destino ya tiene usuarios y quieres regenerar:

```bash
FORCE_SQLITE_CUTOVER=1 python -m scripts.railway_sqlite_cutover
```

### 5. Reiniciar Backend
Restart del servicio para abrir el `.db` ya poblado.

### 6. Checklist de prueba

| # | Prueba | OK si |
|---|--------|-------|
| 1 | `GET https://<backend>/api/health` | `"engine":"sqlite"`, `"user_count">0`, `"status":"ok"` |
| 2 | Login en `https://mdodontologia.up.railway.app` | Entra al dashboard |
| 3 | Pacientes | Lista datos migrados |
| 4 | Agenda | Crear/ver cita sin 500 |
| 5 | Caja | Abrir sesión / movimiento |

### 7. Limpieza
1. Borra `SOURCE_DATABASE_URL` del Backend.
2. Cuando confirmes estabilidad, **elimina o apaga** el servicio Postgres (ya no es fuente de verdad).
3. No subas réplicas del Backend por encima de 1.

---

## Variables estables (post-cutover)

### Backend
| Variable | Valor |
|---|---|
| `DATABASE_URL` | `sqlite:////data/clinica.db` |
| `JWT_SECRET` | secreto fuerte |
| `CORS_ORIGINS` | URL del frontend |
| `PUBLIC_APP_URL` | URL del frontend |

### Frontend
| Variable | Cuándo | Valor |
|---|---|---|
| `BACKEND_URL` | **Runtime** | `https://<backend>.up.railway.app` |
| `NEXT_PUBLIC_API_URL` | — | **bórrala** |

---

## Troubleshooting

| Síntoma | Causa | Acción |
|---------|-------|--------|
| `Error del servidor` en login + health timeout | Codigo UUID sobre Postgres integer | Completar cutover (arriba) |
| `FATAL SCHEMA MISMATCH` en logs | `DATABASE_URL` sigue en Postgres int | Cambiar a `sqlite:////data/clinica.db` |
| Login 401 tras cutover | ETL no corrido / DB vacía | Ver `user_count` en health; re-ejecutar cutover |
| Datos perdidos tras redeploy | Sin Volume en `/data` | Crear Volume y repetir ETL desde dump/Postgres |
| `ALLOW_LEGACY_POSTGRES_INT=1` | Escape hatch | No soportado a largo plazo; solo emergencia |

---

## Relación con Tauri / PCs locales

Railway = staging remoto temporal.  
El empaquetado Tauri usará el **mismo** esquema SQLite+UUID (`clinica.db` local). No hace falta Postgres en las PCs del consultorio.
