# Recuperación de contraseñas y rescate de ADMIN

Documento maestro de **todos** los mecanismos para recuperar o restablecer credenciales en DentalSimple / N&K DentalSoft.

Cubre:

1. Recuperación desde el login («¿Olvidaste tu contraseña?»)
2. Códigos pendientes visibles al ADMIN (escritorio sin correo)
3. Restablecimiento por ADMIN autenticado (Configuración → Usuarios)
4. **Rescate de emergencia del proveedor** (ADMIN bloqueado, sin sesión)
5. Diferencias **escritorio Win10/11** vs **Railway / correo**
6. Mapa de APIs, tablas, seguridad y procedimientos operativos

**Audiencia:** desarrollo, soporte técnico N&K y administradores de clínica (secciones marcadas).

---

## 0. Mapa rápido — ¿qué usar cuándo?

```
Usuario olvidó su clave
│
├─ ¿Hay correo SMTP/Resend configurado?
│   ├─ SÍ  → Login → «¿Olvidaste…?» → código/enlace por email → nueva clave
│   └─ NO  → Login → «¿Olvidaste…?» → genera código
│            └─ Otro ADMIN en Configuración ve el código y se lo indica
│
├─ ¿El que olvidó es ADMIN y hay un 2.º ADMIN?
│   └─ El 2.º ADMIN puede: ver código pendiente O resetear en Usuarios
│
└─ ¿Es el ÚNICO ADMIN y no hay correo? (caso crítico escritorio)
    └─ Soporte N&K → /ops/nk-svc → Rescate ADMIN + clave Solo,yo1532
```

| Situación | Herramienta | ¿Requiere login? | Documento corto |
|-----------|-------------|------------------|-----------------|
| Cualquier usuario, con correo | Flujo login + email | No | Este doc §1 |
| Usuario, sin correo, hay otro ADMIN | Panel códigos pendientes | Sí (el otro ADMIN) | §2 |
| ADMIN autenticado cambia clave de otro | Config → Usuarios | Sí (ADMIN) | §3 |
| Único ADMIN bloqueado / emergencia | `/ops/nk-svc` rescate | **No** | §4 + `VENDOR_ADMIN_RESCUE.md` |
| Cambio de propia clave (conoce la actual) | Config / change-password | Sí | §3 |

---

## 1. Recuperación desde el login (self-service)

### 1.1 Qué ve el usuario

En la pantalla de inicio de sesión (`/`):

1. Clic en **¿Olvidaste tu contraseña?**
2. Ingresa su **correo** de usuario del sistema
3. El sistema responde con un mensaje genérico (no revela si el correo existe)
4. Pasa a la pantalla de **código de 6 dígitos + nueva contraseña**
5. Si llegó correo: usa el código del email (o el enlace `/recuperar-clave?token=…`)
6. Si no hay correo: un ADMIN le dicta el código (véase §2)

### 1.2 Qué hace el backend

| Paso | Detalle |
|------|---------|
| Endpoint | `POST /api/auth/forgot-password` `{ "email": "…" }` |
| Rate limit | `RATE_LIMIT_FORGOT_PASSWORD_PER_MINUTE` (default 5/min) |
| Si el usuario existe y está activo | Invalida tokens previos; crea uno nuevo |
| Token URL | `secrets.token_urlsafe(32)` → hash SHA-256 en BD |
| Código | 6 dígitos → hash SHA-256 + `code_plain` (para panel ADMIN) |
| Caducidad | `PASSWORD_RESET_EXPIRE_MINUTES` (default **60**) |
| Entrega | Intenta email (SMTP o Resend); si falla → `delivery: "admin"` |

Tabla: `password_reset_tokens` (migración Alembic `q10pwd_reset`).

### 1.3 Restablecer con código o enlace

| Endpoint | Uso |
|----------|-----|
| `POST /api/auth/validate-reset` | Comprueba token o (código + email) |
| `POST /api/auth/reset-password` | Aplica `new_password` + `confirm_password` |

Al consumir el reset:

