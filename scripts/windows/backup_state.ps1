[CmdletBinding()]
param(
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..") ).Path,
    [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"

$ts = Get-Date -Format "yyyyMMdd_HHmmss"
if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $OutputDir = Join-Path $ProjectRoot "backups\$ts"
}
$null = New-Item -ItemType Directory -Force -Path $OutputDir

$items = @(
    (Join-Path $ProjectRoot ".env"),
    (Join-Path $ProjectRoot "instance\attendance.db"),
    (Join-Path $ProjectRoot "static\uploads")
)

foreach ($item in $items) {
    if (Test-Path $item) {
        Copy-Item $item $OutputDir -Recurse -Force
    }
}

Write-Host "Backup completed: $OutputDir"
