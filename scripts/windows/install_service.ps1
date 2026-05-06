[CmdletBinding()]
param(
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..") ).Path,
    [string]$ServiceName = "attendance-system",
    [int]$Port = 5000,
    [string]$NssmPath = "C:\\tools\\nssm\\win64\\nssm.exe",
    [string]$VenvDir = ".venv-win-prod"
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $NssmPath)) {
    throw "nssm.exe not found: $NssmPath"
}

$pythonExe = Join-Path $ProjectRoot "$VenvDir\Scripts\python.exe"
if (!(Test-Path $pythonExe)) {
    throw "Python venv not found. Run scripts/windows/bootstrap_windows.ps1 first."
}

$logDir = Join-Path $ProjectRoot "logs"
$stdoutLog = Join-Path $logDir "service-stdout.log"
$stderrLog = Join-Path $logDir "service-stderr.log"
$null = New-Item -ItemType Directory -Force -Path $logDir

& $NssmPath stop $ServiceName 2>$null | Out-Null
& $NssmPath remove $ServiceName confirm 2>$null | Out-Null

& $NssmPath install $ServiceName $pythonExe "-m waitress --host=0.0.0.0 --port=$Port app:app"
& $NssmPath set $ServiceName AppDirectory $ProjectRoot
& $NssmPath set $ServiceName AppStdout $stdoutLog
& $NssmPath set $ServiceName AppStderr $stderrLog
& $NssmPath set $ServiceName AppRotateFiles 1
& $NssmPath set $ServiceName AppRotateOnline 1
& $NssmPath set $ServiceName AppRotateSeconds 86400
& $NssmPath set $ServiceName AppRotateBytes 10485760
& $NssmPath set $ServiceName Start SERVICE_AUTO_START
& $NssmPath set $ServiceName AppEnvironmentExtra "PYTHONUNBUFFERED=1"

& $NssmPath start $ServiceName
Write-Host "Service installed and started: $ServiceName"
