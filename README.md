# M&D Odontología Especializada — Sistema de Gestión Odontológica

Sistema simplificado y completo de gestión para **un solo centro odontológico** (Perú). Hermano menor de N&K DentalSoft (multi-tenant), reutiliza la idea central validada en producción: **la Ficha Clínica como pantalla única** que concentra identificación del paciente, historia clínica, diagnóstico, plan de tratamiento, costo, consentimiento y evolución.

## Stack

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Backend:** FastAPI + SQLAlchemy + PostgreSQL
- **Auth:** JWT (access + refresh)
- **PDF:** ReportLab (un solo motor para todos los documentos, 3 formatos: 80mm/A5/A4)
- **WhatsApp:** Enlaces `wa.me` (sin API oficial — ver decisiones de diseño)
- **Scheduler:** APScheduler (embebido en el backend)
- **Despliegue:** Railway.app

## Instalación local

### Requisitos
- Node.js 18+
- Python 3.11+
- Docker (para PostgreSQL)

### Pasos

```bash
# 1. Clonar el repositorio
git clone <repo-url>
cd DentalSimple

# 2. Iniciar PostgreSQL
make db

# 3. Instalar dependencias
make install

# 4. Copiar archivos de entorno
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 5. Ejecutar migraciones
make migrate

# 6. Iniciar backend (terminal 1)
make backend
# → http://localhost:8001 (docs: /docs)

# 7. Iniciar frontend (terminal 2)
make frontend
# → http://localhost:3001
```

### Primer uso
Al abrir `http://localhost:3001` por primera vez, el sistema detecta que no hay usuarios y muestra el **wizard de configuración inicial** para crear la cuenta ADMIN.

## Despliegue con Docker Compose (full-stack)

```bash
# Levanta todo: PostgreSQL + Backend + Frontend en un solo comando
docker compose up --build

# → Backend:  http://localhost:8001 (docs: /docs)
# → Frontend: http://localhost:3001
# → Database: localhost:5434
```

Para apagar:
```bash
docker compose down
```

## Despliegue en Railway

1. Crear un proyecto en Railway con dos servicios (backend y frontend).
2. Agregar un plugin de PostgreSQL.
3. Configurar variables de entorno (ver `.env.example` de cada servicio).
4. Backend: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Frontend: `npm run start` (con `NEXT_PUBLIC_API_URL` apuntando al backend).
6. Ejecutar migraciones: `alembic upgrade head` (Railway CLI o en el build).

## Decisiones de diseño clave

### 1. WhatsApp sin API oficial
El sistema **no usa** Meta WhatsApp Cloud API ni ningún proveedor de WhatsApp Business API. El envío se hace mediante enlaces `wa.me` que abren el WhatsApp del propio usuario. WhatsApp no permite adjuntar archivos automáticamente vía enlace, así que el flujo compensa con mínima fricción:
- **Paso A (automático):** Se descarga el PDF al dispositivo del usuario.
- **Paso B (automático):** Se abre el chat de WhatsApp del paciente con mensaje pre-redactado.
- **Paso C (manual):** El usuario adjunta el archivo descargado y presiona enviar.
- La UI muestra un texto de ayuda: *"Se descargó el comprobante. Adjúntalo en el chat que se abrió y envíalo."*

### 2. Impresión multi-formato vía SO (sin ESC/POS)
No se implementa protocolo ESC/POS directo a impresoras térmicas en v1. Se genera un PDF dimensionado a 80mm y se delega la impresión física al diálogo del SO/navegador, compatible con la mayoría de impresoras tiqueteras USB/red configuradas como impresora del SO.

### 3. Un solo motor de PDF
Todos los documentos (ficha, comprobante, evolución, consentimiento, cierre de caja, reportes) se generan con ReportLab. La misma plantilla de datos alimenta los 3 formatos (80mm/A5/A4); solo cambian dimensiones y proporciones.

### 4. Resumen financiero en vivo
El resumen financiero de la Ficha Clínica se calcula en tiempo real desde `cash_transactions` (ingresos del paciente), nunca se edita como campo suelto. El costo total viene de las entradas de evolución. El saldo = costo - pagado.

### 5. Recordatorios auto-detectados, envío en un clic
El scheduler revisa cada 5 minutos las citas próximas (según la anticipación configurada) y genera automáticamente los registros en `appointment_reminders` con el mensaje pre-redactado. El usuario solo hace un clic por recordatorio para abrir WhatsApp con el mensaje listo.

### 6. Evolución clínica como tabla relacional
La evolución clínica se almacena en `clinical_evolution_entries` (tabla relacional), nunca como JSON de texto libre — lección aplicada del sistema original.

## Diagrama Entidad-Relación

Ver `docs/ER_diagram.md` para el diagrama Mermaid completo.

## Tabla de Endpoints de la API

