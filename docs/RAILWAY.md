# Railway — DentalSimple / production

Guía operativa del despliegue en [Railway](https://railway.app) para **N&K DentalSoft** (repo `DentalFacil`).

Actualizado **2026-07-27** (healthcheck Backend + variables seguras).

---

## Si el healthcheck falla (`1/1 replicas never became healthy`)

El **build Docker OK** + healthcheck `service unavailable` significa: el contenedor **arranca y se cae** (o no llega a abrir el puerto) antes de responder `GET /api/health`.

Causas más frecuentes en este proyecto:

1. **`APP_ENV=production` sin secretos** → el proceso sale al importar settings:
   - falta `JWT_SECRET` (≥32) o
   - falta `MAINTENANCE_ACCESS_KEY` (≥16, ≠ `Solo,yo1532`)
2. **`DATABASE_URL=${{Postgres.DATABASE_URL}}`** con Postgres legacy (`users.id` INTEGER) → `schema_guard` hace `exit` (esta imagen espera UUID).
3. Migraciones / DB inalcanzable (timeout).

Mientras el deploy nuevo falle, Railway **deja el deploy anterior** (por eso el dominio público puede seguir en `app_env=development` + `sqlite`).

### Recuperación rápida (recomendado ahora)

En Backend → **Variables**:

| Acción | Detalle |
|--------|---------|
| **No** use aún `${{Postgres.DATABASE_URL}}` | El Postgres del canvas es legacy INT; rompe el boot |
| Opción A (simple) | **Elimine** `DATABASE_URL` o déjela vacía → vuelve al SQLite por defecto (como el deploy que sí responde) |
| Opción B (durable) | `DATABASE_URL=sqlite:////data/clinica.db` + **Volume** montado en `/data` en el Backend |
| Si puso `APP_ENV=production` | Defina **juntos** `JWT_SECRET` y `MAINTENANCE_ACCESS_KEY`, o quite `APP_ENV` hasta tenerlos |
| CORS / URL | `CORS_ORIGINS=https://mdodontologia.up.railway.app` y `PUBLIC_APP_URL=https://mdodontologia.up.railway.app` |

Luego **Redeploy**. En logs debe verse `starting uvicorn on 0.0.0.0:…` y el healthcheck en verde.

Mirar logs del deploy fallido: busque `FATAL CONFIG`, `FATAL SCHEMA MISMATCH`, `DB/schema boot FAILED`.

---

## Diagnóstico verificado (producción)

| Comprobación | Resultado típico si el deploy nuevo falló |
|--------------|--------------------------------------------|
| `GET /api/health` (público) | Sigue el **deploy viejo**: `app_env=development`, `engine=sqlite` |
| OpenAPI `/api/system/health` | Ausente hasta que un deploy nuevo pase healthcheck |
| Postgres en canvas | Online, pero **no** enlazarlo hasta cutover UUID |

---

## Variables Backend (cuando el boot ya sea estable)

### Paso 1 — Redeploy verde (mínimo)

- Sin `DATABASE_URL` de Postgres (o SQLite `/data` + volumen).
- `CORS_ORIGINS` + `PUBLIC_APP_URL` al Frontend.
- `APP_ENV=production` **solo si** también define:

```
JWT_SECRET=<openssl rand -hex 32>
MAINTENANCE_ACCESS_KEY=<openssl rand -hex 24>
```

### Paso 2 — Postgres (solo tras cutover UUID)

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

Si `users.id` sigue INTEGER, el boot fallará a propósito. Emergencia: `ALLOW_LEGACY_POSTGRES_INT=1` (no soportado).

### Frontend

| Variable | Valor |
|----------|--------|
| `BACKEND_URL` | `https://backend-production-38b8.up.railway.app` (sin slash) |
| `NEXT_PUBLIC_API_URL` | **vacío** |

---

## Layout de servicios (monorepo)

| Servicio | Config file | Root Directory (Railway UI) | Dockerfile |
|----------|-------------|------------------------------|------------|
| Backend | `/backend/railway.toml` | **vacío** (raíz del repo) | `Dockerfile.backend` |
| Frontend | `/frontend/railway.toml` | **`frontend`** | `frontend/Dockerfile` |

> **No** use `Dockerfile.frontend` si Root Directory = `frontend` → error `"/frontend": not found`.

Start Backend: `python boot.py`.  
Healthcheck: `GET /api/health` (timeout **300s**).

---

## Verificar éxito

```bash
curl -s https://backend-production-38b8.up.railway.app/api/health
```

Tras un deploy nuevo sano espere también:

- rutas OpenAPI `/api/system/health`, `/api/system/version`
- opcionalmente `"railway_warnings":[]` si Variables están correctas

---

## Relación con instaladores Windows

Independiente de Railway. LAN clínica congelada. Instaladores solo bajo demanda.
