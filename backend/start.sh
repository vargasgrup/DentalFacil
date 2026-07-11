#!/bin/sh
# Railway / Docker entrypoint — always start HTTP so healthchecks and logs work.
echo "[dentalfacil] boot PORT=${PORT:-8001}"
echo "[dentalfacil] RAILWAY_ENVIRONMENT=${RAILWAY_ENVIRONMENT:-none}"

if [ -z "$DATABASE_URL" ]; then
  echo "[dentalfacil] ERROR: DATABASE_URL is empty."
  echo "[dentalfacil] In Railway → Backend → Variables, add:"
  echo "[dentalfacil]   DATABASE_URL = \${{Postgres.DATABASE_URL}}"
  echo "[dentalfacil] (use the Variable Reference picker on your Postgres service)"
elif echo "$DATABASE_URL" | grep -Eq '@db:|@db/'; then
  echo "[dentalfacil] ERROR: DATABASE_URL still points at Docker host 'db'."
  echo "[dentalfacil] Replace it with the Railway Postgres reference variable."
else
  echo "[dentalfacil] DATABASE_URL is set (host redacted)"
  echo "[dentalfacil] running migrations..."
  if alembic upgrade head; then
    echo "[dentalfacil] migrations ok"
  else
    echo "[dentalfacil] WARNING: alembic failed (exit $?) — starting API anyway"
  fi
fi

echo "[dentalfacil] starting uvicorn on 0.0.0.0:${PORT:-8001}"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8001}"
