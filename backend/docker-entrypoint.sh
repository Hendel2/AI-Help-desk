#!/bin/sh
# Aplica as migrations pendentes e inicia a API.
# Argumentos extras substituem o comando padrão (ex.: uvicorn com --reload em dev).
set -e

alembic upgrade head

if [ "$#" -eq 0 ]; then
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000
fi

exec "$@"
