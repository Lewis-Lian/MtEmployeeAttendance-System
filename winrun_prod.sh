#!/bin/bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8000}"
VENV_DIR="${VENV_DIR:-.venv-win-prod}"

export APP_ENV="${APP_ENV:-production}"
export FLASK_ENV="${FLASK_ENV:-production}"
export PIP_DISABLE_PIP_VERSION_CHECK=1
export PIP_NO_CACHE_DIR=1

# 创建虚拟环境（如果不存在）
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtual environment..."
    python -m venv "$VENV_DIR"
fi

# 激活虚拟环境
if [ -f "$VENV_DIR/Scripts/activate" ]; then
    source "$VENV_DIR/Scripts/activate"
elif [ -f "$VENV_DIR/bin/activate" ]; then
    source "$VENV_DIR/bin/activate"
else
    echo "Cannot find virtualenv activation script." >&2
    exit 1
fi

# 安装依赖（生产模式需要 waitress）
echo "Installing dependencies..."
python -m pip install --upgrade pip
python -m pip install -r requirements.txt waitress

# 复制环境变量文件
if [ -f ".env.example" ] && [ ! -f ".env" ]; then
    echo "Creating .env from .env.example..."
    cp .env.example .env
fi

# 确保必要目录存在
mkdir -p instance static/uploads logs

echo "Starting attendance system production server at http://${HOST}:${PORT}"
python -m waitress --host="$HOST" --port="$PORT" --threads=8 --channel-timeout=120 app:app
