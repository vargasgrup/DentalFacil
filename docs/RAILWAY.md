# Railway — variables de producción (DentalSimple)

Guía operativa del despliegue en [Railway](https://railway.app) para **N&K DentalSoft** (repo `DentalFacil`).

Actualizado **2026-07-30** (variables production + consentimientos COP).

---

## URLs del proyecto (production)

| Servicio | URL pública |
|----------|-------------|
| Frontend | `https://nkdentalsoft.up.railway.app` |
| Backend | `https://backend-production-38b8.up.railway.app` |
| Postgres (interno) | `postgres-production-4981.up.railway.app` — **no enlazar aún** |

---

## Por qué falla el catálogo / el Backend “Online” con avisos

Si `GET /api/health` responde `app_env=development` + `engine=sqlite` y faltan rutas como `/api/documents/consentimiento-tipos` o `/api/system/health`, Railway está sirviendo un **deploy viejo**: el deploy nuevo crashea al arrancar (casi siempre por Variables) y Railway **no reemplaza** el contenedor sano anterior.

El Frontend nuevo pide APIs que el Backend viejo no tiene → error de catálogo (mitigado en UI con catálogo local; los PDF COP reales requieren Backend nuevo en verde).

---

## Checklist rápido (pegar en Railway → Variables)

### Backend — obligatorias para boot en `APP_ENV=production`

Copiar **tal cual** (sin comillas, sin slash final en URLs). Los secretos de prueba están en `docs/RAILWAY_VARS.local.md` (archivo local, **no** va a GitHub). Si no existe, generar:

```powershell
python -c "import secrets; print(secrets.token_hex(32)); print(secrets.token_hex(24))"
```

| Variable | Valor de prueba (production) | ¿Cambiar después? |
|----------|------------------------------|-------------------|
| `APP_ENV` | `production` | No (dejar `production`) |
| `JWT_SECRET` | *(64 hex en `RAILWAY_VARS.local.md`)* | **Sí — rotar** antes de clínica real |
| `MAINTENANCE_ACCESS_KEY` | *(48 hex en `RAILWAY_VARS.local.md`)* | **Sí — rotar** |
| `PUBLIC_APP_URL` | `https://nkdentalsoft.up.railway.app` | Solo si cambia el dominio frontend |
| `CORS_ORIGINS` | `https://nkdentalsoft.up.railway.app` | Idem (varios orígenes: separados por coma) |
| `DATABASE_URL` | `sqlite:////data/clinica.db` | **Sí** → Postgres UUID cuando corresponda |
| `PASSWORD_RESET_INLINE_CODE` | `false` | No dejar en `true` en público |

**Volume Backend:** montar en `/data` (Settings → Volumes) si usa SQLite durable.

**No definir aún:** `DATABASE_URL=${{Postgres.DATABASE_URL}}` mientras `users.id` sea INTEGER (rompe boot con `FATAL SCHEMA MISMATCH`).

### Backend — opcionales (producción clínica)

| Variable | Cuándo | ¿Cambiar? |
|----------|--------|-----------|
| `WHATSAPP_PHONE_NUMBER_ID` | Envío Cloud API | Sí (Meta) |
| `WHATSAPP_ACCESS_TOKEN` | Envío Cloud API | Sí (Meta) |
| `WHATSAPP_API_VERSION` | Default `v17.0` | Solo si Meta lo exige |
| `SMTP_*` / `RESEND_API_KEY` | Recuperación de contraseña | Sí |
| `CLINIC_NAME`, `CLINIC_PHONE`, `CLINIC_ADDRESS`, `CLINIC_RUC`, `CLINIC_EMAIL` | Fallback si Configuración vacía | Preferible editar en **Configuración** UI |
| `CLINIC_TICKET_SERIE` | Serie tique (default `T001`) | Sí si aplica |

### Frontend — obligatorias

| Variable | Valor | ¿Cambiar? |
|----------|-------|-----------|
| `BACKEND_URL` | `https://backend-production-38b8.up.railway.app` | Solo si Railway cambia el dominio del Backend |
| `NEXT_PUBLIC_API_URL` | *(vacío / sin definir)* | No rellenar en Railway (rompe same-origin proxy) |

Tras guardar Variables: **Redeploy** Backend y luego Frontend (o “Restart”).

---

## Valores generados para prueba (referencia)

Los secretos concretos viven solo en:

```text
docs/RAILWAY_VARS.local.md
```

Plantilla versionada (sin secretos): `docs/RAILWAY_VARS.example.md`.

Aplicar con CLI (tras `railway login` + `railway link`):

```powershell
powershell -File scripts/railway_apply_vars.ps1
```

O pegar manualmente en Railway UI → servicio Backend / Frontend → **Variables**.

---

## Verificación post-deploy

```powershell
curl -s https://backend-production-38b8.up.railway.app/api/health
curl -s https://backend-production-38b8.up.railway.app/api/system/health
curl -s -o NUL -w "%{http_code}" https://backend-production-38b8.up.railway.app/api/documents/consentimiento-tipos
```

Éxito esperado:

- `app_env":"production"`
- `/api/system/health` → 200 (ya no 404)
- `/api/documents/consentimiento-tipos` → **401** sin token (ruta existe) o **200** con JWT
- Frontend: selector de consentimientos sin error; PDF con distrito de Configuración

Si sigue `development` + 404 en rutas nuevas → el deploy nuevo **sigue fallando**; mirar logs: `FATAL CONFIG`, `FATAL SCHEMA MISMATCH`.

---

## Si el healthcheck falla

| Causa | Acción |
|-------|--------|
| `APP_ENV=production` sin JWT/MAINT | Pegar secretos de `RAILWAY_VARS.local.md` |
| Postgres legacy INT | Quitar `DATABASE_URL` Postgres; usar SQLite `/data` |
| DB inalcanzable | Revisar Volume `/data` o quitar `DATABASE_URL` temporalmente |

---

## Layout de servicios (monorepo)

| Servicio | Config | Root Directory (Railway UI) | Dockerfile |
|----------|--------|-----------------------------|------------|
| Backend | `/backend/railway.toml` | **vacío** (raíz del repo) | `Dockerfile.backend` |
| Frontend | `/frontend/railway.toml` | **`frontend`** | `frontend/Dockerfile` |

Start Backend: `python boot.py`. Healthcheck: `GET /api/health` (timeout **300s**).

---

## Relación con instaladores Windows

Independiente de Railway. LAN clínica congelada. Instaladores solo bajo demanda.
