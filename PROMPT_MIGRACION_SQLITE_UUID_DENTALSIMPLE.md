# Prompt Maestro — Migración de PostgreSQL a SQLite + IDs a UUID (DentalSimple)

**Contexto para el agente (Cursor):** Repositorio `DentalSimple`, backend FastAPI + SQLAlchemy + Alembic, actualmente sobre PostgreSQL (16 tablas, 13 migraciones encadenadas de `2905d1e9dd7e` a `k8b9c0d1e2f3`, todas las PK como entero autoincremental, sin enums SQL nativos, sin triggers, sin vistas, sin stored procedures — según `DOCUMENTO_MAESTRO_ENTERPRISE.md` v1.0). El objetivo de negocio: el sistema se instalará de forma independiente en 3 PCs de un consultorio, sin Docker ni servidor de base de datos separado, con sincronización entre ellas en una fase posterior (fuera de este prompt).

## Objetivo de este prompt

1. Migrar el motor de base de datos de PostgreSQL a **SQLite** (archivo local, sin proceso servidor).
2. Migrar **todas** las PK de entero autoincremental a **UUID (string)**, incluyendo todas las FK relacionadas — sienta la base para el futuro motor de sincronización multi-PC, que no es parte de este prompt.
3. Mantener el 100% de la funcionalidad clínica, de agenda, caja y documentos exactamente igual — este es un cambio de infraestructura de datos, no de lógica de negocio ni de UI.

## ⛔ Qué NO hacer en este prompt

- No tocar la **lógica de negocio** del odontograma/periodontograma (reglas clínicas, validaciones, endpoints). Sus tablas (`odontogram_entries`, `odontogram_change_log`, `odontogram_snapshots`, `periodontogram_entries`, `tooth_media`) **sí** deben migrarse en esquema (motor + tipo de PK), igual que el resto — no están excluidas de esta migración de infraestructura, solo de cambios funcionales.
- No construir el motor de sincronización entre PCs (cola de sincronización, resolución de conflictos, detección de origen). Eso es un proyecto aparte posterior.
- No implementar todavía el respaldo a Google Drive ni el rol `CAJERO`. Van en prompts separados ya acordados.
- No cambiar reglas de negocio existentes (unicidad de `numero_ficha`, ficha clínica 1:1 por paciente, solape de citas, sesión de caja única activa) — solo su implementación técnica subyacente si el cambio de motor lo requiere.

---

## Tarea 1 — Auditoría de compatibilidad Postgres → SQLite

Antes de tocar código, generar un reporte `MIGRATION_AUDIT_SQLITE.md` que liste, para cada uno de los 16 modelos:

- Tipos de columna usados y su equivalente en SQLite (especial atención a `JSONB`, `ARRAY`, `TIMESTAMP WITH TIME ZONE`, `Numeric`/`Decimal` para montos de caja).
- Cualquier `server_default` que dependa de funciones nativas de Postgres (ej. `now()`, `gen_random_uuid()`) — deben reemplazarse por defaults manejados en Python/SQLAlchemy (`default=`, no `server_default=` con sintaxis Postgres-específica).
- Cualquier índice único compuesto o parcial que dependa de sintaxis Postgres.
- Confirmar contra el código real (no solo el documento maestro) que efectivamente no hay triggers, vistas ni stored procedures — buscar con `grep -rn "CREATE TRIGGER\|CREATE VIEW\|CREATE FUNCTION" backend/`.

No continuar a la Tarea 2 hasta tener este inventario completo — es lo que evita sorpresas a mitad de la migración de datos reales.

---

## Tarea 2 — Cambios de modelo (SQLAlchemy)

### 2.1 Motor de base de datos
- Reemplazar la configuración de conexión (`backend/app/core/database.py` o equivalente) para usar `sqlite:///./data/clinica.db` en vez de la URL de Postgres, parametrizable por variable de entorno (`DATABASE_URL`) para no romper el entorno de desarrollo/testing si aún se quiere usar Postgres en algún momento.
- Activar `PRAGMA journal_mode=WAL` y `PRAGMA foreign_keys=ON` al conectar (SQLite no aplica FKs por defecto).
- Configurar el `connect_args={"check_same_thread": False}` que requiere SQLite con FastAPI/SQLAlchemy async o con pool de conexiones.

### 2.2 Tipos de columna
- Reemplazar cualquier `JSONB` por `sqlalchemy.JSON` (portable entre ambos motores).
- Revisar campos de dinero en `cash_transactions`, `cash_sessions`: deben quedar como `Numeric`/`DECIMAL` con precisión explícita, nunca `Float` — confirmar que ya era así, y si no, corregirlo ahora que se toca el modelo (evita errores de redondeo en caja).
- Confirmar que los campos de fecha/hora quedan en UTC y sin depender de `TIMESTAMPTZ` de Postgres (SQLite no tiene tipo timezone-aware nativo; manejar el timezone en la capa de aplicación, guardando siempre UTC).

