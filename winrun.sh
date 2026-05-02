#!/bin/bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-5000}"
VENV_DIR="${VENV_DIR:-.venv-win}"

export FLASK_ENV="${FLASK_ENV:-development}"
export FLASK_DEBUG="${FLASK_DEBUG:-1}"
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

# 安装依赖
echo "Installing dependencies..."
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

# 复制环境变量文件
if [ -f ".env.example" ] && [ ! -f ".env" ]; then
    echo "Creating .env from .env.example..."
    cp .env.example .env
fi

# 确保必要目录存在
mkdir -p instance static/uploads logs

echo "Starting attendance system development server at http://${HOST}:${PORT}"
python -m flask --app app:app run --debug --host="$HOST" --port="$PORT"
