# README — Testing (DentalSimple)

Cómo correr los tests de los flujos núcleo (auth, pacientes, agenda, caja, documentos). **No** hay tests de odontograma/periodontograma en este alcance.

## Prerrequisitos

1. **Postgres** (Docker Compose del repo):

```bash
docker compose up -d db
```

Puerto local: `5434`. La suite crea/usa la DB `dentalsimple_test`.

2. Python 3.11+ y Node 20+.

## Orden recomendado

### 1) Backend (pytest, integración API)

```bash
make test-backend
# o:
cd backend
pip install -r requirements-dev.txt
python -m pytest -q
```

Variables útiles:

| Variable | Default | Uso |
|----------|---------|-----|
| `TEST_DATABASE_URL` | `postgresql+psycopg://dentalsimple:dentalsimple@127.0.0.1:5434/dentalsimple_test` | DB aislada |
| `RATE_LIMIT_*` | forzados altos en `conftest` | Evitar flakes; el test de 429 sube su propio límite |

Si Docker no está levantado, los tests se **saltan** con un mensaje claro (no fallan en rojo por infra ausente).

### 2) Frontend — lint anti-token + unit (Vitest)

```bash
cd frontend
npm install
npm run check:token-access   # falla si hay localStorage.getItem("access_token") fuera de allowlist
npm run test                 # unit: apiFetch 401 → refresh
npm run lint                 # next lint + check de tokens
```

### 3) Frontend — E2E (Playwright)

Justificación: Playwright cubre el flujo real login → dashboard / pacientes / caja contra el stack (proxy Next + FastAPI), no solo componentes aislados.

```bash
# Terminal A — stack (o usa docker compose up)
make db && make migrate && make backend
make frontend

# Terminal B
cd frontend
npx playwright install chromium
npm run test:e2e
```

Base URL: `http://localhost:3001` (`PLAYWRIGHT_BASE_URL` para override).
Credenciales seed E2E: ver `frontend/e2e/fixtures.ts` (admin de prueba creado por el propio spec vía API setup/login).

## Qué está cubierto

| Área | Dónde |
|------|--------|
| Auth (login/refresh/logout revoke/password/rate limit) | `backend/tests/test_auth*.py` |
| Pacientes + ficha 1:1 | `backend/tests/test_patients.py` |
| Agenda solape / horario | `backend/tests/test_appointments.py` |
| Caja sesión única + resumen | `backend/tests/test_cash.py` |
| PDF comprobante (humo) | `backend/tests/test_documents.py` |
| apiFetch refresh en 401 | `frontend/src/lib/api.test.ts` |
| Login / paciente / caja E2E | `frontend/e2e/*.spec.ts` |
