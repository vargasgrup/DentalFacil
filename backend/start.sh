#!/bin/sh
# Local / Docker Compose entrypoint (Railway uses uvicorn directly via railway.toml)
echo "[dentalfacil] boot PORT=${PORT:-8001}"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8001}"
