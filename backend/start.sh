#!/bin/sh
set -e
# Fallback if pre-deploy migration did not run (e.g. local Docker)
alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8001}"
