#!/bin/bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8000}"
THREADS="${THREADS:-8}"
CHANNEL_TIMEOUT="${CHANNEL_TIMEOUT:-120}"
VENV_DIR="${VENV_DIR:-.venv-win-prod}"
LOG_DIR="${LOG_DIR:-logs}"
INSTALL_DEPS="${INSTALL_DEPS:-1}"

export FLASK_ENV="${FLASK_ENV:-production}"
export PIP_DISABLE_PIP_VERSION_CHECK=1
export PIP_NO_CACHE_DIR=1

pick_python() {
    if command -v python >/dev/null 2>&1; then
        echo "python"
        return 0
    fi
    if command -v python3 >/dev/null 2>&1; then
        echo "python3"
        return 0
    fi
    echo "Cannot find python or python3 in PATH." >&2
    exit 1
}

require_file() {
    local path="$1"
    if [ ! -f "$path" ]; then
        echo "Missing required file: $path" >&2
        exit 1
    fi
}

PYTHON_CMD="$(pick_python)"

require_file "app.py"
require_file "requirements.txt"
require_file "templates/base.html"
require_file "templates/dashboard.html"
require_file "templates/partials/app_nav.html"

mkdir -p instance static/uploads "$LOG_DIR"

if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtual environment in $VENV_DIR ..."
    "$PYTHON_CMD" -m venv "$VENV_DIR"
fi

if [ -f "$VENV_DIR/Scripts/activate" ]; then
    # Git Bash on Windows
    # shellcheck disable=SC1090
    source "$VENV_DIR/Scripts/activate"
elif [ -f "$VENV_DIR/bin/activate" ]; then
    # Fallback for non-Windows shells
    # shellcheck disable=SC1090
    source "$VENV_DIR/bin/activate"
else
    echo "Cannot find activation script under $VENV_DIR." >&2
    exit 1
fi

if ! python -m pip --version >/dev/null 2>&1; then
    python -m ensurepip --upgrade
fi

if [ "$INSTALL_DEPS" = "1" ]; then
    echo "Installing dependencies ..."
    python -m pip install -r requirements.txt waitress
fi

if [ -f ".env.example" ] && [ ! -f ".env" ]; then
    echo "Creating .env from .env.example ..."
    cp .env.example .env
fi

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
LOG_FILE="$LOG_DIR/waitress_${TIMESTAMP}.log"

echo "Project: $PROJECT_DIR"
echo "Python : $(python --version 2>&1)"
echo "Host   : $HOST"
echo "Port   : $PORT"
echo "Threads: $THREADS"
echo "Logs   : $LOG_FILE"
echo "Starting production server ..."

python -m waitress \
    --host="$HOST" \
    --port="$PORT" \
    --threads="$THREADS" \
    --channel-timeout="$CHANNEL_TIMEOUT" \
    app:app 2>&1 | tee -a "$LOG_FILE"
