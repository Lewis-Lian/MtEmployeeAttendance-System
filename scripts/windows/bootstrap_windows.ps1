[CmdletBinding()]
param(
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..") ).Path,
    [string]$PythonCmd = "python",
    [string]$PipIndexUrl = "https://pypi.tuna.tsinghua.edu.cn/simple",
    [string]$PipTrustedHost = "pypi.tuna.tsinghua.edu.cn",
    [switch]$InitEnv,
    [int]$Port = 5000
)

$ErrorActionPreference = "Stop"

Write-Host "[1/6] Project root: $ProjectRoot"
Set-Location $ProjectRoot

$venvPython = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
if (!(Test-Path $venvPython)) {
    Write-Host "[2/6] Creating virtualenv..."
    & $PythonCmd -m venv .venv
}

Write-Host "[3/6] Installing dependencies..."
& $venvPython -m pip install --upgrade pip --retries 5 --timeout 30 -i $PipIndexUrl --trusted-host $PipTrustedHost
& $venvPython -m pip install -r requirements.txt waitress --retries 5 --timeout 30 -i $PipIndexUrl --trusted-host $PipTrustedHost

if (!(Test-Path (Join-Path $ProjectRoot ".env"))) {
    if (Test-Path (Join-Path $ProjectRoot ".env.example")) {
        Write-Host "[4/6] Creating .env from .env.example"
        Copy-Item (Join-Path $ProjectRoot ".env.example") (Join-Path $ProjectRoot ".env")
    }
}

Write-Host "[5/6] Ensuring runtime directories"
$null = New-Item -ItemType Directory -Force -Path (Join-Path $ProjectRoot "instance")
$null = New-Item -ItemType Directory -Force -Path (Join-Path $ProjectRoot "static\uploads")
$null = New-Item -ItemType Directory -Force -Path (Join-Path $ProjectRoot "logs")

if ($InitEnv) {
    Write-Host "[6/6] Initializing app/db context"
    & $venvPython -c "from app import app; print('App init OK')"
} else {
    Write-Host "[6/6] Skipped app init (pass -InitEnv to enable)"
}

Write-Host "\nDone. Manual run command:"
Write-Host ".\\.venv\\Scripts\\python.exe -m waitress --host=0.0.0.0 --port=$Port app:app"
