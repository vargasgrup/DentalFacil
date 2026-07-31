# Railway Variables — plantilla (sin secretos)

Copiar a `docs/RAILWAY_VARS.local.md` (gitignored) y rellenar secretos.

```powershell
python -c "import secrets; print('JWT_SECRET=' + secrets.token_hex(32)); print('MAINTENANCE_ACCESS_KEY=' + secrets.token_hex(24))"
```

## Backend

```
APP_ENV=production
JWT_SECRET=<pegar 64 hex>
MAINTENANCE_ACCESS_KEY=<pegar 48 hex>
PUBLIC_APP_URL=https://nkdentalsoft.up.railway.app
CORS_ORIGINS=https://nkdentalsoft.up.railway.app
DATABASE_URL=sqlite:////data/clinica.db
PASSWORD_RESET_INLINE_CODE=false
# Versión DEMO compartida: protege correo/clave del Admin (varios usuarios, mismas credenciales).
# Para desbloquear: DEMO_MODE=false
DEMO_MODE=true
```

Opcional WhatsApp / SMTP: dejar vacío hasta tener credenciales reales.

## Frontend

```
BACKEND_URL=https://backend-production-38b8.up.railway.app
```

**No** definir `NEXT_PUBLIC_API_URL` en Railway.

## Rotar en producción clínica real

Cambiar sí o sí: `JWT_SECRET`, `MAINTENANCE_ACCESS_KEY`, y luego (cuando toque) `DATABASE_URL` → Postgres UUID + credenciales WhatsApp/SMTP.
