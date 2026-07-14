# Diagrama Entidad-Relación — M&D Odontología Especializada

**Motor:** SQLite (archivo local; Postgres legacy opcional vía `DATABASE_URL`).  
**PK/FK:** UUID `string(36)` en todas las tablas con `id` (generados en aplicación).  
`revoked_tokens.jti` sigue siendo string JWT id; su FK `user_id` es UUID.

```mermaid
erDiagram
    users ||--o{ clinical_records : "doctor_responsable"
    users ||--o{ clinical_evolution_entries : "doctor"
    users ||--o{ appointments : "doctor"
    users ||--o{ cash_sessions : "usuario"
    users ||--o{ appointment_reminders : "marcado_enviado_por"
    users ||--o{ documents_generated : "indirecto"
    users ||--o{ revoked_tokens : "user_id"

    patients ||--|| clinical_records : "1:1"
    patients ||--o{ clinical_evolution_entries : "1:N"
    patients ||--o{ odontogram_entries : "1:N"
    patients ||--o{ appointments : "1:N"
    patients ||--o{ cash_transactions : "opcional"
    patients ||--o{ documents_generated : "opcional"

    appointments ||--o{ appointment_reminders : "1:N"

    cash_sessions ||--o{ cash_transactions : "1:N"

    users {
        string id PK "UUID"
        string nombre
        string email UK
        string password_hash
        string rol
        bool activo
        int token_version
        datetime created_at
    }

    revoked_tokens {
        string jti PK
        datetime expires_at
        string user_id FK "UUID"
        string reason
        datetime revoked_at
    }

    patients {
        string id PK "UUID"
        int numero_ficha UK
        string nombres
        string apellidos
        string tipo_documento
        string numero_documento
        date fecha_nacimiento
        string telefono
        string email
        string direccion
        string contacto_emergencia
        text alergias
        datetime created_at
    }

    clinical_records {
        string id PK "UUID"
        string patient_id FK "UUID"
        text motivo_consulta
        text antecedentes_medicos
        text antecedentes_odontologicos
        text diagnostico
        text plan_tratamiento
        string doctor_responsable_id FK "UUID"
        bool consentimiento_firmado
        datetime consentimiento_fecha
        datetime updated_at
    }

    clinical_evolution_entries {
        string id PK "UUID"
        string patient_id FK "UUID"
        string doctor_id FK "UUID"
        string especialidad
        text tratamiento_descripcion
        numeric costo
        numeric a_cuenta
        string estado
        datetime proxima_cita_fecha
        datetime fecha
        datetime created_at
    }

    odontogram_entries {
        string id PK "UUID"
        string patient_id FK "UUID"
        string pieza_fdi
        string estado
        text notas
        datetime updated_at
    }

    appointments {
        string id PK "UUID"
        string patient_id FK "UUID"
        string doctor_id FK "UUID"
        datetime fecha_hora "UTC"
        int duracion_minutos
        string estado
        text notas
        bool recordatorio_enviado
        datetime created_at
    }

    appointment_reminders {
        string id PK "UUID"
        string appointment_id FK "UUID"
        string canal
        datetime programado_para
        text mensaje_sugerido
        datetime marcado_enviado_en
        string marcado_enviado_por_user_id FK "UUID"
        string estado
        datetime created_at
    }

    cash_sessions {
        string id PK "UUID"
        string usuario_id FK "UUID"
        numeric monto_inicial
        numeric monto_final
        datetime abierta_en
        datetime cerrada_en
        string estado
    }

    cash_transactions {
        string id PK "UUID"
        string cash_session_id FK "UUID"
        string patient_id FK "UUID"
        string tipo
        string concepto
        numeric monto
        string metodo_pago
        datetime created_at
    }

    documents_generated {
        string id PK "UUID"
        string patient_id FK "UUID"
        string tipo
        string formato
        string archivo_ref
        datetime marcado_enviado_whatsapp_en
        datetime created_at
    }
```

Notas: tablas de odontograma histórico / periodontograma / media (`odontogram_change_log`, `odontogram_snapshots`, `periodontogram_entries`, `tooth_media`, `clinic_settings`) también usan UUID string como PK/FK; solo el tipo de ID cambió — la lógica clínica no.
