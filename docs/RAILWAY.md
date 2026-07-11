# Despliegue en Railway — DentalFacil / M&D Odontología

Stack en Railway: **PostgreSQL** + **backend (FastAPI)** + **frontend (Next.js)**.

## 1. Crear el proyecto

1. En [Railway](https://railway.app) → **New Project** → **Deploy from GitHub repo** → `vargasgrup/DentalFacil`.
2. Añadir base de datos: **+ New** → **Database** → **PostgreSQL**.

No dejes que Railway intente desplegar la raíz del monorepo como un solo servicio. Borra ese servicio si se creó automáticamente y crea dos servicios con root directories (paso 2).

## 2. Servicios backend y frontend

Para cada uno: **+ New** → **GitHub Repo** → mismo repo `DentalFacil`.

**Importante:** deja **Root Directory** vacío (`/`, raíz del repo). Los Dockerfiles de Railway están en la raíz (`Dockerfile.backend` / `Dockerfile.frontend`) y copian el código correcto. Si pones Root Directory en `/backend` con el Dockerfile viejo, el healthcheck falla.

### Backend

| Setting | Valor |
|---|---|
| Root Directory | `/` (vacío / raíz del repo) |
| Config as Code | `/backend/railway.toml` |
| Builder | Dockerfile → `Dockerfile.backend` |

### Frontend

| Setting | Valor |
|---|---|
| Root Directory | `/` (vacío / raíz del repo) |
| Config as Code | `/frontend/railway.toml` |
| Builder | Dockerfile → `Dockerfile.frontend` |

## 3. Dominios públicos

En cada servicio → **Settings** → **Networking** → **Generate Domain**.

Anota:

- `https://<backend>.up.railway.app`
- `https://<frontend>.up.railway.app`

## 4. Variables de entorno

### Backend

| Variable | Valor sugerido |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referencia al plugin; el nombre puede ser `Postgres` o el que tenga tu DB) |
| `JWT_SECRET` | cadena larga aleatoria (mín. 32 caracteres) |
| `CORS_ORIGINS` | `https://<frontend>.up.railway.app` (o JSON `["https://..."]`) |
| `PUBLIC_APP_URL` | `https://<frontend>.up.railway.app` |
| `CLINIC_NAME` | Nombre del centro (opcional) |
| `REMINDER_HOURS_BEFORE` | `24` (opcional) |

`postgres://` / `postgresql://` de Railway se convierten automáticamente a `postgresql+psycopg://`.

Las migraciones se ejecutan solas con `preDeployCommand` (`alembic upgrade head`).

### Frontend

| Variable | Cuándo | Valor sugerido |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | **Build** | `https://<backend>.up.railway.app` |
| `PORT` | Runtime | Lo inyecta Railway (no hace falta) |

`NEXT_PUBLIC_*` se embebe en el bundle en el **build**. Si cambias la URL del backend, **redeploy / rebuild** el frontend.

#### Alternativa (proxy interno)

Si prefieres que el navegador llame a `/api/...` en el mismo dominio del frontend:

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_API_URL` | *(vacío)* |
| `BACKEND_URL` | `http://${{backend.RAILWAY_PRIVATE_DOMAIN}}:${{backend.PORT}}` |

Usa el nombre real del servicio backend en las referencias `${{...}}`. Esta variable debe estar disponible en el **build** (las rewrites de Next se resuelven al compilar).

## 5. Volúmenes (recomendado)

El disco del contenedor es efímero. Para no perder logos y adjuntos:

1. En el servicio **backend** → **Volumes** → añadir volumen.
2. Mount paths sugeridos:
   - `/app/app/assets/uploads` — logo del centro
   - `/app/uploads/tooth_media` — adjuntos del odontograma

## 6. Desplegar y verificar

1. **Deploy** backend (espera healthcheck `/api/health`).
2. **Deploy** frontend.
3. Abre la URL del frontend → wizard de **configuración inicial (ADMIN)** si no hay usuarios.
4. Prueba login y una pantalla con datos (pacientes / agenda).

## 7. Checklist de fallos comunes

| Síntoma | Causa probable |
|---|---|
| `Railpack could not determine how to build` / `Script start.sh not found` / analiza `./backend`, `./frontend` | El servicio no tiene **Root Directory**. Debe ser `/backend` o `/frontend` (no la raíz `/`) |
| Frontend carga pero API falla (CORS) | `CORS_ORIGINS` no incluye exactamente la URL del frontend (con `https://`) |
| Frontend llama a `localhost` | `NEXT_PUBLIC_API_URL` vacío o mal puesto; falta rebuild |
| Backend no arranca / DB error | `DATABASE_URL` no referenciada al plugin Postgres |
| Tablas inexistentes | Falló pre-deploy; revisa logs de “Pre-deploy”; ejecuta `alembic upgrade head` en Railway shell |
| Logo se pierde tras redeploy | Falta volumen en `/app/app/assets/uploads` |

### Si Railpack intenta buildear la raíz del repo

Eso ocurre cuando importas el monorepo y Railway crea **un** servicio en `/`.

1. Borra ese servicio (o no lo uses).
2. Crea **dos** servicios desde el mismo GitHub repo.
3. En cada uno → **Settings**:

**Backend**

- Root Directory: `/` (raíz del repo, **no** `/backend`)
- Config-as-code path: `/backend/railway.toml`
- Dockerfile: `Dockerfile.backend`

**Frontend**

- Root Directory: `/` (raíz del repo, **no** `/frontend`)
- Config-as-code path: `/frontend/railway.toml`
- Dockerfile: `Dockerfile.frontend`

4. Redeploy.

En los logs de build correctos debes ver algo como `Dockerfile` / `docker build`, **no** `using build driver railpack`, y el árbol analizado no debe listar `backend/` y `frontend/` juntos.

## 8. Comandos útiles (Railway CLI)

```bash
npm i -g @railway/cli
railway login
railway link

# Shell en backend
railway service
railway ssh
# dentro del contenedor:
alembic upgrade head
```

## Arquitectura en Railway

```
Browser ──► Frontend (Next.js, :$PORT)
               │  NEXT_PUBLIC_API_URL
               ▼
            Backend (FastAPI, :$PORT)
               │  DATABASE_URL
               ▼
            PostgreSQL (plugin)
```
