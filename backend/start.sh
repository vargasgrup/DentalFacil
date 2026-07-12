#!/bin/sh
echo "[dentalfacil] boot PORT=${PORT:-8001}"
python -c "from app.migrate import run_migrations_blocking; run_migrations_blocking()" 2>/dev/null || true
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8001}"
