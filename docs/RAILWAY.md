# Despliegue en Railway — DentalFacil

## Settings (no mezclar)

### Backend
| Setting | Valor |
|---|---|
| Root Directory | **vacío** (`/`) |
| Config as Code | `/backend/railway.toml` |
| Dockerfile | `Dockerfile.backend` |

### Frontend
| Setting | Valor |
|---|---|
| Root Directory | **`/frontend`** |
| Config as Code | `/frontend/railway.toml` |
| Dockerfile | `frontend/Dockerfile` |

> Si el frontend falla con `"/frontend": not found`, tienes Root vacío pero un Dockerfile que hace `COPY frontend/`. Con la config actual, Root debe ser **`/frontend`**.

## Variables

### Backend
| Variable | Valor |
|---|---|
| `DATABASE_URL` | **Variable Reference** → Postgres → `DATABASE_URL` (debe ser `postgresql://...`, **nunca** `https://`) |
| `JWT_SECRET` | cadena larga |
| `CORS_ORIGINS` | `https://<frontend>.up.railway.app` |
| `PUBLIC_APP_URL` | misma URL del frontend |

### Frontend
| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://<backend>.up.railway.app` |

Borra variables vacías o con typo (`NEX_PUBLIC`, `PORT` vacío).