- Se actualiza `password_hash`
- Se incrementa `token_version` (invalida JWT previos)
- Se marca el token como usado y se limpian hermanos pendientes

### 1.4 Página de enlace por correo

- Ruta frontend: `/recuperar-clave?token=…`
- **Pública** en middleware (no exige cookie de sesión)
- Valida el token y pide solo nueva contraseña

### 1.5 Correo (opcional pero recomendado en Railway)

Variables (ver `backend/.env.example`):

```env
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=noreply@clinica.com
SMTP_TLS=true
# Alternativa:
RESEND_API_KEY=re_xxx
PUBLIC_APP_URL=https://mdodontologia.up.railway.app
PASSWORD_RESET_EXPIRE_MINUTES=60
```

Implementación: `backend/app/services/mailer.py`  
Lógica de tokens: `backend/app/services/password_reset.py`  
UI login: `frontend/src/app/page.tsx`  
UI enlace: `frontend/src/app/recuperar-clave/page.tsx`

### 1.6 Modo desarrollo / laboratorio

`PASSWORD_RESET_INLINE_CODE=true` hace que `forgot-password` **devuelva el código en la respuesta JSON**.  
**Prohibido en Railway público** (cualquiera que conozca el email obtendría el código). Solo para pruebas locales controladas.

---

## 2. Códigos pendientes (escritorio sin SMTP)

### 2.1 Para qué sirve

En clínicas **offline / Win10-11** casi nunca hay SMTP. El usuario pide recuperación; el código queda en BD; un **ADMIN que sí puede entrar** lo lee y se lo comunica (verbal, teléfono, WhatsApp).

### 2.2 Dónde lo ve el ADMIN

**Configuración** → bloque **Recuperación de contraseña pendiente**  
Componente: `PasswordResetRequestsPanel.tsx`  
API: `GET /api/auth/password-reset-requests` (solo `Rol.ADMIN`)

Muestra por solicitud activa:

- Nombre y email del usuario
- Código de 6 dígitos (copiable)
- Si el correo se envió o no
- Fecha de solicitud y expiración

Se refresca automáticamente cada ~30 s.

### 2.3 Buenas prácticas de clínica

1. Mantener **hasta 2 ADMIN** (`MAX_ADMINS = 2`) para no quedar sin quien lea códigos.
2. No compartir códigos por canales inseguros abiertos al público.
3. Tras restablecer, pedir al usuario que inicie sesión de inmediato (el código queda invalidado).

---

## 3. Restablecimiento por ADMIN autenticado

Flujo clásico de producto (ya existente):

- **Configuración → Usuarios** → reset de contraseña de otro usuario  
- Endpoint: `POST /api/users/{id}/reset-password` (ADMIN)  
- El usuario afectado debe volver a iniciar sesión (`token_version++`)

Cambio de **propia** contraseña (conoce la actual):

- `POST /api/auth/change-password` `{ old_password, new_password }`

---

## 4. Rescate de emergencia del proveedor (break-glass)

> **Solo soporte N&K.** No entregar a la clínica.  
> Runbook corto: [`VENDOR_ADMIN_RESCUE.md`](./VENDOR_ADMIN_RESCUE.md)

### 4.1 Problema que resuelve

| Condición | ¿Sirve §1–§3? |
|-----------|----------------|
| Único ADMIN olvidó la clave | No: nadie puede ver Configuración |
| Sin SMTP | No hay email de self-service |
| Escritorio local | Caso típico de la clínica |

El proveedor restablece la clave **sin iniciar sesión clínica**.

### 4.2 Acceso UI

```
http://localhost:3001/ops/nk-svc
```

(o `https://<dominio>/ops/nk-svc` en cloud)

- Ruta **oculta** (no está en Sidebar / Config)
- Middleware: **pública** (`/ops/*`) — imprescindible tras el fix de 2026-07-25
- Misma página que el ciclo de mantenimiento (pestañas)

Pestaña **Rescate ADMIN**:

