@echo off
set SCRIPT_DIR=%~dp0
start "" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%SCRIPT_DIR%service_manager.ps1"
