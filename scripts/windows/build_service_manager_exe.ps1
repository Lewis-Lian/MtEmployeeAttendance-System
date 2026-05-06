[CmdletBinding()]
param(
    [string]$ProjectRoot = "",
    [string]$OutputDir = "",
    [string]$ExeName = "AttendanceServiceManager.exe",
    [string]$ModuleScope = "CurrentUser",
    [switch]$ForceInstallModule
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $scriptBase = if ($PSScriptRoot) { $PSScriptRoot } elseif ($MyInvocation.MyCommand.Path) { Split-Path -Parent $MyInvocation.MyCommand.Path } else { (Get-Location).Path }
    $ProjectRoot = (Resolve-Path (Join-Path $scriptBase "..\..")).Path
}

Set-Location $ProjectRoot

$sourceScript = Join-Path $ProjectRoot "scripts\windows\service_manager.ps1"
if (!(Test-Path $sourceScript)) {
    throw "未找到源脚本：$sourceScript"
}

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $OutputDir = Join-Path $ProjectRoot "dist\windows-service-manager"
}

$null = New-Item -ItemType Directory -Force -Path $OutputDir
$outputExe = Join-Path $OutputDir $ExeName

$ps2exeCommand = Get-Command Invoke-PS2EXE -ErrorAction SilentlyContinue
if (($null -eq $ps2exeCommand) -or $ForceInstallModule.IsPresent) {
    Write-Host "[1/3] Installing or updating ps2exe..."
    Install-Module -Name ps2exe -Scope $ModuleScope -Force -AllowClobber
    $ps2exeCommand = Get-Command Invoke-PS2EXE -ErrorAction Stop
} else {
    Write-Host "[1/3] ps2exe found."
}

Write-Host "[2/3] Building EXE..."
Invoke-PS2EXE `
    -InputFile $sourceScript `
    -OutputFile $outputExe `
    -NoConsole `
    -Title "Attendance Service Manager" `
    -Description "Attendance system Windows background service manager" `
    -Company "MtEmployeeAttendance-System" `
    -Product "Attendance Service Manager" `
    -Copyright "Lewis"

if (!(Test-Path $outputExe)) {
    throw "Build failed, EXE not found: $outputExe"
}

$startBat = Join-Path $OutputDir "StartAttendanceServiceManager.bat"
$startBatContent = @"
@echo off
start "" "%~dp0$ExeName"
"@
Set-Content -Path $startBat -Encoding ASCII -Value $startBatContent

Write-Host "[3/3] Build completed: $outputExe"
Write-Host "Launcher created: $startBat"
