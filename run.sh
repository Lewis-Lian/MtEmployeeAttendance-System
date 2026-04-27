#!/bin/bash

cd /home/lewis/Code/attendance_system

# 创建虚拟环境（如果不存在）
if [ ! -d ".venv" ]; then
    python3 -m venv .venv
fi

# 激活虚拟环境
source .venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 复制环境变量文件
if [ -f ".env.example" ] && [ ! -f ".env" ]; then
    cp .env.example .env
fi

# 启动应用
python3 app.py