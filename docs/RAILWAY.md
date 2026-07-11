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
| `DATABASE_URL` | **Variable Reference** → Postgres → `DATABASE_URL` (`postgresql://...`) |
| `JWT_SECRET` | cadena larga |
| `CORS_ORIGINS` | `https://<frontend>.up.railway.app` (URL simple, sin JSON) |
| `PUBLIC_APP_URL` | misma URL del frontend |

### Frontend
| Variable | Cuándo | Valor |
|---|---|---|
| `BACKEND_URL` | **Runtime** | `https://<backend>.up.railway.app` |
| `NEXT_PUBLIC_API_URL` | — | **déjala vacía / bórrala** |

El frontend llama a `/api/...` en su propio dominio; Next hace proxy a `BACKEND_URL`.  
Si ves `NetworkError when attempting to fetch resource`, falta `BACKEND_URL` o apunta mal.
