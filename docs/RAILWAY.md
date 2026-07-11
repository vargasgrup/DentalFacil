# Despliegue en Railway — DentalFacil / M&D Odontología

Stack en Railway: **PostgreSQL** + **backend (FastAPI)** + **frontend (Next.js)**.

## 1. Crear el proyecto

1. En [Railway](https://railway.app) → **New Project** → **Deploy from GitHub repo** → `vargasgrup/DentalFacil`.
2. Añadir base de datos: **+ New** → **Database** → **PostgreSQL**.

No dejes un servicio buildeando la raíz del monorepo. Usa **dos** servicios con Root Directory (paso 2).

## 2. Servicios backend y frontend

Para cada uno: **+ New** → **GitHub Repo** → mismo repo `DentalFacil`.

### Backend

| Setting | Valor |
|---|---|
| **Root Directory** | `/backend` |
| **Config as Code** | `/backend/railway.toml` |
| Dockerfile | `backend/Dockerfile` (lo define el toml) |

### Frontend

| Setting | Valor |
|---|---|
| **Root Directory** | `/frontend` |
| **Config as Code** | `/frontend/railway.toml` |
| Dockerfile | `frontend/Dockerfile` (lo define el toml) |

> Si el build dice `"/frontend": not found`, el Root Directory está mal: debe ser `/frontend` con el Dockerfile **dentro** de esa carpeta (no `Dockerfile.frontend` en la raíz del repo).

## 3. Dominios públicos

En cada servicio → **Settings** → **Networking** → **Generate Domain**.

Anota:

- `https://<backend>.up.railway.app`
- `https://<frontend>.up.railway.app`

## 4. Variables de entorno

### Backend

| Variable | Valor sugerido |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (usa el **Variable Reference** al servicio Postgres) |
| `JWT_SECRET` | cadena larga aleatoria (mín. 32 caracteres) |
| `CORS_ORIGINS` | `https://<frontend>.up.railway.app` |
| `PUBLIC_APP_URL` | `https://<frontend>.up.railway.app` |
| `CLINIC_NAME` | Nombre del centro (opcional) |
| `REMINDER_HOURS_BEFORE` | `24` (opcional) |

`postgres://` / `postgresql://` de Railway se convierten automáticamente a `postgresql+psycopg://`.

Las migraciones corren al arrancar (`./start.sh` → `alembic upgrade head`).

### Frontend

| Variable | Cuándo | Valor sugerido |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | **Build** | `https://<backend>.up.railway.app` |
| `PORT` | Runtime | Lo inyecta Railway |

`NEXT_PUBLIC_*` se embebe en el bundle en el **build**. Si cambias la URL del backend, **redeploy** el frontend.

## 5. Volúmenes (recomendado)

En **backend** → **Volumes**:

- `/app/app/assets/uploads` — logo del centro
- `/app/uploads/tooth_media` — adjuntos del odontograma

## 6. Desplegar y verificar

1. Deploy backend (healthcheck `/api/health`).
2. Deploy frontend.
3. Abre el frontend → wizard ADMIN si no hay usuarios.

## 7. Fallos comunes

| Síntoma | Causa / arreglo |
|---|---|
| `"/frontend": not found` o `"/backend": not found` | Root Directory debe ser `/frontend` o `/backend` (no `/`). El Dockerfile no debe hacer `COPY frontend/`. |
| `Railpack could not determine how to build` | Falta Root Directory o Config-as-code. |
| Healthcheck backend falla 5 min | Falta `DATABASE_URL=${{Postgres.DATABASE_URL}}`. Mira Deploy Logs por `[dentalfacil]`. |
| CORS / API falla en browser | `CORS_ORIGINS` y `NEXT_PUBLIC_API_URL` deben usar las URLs `.up.railway.app` exactas. |
| Logo se pierde | Falta volumen en uploads. |

## 8. Railway CLI (opcional)

```bash
npm i -g @railway/cli
railway login
railway link
railway ssh   # shell en el servicio seleccionado
```
