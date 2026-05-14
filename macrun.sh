#!/bin/bash

# 遇到错误、未定义变量、管道失败立即退出
set -euo pipefail

# 切换到脚本所在目录
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

# 可通过环境变量覆盖的配置项
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8000}"
VENV_DIR="${VENV_DIR:-.venv-mac}"
PYTHON_BIN="$VENV_DIR/bin/python3"

# Flask 开发环境配置
export FLASK_ENV="${FLASK_ENV:-development}"
export FLASK_DEBUG="${FLASK_DEBUG:-1}"
export PIP_DISABLE_PIP_VERSION_CHECK=1
export PIP_NO_CACHE_DIR=1

# 首次运行时自动创建虚拟环境
if [ ! -d "$VENV_DIR" ]; then
    python3 -m venv "$VENV_DIR"
fi

# 检查虚拟环境中的 Python 是否可用
if [ ! -x "$PYTHON_BIN" ]; then
    echo "Python not found in $VENV_DIR. Remove the broken venv or set VENV_DIR to a valid one." >&2
    exit 1
fi

# 确保 pip 可用（部分精简 Python 安装不含 pip）
if ! "$PYTHON_BIN" -m pip --version >/dev/null 2>&1; then
    "$PYTHON_BIN" -m ensurepip --upgrade
fi

# 安装项目依赖
"$PYTHON_BIN" -m pip install -r requirements.txt

# 首次运行时从模板创建 .env 文件
if [ -f ".env.example" ] && [ ! -f ".env" ]; then
    cp .env.example .env
fi

# 启动 Flask 开发服务器
echo "Starting attendance system development server at http://${HOST}:${PORT}"
"$PYTHON_BIN" -m flask --app app:app run --debug --host="$HOST" --port="$PORT"