1. Clave de proveedor: `Solo,yo1532` (fija en código; igual que mantenimiento)
2. Opcional: **Listar cuentas ADMIN**
3. Correo del ADMIN + nueva contraseña ×2
4. Escribir **`RESCATAR`**
5. Confirmar → el ADMIN inicia sesión con la nueva clave

### 4.3 APIs (sin JWT de clínica)

| Método | Ruta | Rate limit |
|--------|------|------------|
| `POST` | `/api/system/vendor/list-admins` | 5/min |
| `POST` | `/api/system/vendor/rescue-admin-password` | 3/min |

Body rescate (ejemplo):

```json
{
  "access_key": "Solo,yo1532",
  "admin_email": "admin@clinica.pe",
  "new_password": "NuevaClaveSegura1",
  "confirm_password": "NuevaClaveSegura1",
  "confirm_token": "RESCATAR"
}
```

### 4.4 Efectos del rescate

- Solo rol **ADMIN** (rechaza otros roles)
- `password_hash` nuevo
- `token_version++` (cierra sesiones previas)
- Invalida `password_reset_tokens` pendientes de ese usuario
- Si la cuenta estaba **inactiva**, la **reactiva**
- Auditoría: `entity_type=system`, `action=rescue_admin_password` (IP, email; **nunca** la contraseña)
- Clave validada con `secrets.compare_digest`

Código:

- `backend/app/services/vendor_rescue.py`
- `backend/app/routers/system_vendor.py`
- `frontend/src/app/ops/nk-svc/page.tsx`
- Tests: `backend/tests/test_vendor_rescue.py`
- Smoke escritorio: `backend/scripts/smoke_vendor_rescue_desktop.py`

### 4.5 PowerShell (escritorio)

```powershell
# Health
curl.exe -s "http://localhost:8001/api/health"

# Listar ADMIN (clave proveedor)
curl.exe -s -X POST "http://localhost:8001/api/system/vendor/list-admins" `
  -H "Content-Type: application/json" `
  --data-binary "{\"access_key\":\"Solo,yo1532\"}"

# Rescatar
curl.exe -s -X POST "http://localhost:8001/api/system/vendor/rescue-admin-password" `
  -H "Content-Type: application/json" `
  --data-binary "{\"access_key\":\"Solo,yo1532\",\"admin_email\":\"admin@clinica.pe\",\"new_password\":\"NuevaClaveSegura1\",\"confirm_password\":\"NuevaClaveSegura1\",\"confirm_token\":\"RESCATAR\"}"
```

### 4.6 Relación con mantenimiento preventivo

La **misma clave** `Solo,yo1532` renueva el ciclo de 12 meses en la pestaña **Ciclo mantenimiento** de `/ops/nk-svc`.  
Detalle: [`MANTENIMIENTO_PREVENTIVO.md`](./MANTENIMIENTO_PREVENTIVO.md).

---

## 5. Escritorio (Win10/11) vs cloud

| Aspecto | Escritorio local | Railway / online |
|---------|------------------|------------------|
| SMTP | Suele estar ausente | Configurar SMTP o Resend |
| Self-service email | Raro | Preferido |
| Códigos en Config | **Principal** para staff | Respaldo |
| Rescate proveedor | **Crítico** si 1 ADMIN | También útil |
| `PUBLIC_APP_URL` | `http://localhost:3001` | URL pública HTTPS |
| Middleware `/ops` | Debe ser público (ya corregido) | Igual |
| Datos | SQLite local por PC | Según despliegue |

**Importante:** cada PC de escritorio tiene su propia SQLite. Un rescate o un código de recuperación aplica **solo a esa instalación**.

---

## 6. Rutas públicas (Next.js middleware)

Archivo: `frontend/src/middleware.ts`

Deben ser accesibles **sin cookie JWT** (caso ADMIN bloqueado / enlace de email):

| Ruta | Motivo |
|------|--------|
| `/` | Login |
| `/recuperar-clave` | Enlace del correo |
| `/ops/*` (p. ej. `/ops/nk-svc`) | Rescate y mantenimiento proveedor |
| `/api/*` | Proxy al backend |

