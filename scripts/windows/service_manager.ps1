[CmdletBinding()]
param(
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..") ).Path,
    [string]$ServiceName = "attendance-system",
    [string]$Host = "0.0.0.0",
    [int]$DefaultPort = 8000,
    [string]$VenvDir = ".venv-win-prod",
    [string]$NssmPath = "C:\\tools\\nssm\\win64\\nssm.exe",
    [string]$PythonCmd = "python"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName Microsoft.VisualBasic
Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class ConsoleWindow {
    [DllImport("kernel32.dll")]
    public static extern IntPtr GetConsoleWindow();

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@

$consoleHandle = [ConsoleWindow]::GetConsoleWindow()
if ($consoleHandle -ne [IntPtr]::Zero) {
    [ConsoleWindow]::ShowWindow($consoleHandle, 0) | Out-Null
}

$configDir = Join-Path $ProjectRoot "instance"
$configPath = Join-Path $configDir "windows_service_manager.json"
$logDir = Join-Path $ProjectRoot "logs"
$stdoutLog = Join-Path $logDir "service-stdout.log"
$stderrLog = Join-Path $logDir "service-stderr.log"

function Show-Info([string]$Message) {
    [System.Windows.Forms.MessageBox]::Show(
        $Message,
        "考勤服务管理器",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Information
    ) | Out-Null
}

function Show-ErrorDialog([string]$Message) {
    [System.Windows.Forms.MessageBox]::Show(
        $Message,
        "考勤服务管理器",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
}

function Ensure-ProjectDirs() {
    $null = New-Item -ItemType Directory -Force -Path $configDir
    $null = New-Item -ItemType Directory -Force -Path (Join-Path $ProjectRoot "instance")
    $null = New-Item -ItemType Directory -Force -Path (Join-Path $ProjectRoot "static\uploads")
    $null = New-Item -ItemType Directory -Force -Path $logDir
}

function Ensure-Nssm() {
    if (!(Test-Path $NssmPath)) {
        throw "未找到 nssm.exe：$NssmPath"
    }
}

function Get-ServiceObject() {
    return Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
}

function Get-ServicePortFromNssm() {
    if (!(Test-Path $NssmPath)) {
        return $null
    }

    $service = Get-ServiceObject
    if ($null -eq $service) {
        return $null
    }

    $appParameters = & $NssmPath get $ServiceName AppParameters 2>$null
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($appParameters)) {
        return $null
    }

    if ($appParameters -match "--port=(\d+)") {
        return [int]$matches[1]
    }

    return $null
}

function Read-ManagerConfig() {
    Ensure-ProjectDirs

    $port = Get-ServicePortFromNssm
    if (Test-Path $configPath) {
        $config = Get-Content $configPath -Raw | ConvertFrom-Json
    } else {
        $config = [pscustomobject]@{
            Host = $Host
            Port = $DefaultPort
            VenvDir = $VenvDir
        }
    }

    if ($null -ne $port) {
        $config.Port = $port
    }

    if ([string]::IsNullOrWhiteSpace($config.Host)) {
        $config.Host = $Host
    }

    if ([string]::IsNullOrWhiteSpace($config.VenvDir)) {
        $config.VenvDir = $VenvDir
    }

    Write-ManagerConfig $config
    return $config
}

function Write-ManagerConfig($Config) {
    Ensure-ProjectDirs
    $Config | ConvertTo-Json | Set-Content -Path $configPath -Encoding UTF8
}

function Ensure-ProductionEnvironment() {
    Ensure-ProjectDirs

    $config = Read-ManagerConfig
    $venvRoot = Join-Path $ProjectRoot $config.VenvDir
    $venvPython = Join-Path $venvRoot "Scripts\python.exe"
    if (Test-Path $venvPython) {
        return $venvPython
    }

    $python = Get-Command $PythonCmd -ErrorAction SilentlyContinue
    if ($null -eq $python) {
        throw "未找到 Python，请先安装 Python，或调整脚本里的 PythonCmd 参数。"
    }

    & $python.Source -m venv $venvRoot
    if ($LASTEXITCODE -ne 0) {
        throw "创建虚拟环境失败：$venvRoot"
    }

    & $venvPython -m pip install --upgrade pip
    if ($LASTEXITCODE -ne 0) {
        throw "升级 pip 失败。"
    }

    & $venvPython -m pip install -r (Join-Path $ProjectRoot "requirements.txt") waitress
    if ($LASTEXITCODE -ne 0) {
        throw "安装依赖失败。"
    }

    $envPath = Join-Path $ProjectRoot ".env"
    $envExamplePath = Join-Path $ProjectRoot ".env.example"
    if (!(Test-Path $envPath) -and (Test-Path $envExamplePath)) {
        Copy-Item $envExamplePath $envPath
    }

    return $venvPython
}

function Ensure-ServiceConfigured([int]$Port) {
    Ensure-Nssm
    $pythonExe = Ensure-ProductionEnvironment
    Ensure-ProjectDirs

    $service = Get-ServiceObject
    if ($null -eq $service) {
        & $NssmPath install $ServiceName $pythonExe
        if ($LASTEXITCODE -ne 0) {
            throw "创建服务失败：$ServiceName"
        }
    }

    $appParameters = "-m waitress --host=$Host --port=$Port --threads=8 --channel-timeout=120 app:app"

    & $NssmPath set $ServiceName Application $pythonExe | Out-Null
    & $NssmPath set $ServiceName AppParameters $appParameters | Out-Null
    & $NssmPath set $ServiceName AppDirectory $ProjectRoot | Out-Null
    & $NssmPath set $ServiceName AppStdout $stdoutLog | Out-Null
    & $NssmPath set $ServiceName AppStderr $stderrLog | Out-Null
    & $NssmPath set $ServiceName AppRotateFiles 1 | Out-Null
    & $NssmPath set $ServiceName AppRotateOnline 1 | Out-Null
    & $NssmPath set $ServiceName AppRotateSeconds 86400 | Out-Null
    & $NssmPath set $ServiceName AppRotateBytes 10485760 | Out-Null
    & $NssmPath set $ServiceName Start SERVICE_AUTO_START | Out-Null
    & $NssmPath set $ServiceName AppEnvironmentExtra "PYTHONUNBUFFERED=1" | Out-Null

    $config = Read-ManagerConfig
    $config.Port = $Port
    Write-ManagerConfig $config
}

function Get-ServiceState() {
    $service = Get-ServiceObject
    $config = Read-ManagerConfig

    if ($null -eq $service) {
        return [pscustomobject]@{
            Exists = $false
            Running = $false
            Status = "未安装"
            Port = $config.Port
        }
    }

    return [pscustomobject]@{
        Exists = $true
        Running = $service.Status -eq [System.ServiceProcess.ServiceControllerStatus]::Running
        Status = [string]$service.Status
        Port = $config.Port
    }
}

function Start-ServiceSafe() {
    $config = Read-ManagerConfig
    Ensure-ServiceConfigured $config.Port

    $service = Get-ServiceObject
    if ($service.Status -ne [System.ServiceProcess.ServiceControllerStatus]::Running) {
        Start-Service -Name $ServiceName
    }
}

function Stop-ServiceSafe() {
    $service = Get-ServiceObject
    if ($null -eq $service) {
        throw "服务尚未安装。"
    }

    if ($service.Status -ne [System.ServiceProcess.ServiceControllerStatus]::Stopped) {
        Stop-Service -Name $ServiceName -Force
    }
}

function Restart-ServiceSafe() {
    $service = Get-ServiceObject
    if ($null -eq $service) {
        $config = Read-ManagerConfig
        Ensure-ServiceConfigured $config.Port
        Start-Service -Name $ServiceName
        return
    }

    $config = Read-ManagerConfig
    Ensure-ServiceConfigured $config.Port

    if ($service.Status -eq [System.ServiceProcess.ServiceControllerStatus]::Running) {
        Restart-Service -Name $ServiceName -Force
    } else {
        Start-Service -Name $ServiceName
    }
}

function Update-Port() {
    $config = Read-ManagerConfig
    $portText = [Microsoft.VisualBasic.Interaction]::InputBox(
        "请输入新的服务端口（1-65535）",
        "修改端口",
        [string]$config.Port
    )

    if ([string]::IsNullOrWhiteSpace($portText)) {
        return
    }

    $newPort = 0
    if (![int]::TryParse($portText, [ref]$newPort) -or $newPort -lt 1 -or $newPort -gt 65535) {
        throw "端口无效，请输入 1 到 65535 之间的整数。"
    }

    $state = Get-ServiceState
    Ensure-ServiceConfigured $newPort

    if ($state.Running) {
        Restart-Service -Name $ServiceName -Force
        Show-Info("端口已修改为 $newPort，服务已自动重启。")
    } else {
        Show-Info("端口已修改为 $newPort。服务当前未运行，下次启动时生效。")
    }
}

[System.Windows.Forms.Application]::EnableVisualStyles()

$notifyIcon = New-Object System.Windows.Forms.NotifyIcon
$notifyIcon.Icon = [System.Drawing.SystemIcons]::Application
$notifyIcon.Visible = $true

$contextMenu = New-Object System.Windows.Forms.ContextMenuStrip
$statusItem = New-Object System.Windows.Forms.ToolStripMenuItem
$statusItem.Enabled = $false
$portItem = New-Object System.Windows.Forms.ToolStripMenuItem
$portItem.Enabled = $false
$separator1 = New-Object System.Windows.Forms.ToolStripSeparator
$startItem = New-Object System.Windows.Forms.ToolStripMenuItem "启动服务"
$stopItem = New-Object System.Windows.Forms.ToolStripMenuItem "关闭服务"
$restartItem = New-Object System.Windows.Forms.ToolStripMenuItem "重启服务"
$changePortItem = New-Object System.Windows.Forms.ToolStripMenuItem "修改端口"
$separator2 = New-Object System.Windows.Forms.ToolStripSeparator
$exitItem = New-Object System.Windows.Forms.ToolStripMenuItem "退出程序"

$null = $contextMenu.Items.Add($statusItem)
$null = $contextMenu.Items.Add($portItem)
$null = $contextMenu.Items.Add($separator1)
$null = $contextMenu.Items.Add($startItem)
$null = $contextMenu.Items.Add($stopItem)
$null = $contextMenu.Items.Add($restartItem)
$null = $contextMenu.Items.Add($changePortItem)
$null = $contextMenu.Items.Add($separator2)
$null = $contextMenu.Items.Add($exitItem)

$notifyIcon.ContextMenuStrip = $contextMenu

function Refresh-Ui() {
    $state = Get-ServiceState
    $statusItem.Text = "服务状态：$($state.Status)"
    $portItem.Text = "当前端口：$($state.Port)"
    $startItem.Enabled = !$state.Running
    $stopItem.Enabled = $state.Exists -and $state.Running
    $restartItem.Enabled = $true
    $notifyIcon.Text = "考勤服务管理器 - $($state.Status) - 端口 $($state.Port)"
}

$startItem.Add_Click({
    try {
        Start-ServiceSafe
        Refresh-Ui
        Show-Info("服务已启动。")
    } catch {
        Show-ErrorDialog($_.Exception.Message)
        Refresh-Ui
    }
})

$stopItem.Add_Click({
    try {
        Stop-ServiceSafe
        Refresh-Ui
        Show-Info("服务已关闭。")
    } catch {
        Show-ErrorDialog($_.Exception.Message)
        Refresh-Ui
    }
})

$restartItem.Add_Click({
    try {
        Restart-ServiceSafe
        Refresh-Ui
        Show-Info("服务已重启。")
    } catch {
        Show-ErrorDialog($_.Exception.Message)
        Refresh-Ui
    }
})

$changePortItem.Add_Click({
    try {
        Update-Port
        Refresh-Ui
    } catch {
        Show-ErrorDialog($_.Exception.Message)
        Refresh-Ui
    }
})

$exitItem.Add_Click({
    $notifyIcon.Visible = $false
    $notifyIcon.Dispose()
    $contextMenu.Dispose()
    [System.Windows.Forms.Application]::Exit()
})

$contextMenu.Add_Opening({
    Refresh-Ui
})

$notifyIcon.Add_DoubleClick({
    Refresh-Ui
    $state = Get-ServiceState
    Show-Info("服务状态：$($state.Status)`n当前端口：$($state.Port)`n服务名称：$ServiceName")
})

Refresh-Ui
[System.Windows.Forms.Application]::Run()