### 2.3 Migración de PK/FK a UUID
- Cambiar la PK `id` de las 16 tablas de `Integer` autoincremental a `String(36)` (o el tipo UUID que uses vía `sqlalchemy.types.Uuid` si tu versión de SQLAlchemy lo soporta — SQLAlchemy 2.0+ tiene `Uuid` portable) con `default=lambda: str(uuid4())`.
- Actualizar **todas** las FK correspondientes a esas PK (`appointments.patient_id`, `appointments.doctor_id`, `cash_transactions.cash_session_id`, `clinical_records.patient_id`, y el resto listadas en la sección FK del documento maestro) al mismo tipo.
- Los UUID se generan **en el servidor/aplicación** en este prompt (no todavía en el cliente/frontend) — la generación en cliente es parte del futuro motor de sincronización, no de esta migración.
- Verificar cualquier lugar del código que asuma que el `id` es numérico (ordenamiento por ID, comparaciones `id > 0`, paginación por cursor numérico, URLs que parseen el ID como `int` en el router de FastAPI — cambiar esos parámetros de path de `int` a `str`/`UUID`).

---

## Tarea 3 — Migraciones Alembic

- Configurar Alembic para SQLite con **modo batch obligatorio**: `context.configure(..., render_as_batch=True)` en `env.py` — sin esto, la mayoría de `ALTER TABLE` de las migraciones existentes fallará contra SQLite.
- **No modificar las 13 migraciones históricas ya aplicadas en instalaciones existentes.** Generar una migración **nueva** (o una secuencia de 2-3 migraciones nuevas, según lo que Alembic autogenere de forma segura) que:
  1. Convierta las columnas de PK/FK de entero a string/UUID.
  2. Migre los datos existentes generando un UUID nuevo por cada fila y remapeando las FK en el mismo paso (esto requiere un script de datos, no solo un cambio de esquema — un `ALTER COLUMN` no puede inventar UUIDs por sí solo).
  3. Deja el flujo probado tanto para una base **nueva** (instalación limpia en una PC nueva) como para una base **existente** con datos reales (la de M&D Odontología, si ya está en producción/uso).
- Probar el flujo completo `alembic upgrade head` desde cero contra un archivo SQLite vacío, y también contra una copia de la base de datos actual con datos reales (usar una copia, nunca la base viva, para esta prueba).

---

## Tarea 4 — Verificación funcional

- Correr (o crear si aún no existen del prompt anterior de testing) pruebas de los 4 flujos núcleo — auth, pacientes+ficha, agenda con validación de solape, caja con sesión única activa — contra el nuevo motor SQLite, confirmando que las reglas de negocio siguen intactas con UUID como PK.
- Prueba específica de regresión: crear un paciente, su ficha (1:1), una cita, una transacción de caja, y un registro de odontograma — recorrido completo de principio a fin — para confirmar que las FK entre las 16 tablas siguen resolviendo correctamente con el nuevo tipo de ID.
- Confirmar que los endpoints que exponían el `id` como entero en las respuestas JSON ahora exponen el UUID como string sin romper el frontend (revisar `frontend/src/lib/api-types.ts` o equivalente, y cualquier componente que asuma `id: number`).

---

## Tarea 5 — Documentación

- Actualizar `docs/ER_diagram.md` reflejando el nuevo tipo de PK/FK (no se toca la parte del diagrama de odontograma/periodontograma más allá del tipo de dato de sus IDs).
- Agregar sección "Changelog v1.2" al Documento Maestro: motivo del cambio (preparar terreno para instalación sin Docker en 3 PCs + futura sincronización), motor anterior vs. nuevo, y nota explícita de que el motor de sincronización entre PCs **no** está incluido en este cambio.
- Actualizar `.env.example` con la nueva variable `DATABASE_URL` apuntando a SQLite por default.

---

## Criterios de aceptación

- [ ] La aplicación arranca y funciona de punta a punta contra SQLite, sin Postgres ni Docker corriendo.
- [ ] Las 16 tablas usan UUID como PK y sus FK relacionadas están actualizadas y funcionando.
- [ ] `alembic upgrade head` funciona tanto en una base nueva vacía como en una copia de la base de datos actual con datos reales, sin pérdida de datos ni de relaciones.
- [ ] Los 4 flujos núcleo (auth, pacientes/ficha, agenda, caja) pasan sus pruebas contra el nuevo esquema.
- [ ] No se modificó ninguna lógica de negocio ni de UI del odontograma/periodontograma — solo su esquema de datos (tipo de motor y de PK/FK), igual que el resto de las tablas.
- [ ] `MIGRATION_AUDIT_SQLITE.md` y el changelog quedan documentados en el repo.

## Orden de ejecución sugerido
Tarea 1 (auditoría, no negociable primero) → Tarea 2 (modelos) → Tarea 3 (migraciones, con las 2 pruebas: base nueva y base con datos reales) → Tarea 4 (verificación funcional) → Tarea 5 (documentación).

Antes de dar por cerrada la Tarea 3, haz un backup manual de la base de datos actual (`pg_dump` de la instancia Postgres de desarrollo/producción vigente) fuera del repositorio, como red de seguridad independiente de la migración misma.
