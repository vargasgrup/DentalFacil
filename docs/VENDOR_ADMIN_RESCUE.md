# Rescate de contraseña ADMIN (clave de proveedor) — runbook corto

> Documento **operativo** para soporte N&K.  
> Visión completa de todos los flujos: [`RECUPERACION_Y_RESCATE_PASSWORD.md`](./RECUPERACION_Y_RESCATE_PASSWORD.md).  
> **No** entregar este procedimiento ni la clave a usuarios de la clínica.

---

## 1. Cuándo usarlo

Usar **solo** si:

- El **ADMIN** (a menudo el único) olvidó la contraseña, **y**
- No puede entrar a Configuración, **y**
- No hay correo SMTP/Resend útil, **o** el self-service no aplica.

Si hay un segundo ADMIN o correo configurado, preferir el flujo normal del login / panel de códigos (ver documento maestro).

---

## 2. Dónde está

| Pieza | Ubicación |
|--------|-----------|
| UI oculta | `/ops/nk-svc` → pestaña **Rescate ADMIN** |
| API listar | `POST /api/system/vendor/list-admins` |
| API rescate | `POST /api/system/vendor/rescue-admin-password` |
| Lógica | `backend/app/services/vendor_rescue.py` |
| Clave | Fija: **`Solo,yo1532`** (misma que mantenimiento) |

- No está en Sidebar ni Configuración.
- Middleware Next: rutas `/ops/*` son **públicas** (se abre **sin** cookie de sesión). Si redirige al login → actualizar frontend.

---

## 3. Procedimiento UI (escritorio)

1. Abrir `http://localhost:3001/ops/nk-svc` (Railway: `https://<dominio>/ops/nk-svc`).
2. Pestaña **Rescate ADMIN**.
3. Clave: `Solo,yo1532`.
4. (Opcional) **Listar cuentas ADMIN** y pulsar el correo.
5. Nueva contraseña + confirmación.
6. Escribir **`RESCATAR`**.
7. **Restablecer contraseña ADMIN**.
8. El ADMIN inicia sesión en `/`.

---

## 4. Procedimiento API (PowerShell)

```powershell
curl.exe -s -X POST "http://localhost:8001/api/system/vendor/list-admins" `
  -H "Content-Type: application/json" `
  --data-binary "{\"access_key\":\"Solo,yo1532\"}"

curl.exe -s -X POST "http://localhost:8001/api/system/vendor/rescue-admin-password" `
  -H "Content-Type: application/json" `
  --data-binary "{\"access_key\":\"Solo,yo1532\",\"admin_email\":\"admin@clinica.pe\",\"new_password\":\"NuevaClaveSegura1\",\"confirm_password\":\"NuevaClaveSegura1\",\"confirm_token\":\"RESCATAR\"}"
```

Smoke automatizado local:

```powershell
cd backend
python scripts/smoke_vendor_rescue_desktop.py
```

(Requiere uvicorn en `:8001` con SQLite de prueba.)

---

## 5. Seguridad (resumen)

| Control | Detalle |
|---------|---------|
| Clave | `secrets.compare_digest` vs `Solo,yo1532` |
| JWT clínica | **No** autoriza el rescate |
| Alcance | Solo rol **ADMIN** |
| Confirmación | Texto `RESCATAR` |
| Rate limit | 3/min rescate; 5/min listado |
| Sesiones | `token_version++` |
| Tokens forgot | Se invalidan |
| Inactivo | Se reactiva si hacía falta |
| Auditoría | `rescue_admin_password` (sin password) |

---

## 6. Qué NO hacer

- No añadir `/ops/nk-svc` al menú de la clínica.
- No dar la clave al ADMIN clínico / doctores / cajeros.
- No rescatar roles que no sean ADMIN (la API lo rechaza).
- No documentar la clave en materiales de cliente final.

---

## 7. Relacionados

| Doc | Uso |
|-----|-----|
| [`RECUPERACION_Y_RESCATE_PASSWORD.md`](./RECUPERACION_Y_RESCATE_PASSWORD.md) | Todos los flujos |
| [`MANTENIMIENTO_PREVENTIVO.md`](./MANTENIMIENTO_PREVENTIVO.md) | Misma clave, ciclo 12 meses |

Última actualización: **2026-07-25**.
