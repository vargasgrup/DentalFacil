# Mantenimiento preventivo del sistema (ciclo anual)

Documento operativo para el **equipo técnico del proveedor** (N&K / desarrollo).  
No está pensado para usuarios de la clínica ni para el rol ADMIN clínico.

---

## 1. Objetivo

Garantizar un recordatorio automático de **mantenimiento preventivo cada 12 meses** desde:

- la instalación del sistema, o  
- la última renovación del ciclo por soporte técnico.

Cuando el plazo vence, la clínica ve un aviso profesional.  
**Solo el soporte del proveedor** puede desactivar / renovar el ciclo.

---

## 2. Mensaje que ve la clínica (al vencer)

**Título:** Mantenimiento del sistema requerido  

**Texto:**

> El plazo del mantenimiento preventivo ha vencido. Para asegurar el funcionamiento, la seguridad de los datos y la continuidad del servicio clínico, contacte al soporte técnico autorizado para reprogramarlo.
>
> Este aviso es automático y solo puede ser desactivado por el soporte del proveedor.

El usuario puede pulsar **Entendido** (oculta el modal en esa sesión del navegador).  
El aviso **vuelve a aparecer** en la siguiente sesión o pestaña hasta que soporte renueve el ciclo.

---

## 3. Cómo funciona (técnico)

| Pieza | Ubicación | Rol |
|--------|-----------|-----|
| Reloj / ciclo | `clinic_settings.maintenance_cycle_started_at` | Marca el inicio del periodo de 12 meses |
| Lógica | `backend/app/services/maintenance_cycle.py` | Calcula vencimiento, mensaje y reset |
| API estado | `GET /api/system/maintenance/status` | Usuarios autenticados (solo lectura) |
| API renovar | `POST /api/system/maintenance/reset` | Solo con clave de proveedor |
| Alerta UI | `frontend/src/components/MaintenanceAlert.tsx` (dentro de `AppShell`) | Modal cuando `maintenance_required` |
| Página oculta | `http://…/ops/nk-svc` | Formulario de renovación (sin menú) |

- **Duración del ciclo:** 12 meses calendario (`MAINTENANCE_MONTHS = 12`).
- **Clave única (fija en código):** `Solo,yo1532`  
  No hay variable de entorno ni claves alternativas. No compartir con la clínica.
- **Seguridad:** comparación con `secrets.compare_digest`; rate limit en el reset; el rol ADMIN **no** autoriza el reset sin la clave.

---

## 4. Procedimiento cuando toca hacer mantenimiento

### 4.1 Antes de ir a la clínica / remoto

1. Coordinar ventana con el centro (copia de seguridad recomendada).
2. Tener a mano la URL del sistema (local o Railway) y la clave `Solo,yo1532`.
3. Checklist mínimo sugerido:
   - Copia de seguridad de la base de datos (SQLite `clinica.db` / volumen / dump).
   - Verificar espacio en disco y que el backend arranca (`/api/health`).
   - Revisar logs de errores recientes.
   - Confirmar que login, agenda, ficha y caja responden.
   - Actualizar a la última versión estable del producto si aplica.
   - Documentar fecha y qué se hizo (ticket interno).

### 4.2 Durante el mantenimiento

1. Realizar las tareas técnicas acordadas (updates, limpieza, verificación de backups, etc.).
2. Validar con el personal de la clínica que pueden entrar y operar.

### 4.3 Renovar el ciclo (apagar el aviso)

1. Abrir en el navegador (ruta **oculta**, no está en el menú):

   ```
   https://<dominio-o-localhost>/ops/nk-svc
   ```

   Ejemplo local Windows: `http://localhost:3001/ops/nk-svc`

2. Ingresar la clave: **`Solo,yo1532`**
3. Pulsar **Renovar ciclo (12 meses)**.
4. Debe mostrar éxito y la **nueva fecha de vencimiento** (aprox. +12 meses).
5. Entrar a la app con un usuario de la clínica y confirmar que **ya no** aparece el modal.

### 4.4 Alternativa por API (PowerShell / curl)

```powershell
curl.exe -s -X POST "http://localhost:8001/api/system/maintenance/reset" `
  -H "Content-Type: application/json" `
  --data-binary "{\"access_key\":\"Solo,yo1532\"}"
```

Respuesta esperada: JSON con `"maintenance_required": false` y nuevo `"due_at"`.

---

## 5. Cómo probar el aviso (QA / verificación)

Forzar vencimiento (solo entorno de prueba), desde `backend` con la misma `DATABASE_URL` que usa el servidor:

```powershell
python -c "from datetime import datetime,timedelta,timezone; from app.database import SessionLocal; from app.models.clinic_settings import ClinicSettings; from app.models.ids import CLINIC_SETTINGS_ID; db=SessionLocal(); r=db.get(ClinicSettings, CLINIC_SETTINGS_ID); r.maintenance_cycle_started_at=datetime.now(timezone.utc)-timedelta(days=400); db.commit(); print('OK vencido')"
```

1. Recargar la app autenticada → debe salir el modal con el mensaje oficial.  
2. Renovar con `/ops/nk-svc` + `Solo,yo1532`.  
3. Recargar → el aviso no debe volver.

---

## 6. Instalación nueva / migraciones

- Columna: `clinic_settings.maintenance_cycle_started_at`  
  (Alembic `q8maint_cycle` + `ensure_maintenance_schema` al arrancar).
- Si el campo está vacío, el primer uso de `status` lo inicializa a **ahora** (ciclo de 12 meses desde ese momento).

---

## 7. Qué NO hacer

- No añadir la página `/ops/nk-svc` al Sidebar ni a Configuración.
- No entregar la clave `Solo,yo1532` a ADMIN / doctores / cajeros.
- No “arreglar” el aviso borrando datos de usuarios: el ciclo vive en `clinic_settings`.
- No depender de otra clave por `.env`: la clave válida es solo la fija en código.

---

## 8. Referencia rápida

| Acción | Dónde |
|--------|--------|
| Ver si está vencido | App → login → modal (o `GET /api/system/maintenance/status` con token) |
| Renovar 12 meses | `/ops/nk-svc` + clave `Solo,yo1532` |
| Código del mensaje / meses | `backend/app/services/maintenance_cycle.py` |
| Código del modal | `frontend/src/components/MaintenanceAlert.tsx` |

Última actualización de este documento: 2026-07-25 (ciclo **12 meses**, mensaje simplificado).