| Endpoint | Método | Rol requerido | Descripción |
|---|---|---|---|
| `/api/auth/setup-status` | GET | público | Verifica si el sistema necesita configuración inicial |
| `/api/auth/setup` | POST | público | Crea la primera cuenta ADMIN (solo si no hay usuarios) |
| `/api/auth/login` | POST | público | Inicia sesión, devuelve access + refresh tokens |
| `/api/auth/refresh` | POST | público | Renueva el access token con un refresh token |
| `/api/auth/logout` | POST | autenticado | Cierra sesión (client-side, JWT stateless) |
| `/api/auth/change-password` | POST | autenticado | Cambia la propia contraseña |
| `/api/users` | GET | ADMIN | Lista todos los usuarios |
| `/api/users` | POST | ADMIN | Crea un nuevo usuario |
| `/api/users/{id}` | PATCH | ADMIN | Actualiza un usuario (nombre, email, rol, activo) |
| `/api/users/{id}/reset-password` | POST | ADMIN | Restablece la contraseña de un usuario |
| `/api/users/me` | GET | autenticado | Devuelve el usuario actual |
| `/api/patients` | GET | autenticado | Lista pacientes (paginado) |
| `/api/patients` | POST | autenticado | Crea un paciente (auto-crea ficha clínica) |
| `/api/patients/search?q=` | GET | autenticado | Búsqueda rápida de pacientes |
| `/api/patients/{id}` | GET | autenticado | Obtiene un paciente |
| `/api/patients/{id}` | PATCH | autenticado | Actualiza datos del paciente |
| `/api/clinical/{id}/record` | GET | autenticado | Obtiene la ficha clínica del paciente |
| `/api/clinical/{id}/record` | PATCH | autenticado | Actualiza la ficha clínica |
| `/api/clinical/{id}/consentimiento` | PATCH | autenticado | Marca/desmarca consentimiento firmado |
| `/api/clinical/{id}/evolution` | GET | autenticado | Lista entradas de evolución |
| `/api/clinical/{id}/evolution` | POST | autenticado | Crea entrada de evolución |
| `/api/clinical/evolution/{id}` | PATCH | autenticado | Actualiza entrada de evolución |
| `/api/clinical/{id}/evolution/{id}` | DELETE | autenticado | Elimina entrada de evolución |
| `/api/clinical/{id}/financial` | GET | autenticado | Resumen financiero (calculado desde Caja) |
| `/api/odontogram/{id}` | GET | autenticado | Obtiene el odontograma del paciente |
| `/api/odontogram/{id}/{pieza}` | PUT | autenticado | Crea/actualiza estado de una pieza |
| `/api/odontogram/{id}/{pieza}` | DELETE | autenticado | Elimina el estado de una pieza |
| `/api/appointments` | GET | autenticado | Lista citas (filtros por rango de fechas) |
| `/api/appointments` | POST | autenticado | Crea una cita (con detección de solape) |
| `/api/appointments/{id}` | PATCH | autenticado | Actualiza/cancela una cita |
| `/api/appointments/{id}` | DELETE | autenticado | Elimina una cita |
| `/api/appointments/reminders/pending` | GET | autenticado | Lista recordatorios pendientes |
| `/api/appointments/reminders/{id}/send` | POST | autenticado | Marca recordatorio como enviado |
| `/api/config/reminders` | GET | autenticado | Obtiene config de recordatorios |
| `/api/config/reminders` | PATCH | autenticado | Actualiza config de recordatorios |
| `/api/cash/session` | GET | autenticado | Obtiene la sesión de caja activa |
| `/api/cash/session/open` | POST | autenticado | Abre una sesión de caja |
| `/api/cash/session/close` | POST | autenticado | Cierra la sesión (devuelve resumen) |
| `/api/cash/transactions` | GET | autenticado | Lista transacciones de la sesión activa |
| `/api/cash/transactions` | POST | autenticado | Registra un ingreso o egreso |
| `/api/documents/comprobante/{id}` | GET | autenticado | Descarga comprobante de pago (PDF) |
| `/api/documents/cierre-caja/{id}` | GET | autenticado | Descarga cierre de caja (PDF) |
| `/api/documents/ficha/{id}` | GET | autenticado | Descarga ficha clínica (PDF) |
| `/api/documents/evolucion/{id}` | GET | autenticado | Descarga evolución (PDF) |
| `/api/documents/consentimiento/{id}` | GET | autenticado | Descarga consentimiento (PDF) |
| `/api/documents/whatsapp-sent/{id}` | POST | autenticado | Marca documento como enviado por WhatsApp |
| `/api/reports/caja` | GET | autenticado | Reporte de caja (JSON/PDF/CSV) |
| `/api/reports/pacientes` | GET | autenticado | Reporte de pacientes atendidos (JSON/PDF/CSV) |
| `/api/reports/tratamientos` | GET | autenticado | Reporte de tratamientos (JSON/PDF/CSV) |
| `/api/health` | GET | público | Health check |

## Próximos pasos sugeridos (fuera de alcance de v1)

- **Facturación electrónica SUNAT** (boletas/facturas electrónicas) — el modelo de datos está preparado.
- **Integración RENIEC/SUNAT** para validación de DNI/RUC en tiempo real.
- **2FA** — el modelo de usuario está preparado para agregarlo.
- **Impresión ESC/POS directa** a impresora térmica (impresión silenciosa sin diálogo).
- **Google Calendar** — sincronización de citas.
- **Laboratorio dental** e **inventario de insumos**.
- **Migración del envío de WhatsApp** de `wa.me` (manual) a la API oficial de WhatsApp Business para envío realmente automático y con confirmación de entrega — solo si el centro crece y lo justifica.
