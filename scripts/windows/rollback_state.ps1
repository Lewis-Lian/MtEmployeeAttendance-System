[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$BackupDir,
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..") ).Path
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $BackupDir)) {
    throw "Backup directory not found: $BackupDir"
}

$envSrc = Join-Path $BackupDir ".env"
$dbSrc = Join-Path $BackupDir "attendance.db"
$uploadsSrc = Join-Path $BackupDir "uploads"

if (Test-Path $envSrc) {
    Copy-Item $envSrc (Join-Path $ProjectRoot ".env") -Force
}
if (Test-Path $dbSrc) {
    $null = New-Item -ItemType Directory -Force -Path (Join-Path $ProjectRoot "instance")
    Copy-Item $dbSrc (Join-Path $ProjectRoot "instance\attendance.db") -Force
}
if (Test-Path $uploadsSrc) {
    Remove-Item (Join-Path $ProjectRoot "static\uploads") -Recurse -Force -ErrorAction SilentlyContinue
    Copy-Item $uploadsSrc (Join-Path $ProjectRoot "static\uploads") -Recurse -Force
}

Write-Host "Rollback completed from: $BackupDir"
