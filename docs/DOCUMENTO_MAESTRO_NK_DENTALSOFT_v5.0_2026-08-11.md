# DOCUMENTO MAESTRO — SUPERSEDIDO

> **Este archivo (`DOCUMENTO_MAESTRO_NK_DENTALSOFT_v5.0_2026-08-11.md`) queda HISTÓRICO.**  
> **La Fuente Única de Verdad vigente es:**  
> [`DOCUMENTO_MAESTRO_NK_DENTALSOFT_v6.0_2026-09-02.md`](./DOCUMENTO_MAESTRO_NK_DENTALSOFT_v6.0_2026-09-02.md)

## Por qué se reemplazó v5.0

El v5.0 era un contraste incremental sobre v4.0 y contenía afirmaciones incorrectas o incompletas frente al código vivo, entre ellas:

1. Afirmaba que el restore **reemplaza** la base de datos; el contrato real es **merge clínico** (`merge_clinical_keep_app_schema`).
2. Citaba WebSocket en `/ws`; el contrato real es **`/api/ws`**.
3. Citaba Alembic HEAD `p5user_modulos`; el HEAD real es **`r13patient_especialidades`**.
4. No documentaba el arranque desktop 4.0.2/4.0.3 (ACL ProgramData + tarea ONLOGON + recuperación de puerto 8001).
5. No cumplía la estructura SSOT 1–44 exigida para reconstrucción total del sistema.

## Uso

- **Desarrollo, auditoría, capacitación, reconstrucción:** usar **v6.0**.  
- **v5.0 y v4.0:** solo referencia histórica; no implementar desde ellos.

---

*Nota de archivo — 2026-09-02*
