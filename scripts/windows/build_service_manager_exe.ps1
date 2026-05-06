[CmdletBinding()]
param(
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..") ).Path,
    [string]$OutputDir = "",
    [string]$ExeName = "AttendanceServiceManager.exe",
    [string]$ModuleScope = "CurrentUser",
    [switch]$ForceInstallModule
)

$ErrorActionPreference = "Stop"

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
if ($null -eq $ps2exeCommand -or $ForceInstallModule) {
    Write-Host "[1/3] 安装或更新 ps2exe 模块..."
    Install-Module -Name ps2exe -Scope $ModuleScope -Force -AllowClobber
    $ps2exeCommand = Get-Command Invoke-PS2EXE -ErrorAction Stop
} else {
    Write-Host "[1/3] 已找到 ps2exe 模块。"
}

Write-Host "[2/3] 开始打包 EXE..."
Invoke-PS2EXE `
    -InputFile $sourceScript `
    -OutputFile $outputExe `
    -NoConsole `
    -Title "考勤服务管理器" `
    -Description "考勤系统 Windows 后台服务管理器" `
    -Company "MtEmployeeAttendance-System" `
    -Product "Attendance Service Manager" `
    -Copyright "Lewis"

if (!(Test-Path $outputExe)) {
    throw "打包失败，未生成 EXE：$outputExe"
}

Write-Host "[3/3] 打包完成：$outputExe"
Write-Host "可直接双击运行，或放到 Windows 开机启动目录。"
