#!/bin/bash

# 遇到错误、未定义变量、管道失败立即退出
set -euo pipefail

# 切换到脚本所在目录
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

# 可通过环境变量覆盖的配置项
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8000}"
THREADS="${THREADS:-8}"
CHANNEL_TIMEOUT="${CHANNEL_TIMEOUT:-120}"
VENV_DIR="${VENV_DIR:-.venv-win-prod}"
LOG_DIR="${LOG_DIR:-logs}"
INSTALL_DEPS="${INSTALL_DEPS:-1}"

# 生产环境配置
export FLASK_ENV="${FLASK_ENV:-production}"
export PIP_DISABLE_PIP_VERSION_CHECK=1
export PIP_NO_CACHE_DIR=1

# 自动选择可用的 Python 解释器（优先 python，其次 python3）
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

# 检查必需文件是否存在
require_file() {
    local path="$1"
    if [ ! -f "$path" ]; then
        echo "Missing required file: $path" >&2
        exit 1
    fi
}

PYTHON_CMD="$(pick_python)"

# 启动前校验核心文件完整性
require_file "app.py"
require_file "requirements.txt"
require_file "templates/base.html"
require_file "templates/dashboard.html"
require_file "templates/partials/app_nav.html"

# 创建运行时所需的目录
mkdir -p instance static/uploads "$LOG_DIR"

# 首次运行时自动创建虚拟环境
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtual environment in $VENV_DIR ..."
    "$PYTHON_CMD" -m venv "$VENV_DIR"
fi

# 激活虚拟环境（兼容 Windows Git Bash 和 Unix 两种路径风格）
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

# 确保 pip 可用
if ! python -m pip --version >/dev/null 2>&1; then
    python -m ensurepip --upgrade
fi

# 安装项目依赖及 Waitress 生产服务器
if [ "$INSTALL_DEPS" = "1" ]; then
    echo "Installing dependencies ..."
    python -m pip install -r requirements.txt waitress
fi

# 首次运行时从模板创建 .env 文件
if [ -f ".env.example" ] && [ ! -f ".env" ]; then
    echo "Creating .env from .env.example ..."
    cp .env.example .env
fi

# 按时间戳生成日志文件，每次启动保留独立日志
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
LOG_FILE="$LOG_DIR/waitress_${TIMESTAMP}.log"

# 输出启动信息
echo "Project: $PROJECT_DIR"
echo "Python : $(python --version 2>&1)"
echo "Host   : $HOST"
echo "Port   : $PORT"
echo "Threads: $THREADS"
echo "Logs   : $LOG_FILE"
echo "Starting production server ..."

# 使用 Waitress 启动生产服务器，输出同时写入日志文件和终端
python -m waitress \
    --host="$HOST" \
    --port="$PORT" \
    --threads="$THREADS" \
    --channel-timeout="$CHANNEL_TIMEOUT" \
    app:app 2>&1 | tee -a "$LOG_FILE"
