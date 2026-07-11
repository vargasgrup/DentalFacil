# Despliegue en Railway — DentalFacil / M&D Odontología

Stack: **PostgreSQL** + **backend (FastAPI)** + **frontend (Next.js)**.

## Settings exactos (importante)

En **ambos** servicios deja **Root Directory vacío** (`/`).  
Los Dockerfiles viven en la **raíz del repo** y copian `backend/` o `frontend/`.

### Backend

| Setting | Valor |
|---|---|
| Root Directory | *(vacío)* `/` |
| Config as Code | `/backend/railway.toml` |
| Dockerfile | `Dockerfile.backend` |

### Frontend

| Setting | Valor |
|---|---|
| Root Directory | *(vacío)* `/` |
| Config as Code | `/frontend/railway.toml` |
| Dockerfile | `Dockerfile.frontend` |

Si Root Directory es `/backend` o `/frontend`, el build falla con `requirements.txt not found` o `"/frontend": not found`.

## Variables

### Backend

| Variable | Valor |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (Variable Reference) |
| `JWT_SECRET` | cadena larga aleatoria |
| `CORS_ORIGINS` | `https://<frontend>.up.railway.app` |
| `PUBLIC_APP_URL` | `https://<frontend>.up.railway.app` |

### Frontend (build)

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://<backend>.up.railway.app` |

## Pasos

1. Postgres plugin online.
2. Dos servicios GitHub → mismo repo, Root vacío, configs arriba.
3. Generate Domain en backend y frontend.
4. Variables → Redeploy.
5. Abrir frontend → wizard ADMIN.

## Errores frecuentes

| Error | Arreglo |
|---|---|
| `"/requirements.txt": not found` | Root Directory debe estar **vacío**; Dockerfile = `Dockerfile.backend` |
| `"/frontend": not found` | Root Directory debe estar **vacío**; Dockerfile = `Dockerfile.frontend` |
| Healthcheck backend 5 min | Falta `DATABASE_URL` con referencia a Postgres |
| Railpack en la raíz | Borra ese servicio; usa backend/frontend con config-as-code |
