# Railway — DentalSimple / production

Guía operativa del despliegue en [Railway](https://railway.app) para **N&K DentalSoft** (repo `DentalFacil`).

Actualizado **2026-07-27** tras auditoría del canvas `DentalSimple / production`.

---

## Diagnóstico verificado (producción)

Servicios en el canvas: **Postgres** (Online + `postgres-volume`), **Backend** (Online + aviso amarillo), **Frontend** (`mdodontologia.up.railway.app`, Online).

Sondeo HTTP al Backend público:

| Comprobación | Resultado |
|--------------|-----------|
| `GET /api/health` | `200` pero `app_env: "development"`, `engine: "sqlite"` |
| OpenAPI `/api/system/health`, `/version`, `/env-check` | **Ausentes** (imagen Backend desactualizada) |
| Postgres en canvas | Online, pero el API **no** lo usa |

Interpretación:

1. El Backend está corriendo con **defaults de desarrollo** (SQLite local / `APP_ENV=development`), no con el Postgres del proyecto.
2. El badge amarillo (**23**) + texto tipo *“No changes… If this changes… then trigger…”* encaja con deploys **omitidos** / config-as-code / alertas acumuladas mientras el servicio sigue “Online”.
3. El panel “**0 Variables**” (si aparece en Details) indica que faltan variables de servicio o no están enlazadas al Postgres.

**Esto no se arregla regenerando instaladores Windows.** Es solo configuración Railway + redeploy del Backend.

---

## Fix obligatorio en Railway UI (Backend)

Abra el servicio **Backend** → **Variables** y defina (nombres exactos):

| Variable | Valor |
|----------|--------|
| `APP_ENV` | `production` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `CORS_ORIGINS` | `https://mdodontologia.up.railway.app` |
| `PUBLIC_APP_URL` | `https://mdodontologia.up.railway.app` |
| `JWT_SECRET` | secreto ≥32 chars (`openssl rand -hex 32`) |
| `MAINTENANCE_ACCESS_KEY` | secreto ≥16 chars, **distinto** de `Solo,yo1532` (`openssl rand -hex 24`) |

Opcional WhatsApp Cloud (si aplica): `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`.

Luego: **Deploy** → **Redeploy** (o push que toque `backend/**`).

### Frontend

| Variable | Valor |
|----------|--------|
| `BACKEND_URL` | URL interna o pública del Backend, p.ej. `https://backend-production-38b8.up.railway.app` (sin slash final) |
| `NEXT_PUBLIC_API_URL` | **vacío** (el browser usa same-origin `/api` → proxy) |

---

## Layout de servicios (monorepo)

Root Directory **vacío** en Backend y Frontend.

| Servicio | Config file | Dockerfile |
|----------|-------------|------------|
| Backend | `/backend/railway.toml` | `Dockerfile.backend` (raíz) |
| Frontend | `/frontend/railway.toml` | Preferible `Dockerfile.frontend` (raíz); el UI puede usar `frontend/Dockerfile` |

Start Backend: `python boot.py` (definido en `backend/railway.toml`).  
Healthcheck: `GET /api/health` (timeout 180s).

---

## Cómo verificar que quedó bien

```bash
curl -s https://backend-production-38b8.up.railway.app/api/health
```

Esperado:

- `"app_env":"production"`
- `"engine":"postgres"` (si enlazó Postgres)
- `"status":"ok"`
- `"railway_warnings":[]` (tras el deploy con el guard nuevo)
- OpenAPI incluye `/api/system/health` y `/api/system/version`

Frontend:

```bash
curl -s https://mdodontologia.up.railway.app/api/health
```

Debe reflejar el mismo motor/env que el Backend.

---

## SQLite en Railway (alternativa)

Solo si **apaga** Postgres a propósito:

1. `DATABASE_URL=sqlite:////data/clinica.db`
2. Volume montado en `/data` en el **Backend** (no solo en Postgres)
3. Réplicas = **1**
4. Cutover: `python -m scripts.railway_sqlite_cutover` (ver scripts)

Si el canvas muestra Postgres Online pero el health dice `sqlite`, está mal cableado: use la tabla de variables de arriba.

---

## CLI (opcional)

```powershell
railway login
cd C:\PROYECTOS\DentalSimple
railway link   # proyecto DentalSimple / production
railway variables --service Backend
```

Sin `railway login` válido no se pueden aplicar variables desde la terminal.

---

## Relación con instaladores Windows

El empaquetado LAN (`packaging/`) es **independiente** de Railway.  
Las conexiones Cliente↔Servidor de clínica están **congeladas** (`.cursor/rules/lan-client-server-freeze.mdc`).  
Los instaladores **no** se regeneran solos (`.cursor/rules/installers-on-demand.mdc`).
