# Rescate de contraseña ADMIN (clave de proveedor)

Documento operativo para el **equipo técnico del proveedor** (N&K).  
No entregar este procedimiento ni la clave a usuarios de la clínica.

---

## 1. Problema que resuelve

En modo **escritorio local** (Win10/11, sin SMTP) un ADMIN que olvidó su contraseña **no puede** ver el panel de códigos de recuperación (está fuera del sistema).

Si además es el **único ADMIN**, nadie más puede ayudarlo desde Configuración.

Este rescate permite al soporte restablecer esa contraseña **sin iniciar sesión** en la clínica.

---

## 2. Dónde está

| Pieza | Ubicación |
|--------|-----------|
| UI oculta | `/ops/nk-svc` → pestaña **Rescate ADMIN** |
| API listar | `POST /api/system/vendor/list-admins` |
| API rescate | `POST /api/system/vendor/rescue-admin-password` |
| Lógica | `backend/app/services/vendor_rescue.py` |
| Clave | La misma fija de mantenimiento: **`Solo,yo1532`** |

La página **no** está en el Sidebar ni en Configuración.  
El middleware de Next.js la marca como **ruta pública** (`/ops/*`, `/recuperar-clave`) para que soporte pueda abrirla **sin cookie de sesión** (caso ADMIN bloqueado).

---

## 3. Procedimiento (escritorio / Railway)

### 3.1 Desde la UI

1. Abrir:

   ```
   http://localhost:3001/ops/nk-svc
   ```

   (o `https://<dominio>/ops/nk-svc` en Railway)

2. Ir a la pestaña **Rescate ADMIN**.
3. Ingresar la clave de proveedor: `Solo,yo1532`
4. (Opcional) **Listar cuentas ADMIN** y elegir el correo.
5. Definir **nueva contraseña** y confirmación.
6. Escribir **`RESCATAR`** (confirmación explícita).
7. Pulsar **Restablecer contraseña ADMIN**.
8. El ADMIN inicia sesión en `/` con la nueva clave.

### 3.2 Desde API (PowerShell)

```powershell
# Listar ADMIN
curl.exe -s -X POST "http://localhost:8001/api/system/vendor/list-admins" `
  -H "Content-Type: application/json" `
  --data-binary "{\"access_key\":\"Solo,yo1532\"}"

# Rescatar
curl.exe -s -X POST "http://localhost:8001/api/system/vendor/rescue-admin-password" `
  -H "Content-Type: application/json" `
  --data-binary "{\"access_key\":\"Solo,yo1532\",\"admin_email\":\"admin@clinica.pe\",\"new_password\":\"NuevaClaveSegura1\",\"confirm_password\":\"NuevaClaveSegura1\",\"confirm_token\":\"RESCATAR\"}"
```

---

## 4. Garantías de seguridad

- Misma clave de proveedor que el ciclo de mantenimiento (`secrets.compare_digest`).
- **No** acepta rol clinic JWT como sustituto de la clave.
- Solo cuentas con rol **ADMIN** (rechaza DOCTOR / ASISTENTE / CAJERO).
- Doble confirmación: hay que escribir `RESCATAR`.
- Rate limit: 3 intentos/min en rescate; 5/min en listado.
- Invalida sesiones JWT (`token_version++`) y códigos de recuperación pendientes.
- Si la cuenta estaba inactiva, el rescate la **reactiva** (caso admin deshabilitado por error).
- Auditoría: `entity_type=system`, `action=rescue_admin_password` (sin guardar la contraseña).

---

## 5. Qué NO hacer

- No añadir `/ops/nk-svc` al menú de la clínica.
- No compartir `Solo,yo1532` con ADMIN clínico / doctores / cajeros.
- No usar este endpoint para cambiar claves de roles no ADMIN.
- No documentar la clave en materiales orientados al cliente final.

---

## 6. Relación con otros flujos

| Flujo | Quién | Cuándo |
|--------|--------|--------|
| Olvidé mi contraseña (login) | Usuario + correo o 2.º ADMIN | Uso diario |
| Reset en Configuración → Usuarios | ADMIN autenticado | Uso diario |
| **Rescate proveedor** | Soporte N&K | ADMIN único bloqueado / emergencia |

Ver también: `docs/MANTENIMIENTO_PREVENTIVO.md` (misma clave, ciclo 12 meses).

Última actualización: 2026-07-25.
