#!/bin/bash

set -e

cd "$(dirname "$0")"

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8000}"
VENV_DIR="${VENV_DIR:-.venv-local}"
export PIP_DISABLE_PIP_VERSION_CHECK=1
export PIP_NO_CACHE_DIR=1

# 创建虚拟环境（如果不存在）
if [ ! -d "$VENV_DIR" ]; then
    python3 -m venv "$VENV_DIR"
fi

# 激活虚拟环境
source "$VENV_DIR/bin/activate"

# 确保虚拟环境内 pip 可用
if ! python -m pip --version >/dev/null 2>&1; then
    python -m ensurepip --upgrade
fi

# 安装依赖
python -m pip install -r requirements.txt

# 复制环境变量文件
if [ -f ".env.example" ] && [ ! -f ".env" ]; then
    cp .env.example .env
fi

# 启动生产服务器
echo "Starting attendance system at http://localhost:${PORT}"
python -m waitress --host="$HOST" --port="$PORT" app:app
