#!/bin/bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8000}"
VENV_DIR="${VENV_DIR:-.venv-mac}"
PYTHON_BIN="$VENV_DIR/bin/python3"

export FLASK_ENV="${FLASK_ENV:-development}"
export FLASK_DEBUG="${FLASK_DEBUG:-1}"
export PIP_DISABLE_PIP_VERSION_CHECK=1
export PIP_NO_CACHE_DIR=1

if [ ! -d "$VENV_DIR" ]; then
    python3 -m venv "$VENV_DIR"
fi

if [ ! -x "$PYTHON_BIN" ]; then
    echo "Python not found in $VENV_DIR. Remove the broken venv or set VENV_DIR to a valid one." >&2
    exit 1
fi

if ! "$PYTHON_BIN" -m pip --version >/dev/null 2>&1; then
    "$PYTHON_BIN" -m ensurepip --upgrade
fi

"$PYTHON_BIN" -m pip install -r requirements.txt

if [ -f ".env.example" ] && [ ! -f ".env" ]; then
    cp .env.example .env
fi

echo "Starting attendance system development server at http://${HOST}:${PORT}"
"$PYTHON_BIN" -m flask --app app:app run --debug --host="$HOST" --port="$PORT"
