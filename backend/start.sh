#!/bin/sh
echo "[dentalfacil] boot PORT=${PORT:-8001}"
python -c "from app.migrate import run_migrations_blocking; run_migrations_blocking(); from app.ensure_auth_schema import ensure_auth_schema; ensure_auth_schema()" 2>/dev/null || true
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8001}"
