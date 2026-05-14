[CmdletBinding()]
param(
    [string]$ProjectRoot = "",
    [string]$ServiceName = "attendance-system",
    [int]$Port = 5000,
    [string]$NssmPath = "",
    [string]$VenvDir = ".venv-win-prod"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $scriptBase = if ($PSScriptRoot) { $PSScriptRoot } elseif ($MyInvocation.MyCommand.Path) { Split-Path -Parent $MyInvocation.MyCommand.Path } else { (Get-Location).Path }
    $ProjectRoot = (Resolve-Path (Join-Path $scriptBase "..\..")).Path
}

function Resolve-NssmPath([string]$ConfiguredPath) {
    if (![string]::IsNullOrWhiteSpace($ConfiguredPath) -and (Test-Path $ConfiguredPath)) {
        return (Resolve-Path $ConfiguredPath).Path
    }

    $desktopDir = [Environment]::GetFolderPath("Desktop")
    if (-not [string]::IsNullOrWhiteSpace($desktopDir) -and (Test-Path $desktopDir)) {
        $desktopMatch = Get-ChildItem -Path $desktopDir -Filter nssm.exe -Recurse -File -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($null -ne $desktopMatch) {
            return $desktopMatch.FullName
        }
    }

    foreach ($path in @("C:\tools\nssm\win64\nssm.exe", "C:\tools\nssm\nssm.exe")) {
        if (Test-Path $path) {
            return (Resolve-Path $path).Path
        }
    }

    throw "nssm.exe not found. Put it on Desktop or pass -NssmPath explicitly."
}

$NssmPath = Resolve-NssmPath $NssmPath

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

& $NssmPath install $ServiceName $pythonExe "-m waitress --host=0.0.0.0 --port=$Port wsgi:app"
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