Sin esto, el navegador redirige a `/` y el rescate **no es usable** en escritorio.

Las llamadas de la UI de ops usan `apiFetch(..., { skipAuth: true })` para no exigir token aunque exista uno viejo en storage.

---

## 7. Inventario técnico

### 7.1 Backend

| Pieza | Archivo |
|-------|---------|
| Modelo tokens | `app/models/password_reset.py` |
| Servicio reset | `app/services/password_reset.py` |
| Mailer | `app/services/mailer.py` |
| Rescate vendor | `app/services/vendor_rescue.py` |
| Auth routes | `app/routers/auth.py` (`forgot-password`, `validate-reset`, `reset-password`, `password-reset-requests`) |
| Vendor routes | `app/routers/system_vendor.py` |
| Clave proveedor | `app/services/maintenance_cycle.py` → `MAINTENANCE_ACCESS_KEY` |
| Migración | `alembic/versions/q10pwd_reset.py` (`HEAD` incluye esta revisión) |
| Ensure schema | `ensure_auth_schema.py` crea la tabla si falta |

### 7.2 Frontend

| Pieza | Archivo |
|-------|---------|
| Login + forgot/reset | `app/page.tsx` |
| Enlace email | `app/recuperar-clave/page.tsx` |
| Panel códigos ADMIN | `components/config/PasswordResetRequestsPanel.tsx` |
| Ops proveedor | `app/ops/nk-svc/page.tsx` |
| Middleware público | `middleware.ts` |

### 7.3 Tests

| Archivo | Cobertura |
|---------|-----------|
| `tests/test_password_reset.py` | forgot genérico, reset con código, listado ADMIN |
| `tests/test_vendor_rescue.py` | list-admins, rechazo no-ADMIN, rescate + re-login |
| `scripts/smoke_vendor_rescue_desktop.py` | Smoke HTTP contra uvicorn local |

---

## 8. Checklist operativo de soporte (escritorio)

Cuando la clínica llama: «el administrador no puede entrar».

1. Confirmar que es la PC correcta (SQLite local).
2. Pedir URL local típica: `http://localhost:3001`.
3. Abrir `http://localhost:3001/ops/nk-svc` (**sin** pedirles login).
4. Si redirige al login → frontend desactualizado (middleware viejo); actualizar build.
5. Pestaña **Rescate ADMIN** → clave proveedor → listar → nueva clave → `RESCATAR`.
6. Probar login en `/`.
7. Recomendar crear un **segundo ADMIN** y un **backup** reciente.
8. Registrar en ticket interno (quién, cuándo, PC); no anotar la contraseña nueva en claro en canales inseguros.

---

## 9. Qué NO hacer

- No poner `/ops/nk-svc` en el menú de la clínica.
- No compartir `Solo,yo1532` con roles clínicos.
- No activar `PASSWORD_RESET_INLINE_CODE` en producción pública.
- No montar `clinica.db` en un share SMB para “sincronizar” PCs.
- No usar el rescate vendor para cambiar claves de DOCTOR/ASISTENTE/CAJERO (está bloqueado a propósito).
- No borrar usuarios como “solución” al olvido de clave.

---

## 10. Índice de documentos relacionados

| Documento | Contenido |
|-----------|-----------|
| **Este archivo** | Visión completa recuperación + rescate |
| [`VENDOR_ADMIN_RESCUE.md`](./VENDOR_ADMIN_RESCUE.md) | Runbook corto solo rescate proveedor |
| [`MANTENIMIENTO_PREVENTIVO.md`](./MANTENIMIENTO_PREVENTIVO.md) | Ciclo 12 meses + misma clave |
| [`BACKUP_RESTORE.md`](./BACKUP_RESTORE.md) | Backup/restore (alternativa extrema: restaurar backup con clave conocida) |

---

Última actualización: **2026-07-25**  
Incluye: flujo login, panel ADMIN, rescate vendor, middleware público `/ops/*`, verificación smoke escritorio.
