[CmdletBinding()]
param(
    [string]$ProjectRoot = "",
    [string]$ServiceName = "attendance-system",
    [string]$BindHost = "0.0.0.0",
    [int]$DefaultPort = 8000,
    [string]$VenvDir = ".venv-win-prod",
    [string]$NssmPath = "",
    [string]$PythonCmd = "python",
    [string]$ManagerExePath = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $scriptBase = if ($PSScriptRoot) { $PSScriptRoot } elseif ($MyInvocation.MyCommand.Path) { Split-Path -Parent $MyInvocation.MyCommand.Path } else { (Get-Location).Path }
    $ProjectRoot = (Resolve-Path (Join-Path $scriptBase "..\..")).Path
}

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
$startupShortcutName = "Attendance Service Manager.lnk"
$appTitle = "考勤服务管理器"

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

    return $null
}

function Resolve-ManagerExePath([string]$ConfiguredPath) {
    if (![string]::IsNullOrWhiteSpace($ConfiguredPath) -and (Test-Path $ConfiguredPath)) {
        return (Resolve-Path $ConfiguredPath).Path
    }

    $exeCandidate = [System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
    $exeName = [System.IO.Path]::GetFileName($exeCandidate)
    if (
        ![string]::IsNullOrWhiteSpace($exeCandidate) -and
        $exeCandidate -like "*.exe" -and
        (Test-Path $exeCandidate) -and
        $exeName -notin @("powershell.exe", "pwsh.exe")
    ) {
        return $exeCandidate
    }

    return $null
}

$NssmPath = Resolve-NssmPath $NssmPath
$ManagerExePath = Resolve-ManagerExePath $ManagerExePath

function Show-Info([string]$Message) {
    [System.Windows.Forms.MessageBox]::Show(
        $Message,
        $appTitle,
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Information
    ) | Out-Null
}

function Show-ErrorDialog([string]$Message) {
    [System.Windows.Forms.MessageBox]::Show(
        $Message,
        $appTitle,
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
}

function Ensure-ProjectDirs() {
    $null = New-Item -ItemType Directory -Force -Path $configDir
    $null = New-Item -ItemType Directory -Force -Path (Join-Path $ProjectRoot "static\uploads")
    $null = New-Item -ItemType Directory -Force -Path $logDir
}

function Ensure-Nssm() {
    if ([string]::IsNullOrWhiteSpace($NssmPath) -or !(Test-Path $NssmPath)) {
        throw "未找到 nssm.exe。请将 nssm.exe 放到桌面，或放到 C:\tools\nssm\win64\ 下。"
    }
}

function Get-ServiceObject() {
    Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
}

function Get-ServicePortFromNssm() {
    if ([string]::IsNullOrWhiteSpace($NssmPath) -or !(Test-Path $NssmPath)) {
        return $null
    }

    if ($null -eq (Get-ServiceObject)) {
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

function Get-StartupShortcutPath() {
    $startupDir = [Environment]::GetFolderPath("Startup")
    return Join-Path $startupDir $startupShortcutName
}

function Read-ManagerConfig() {
    Ensure-ProjectDirs

    if (Test-Path $configPath) {
        $config = Get-Content $configPath -Raw | ConvertFrom-Json
    } else {
        $config = [pscustomobject]@{
            Host = $BindHost
            Port = $DefaultPort
            VenvDir = $VenvDir
            AutoStartManager = $false
        }
    }

    $servicePort = Get-ServicePortFromNssm
    if ($null -ne $servicePort) {
        $config.Port = $servicePort
    }

    if ([string]::IsNullOrWhiteSpace($config.Host)) {
        $config.Host = $BindHost
    }

    if ([string]::IsNullOrWhiteSpace($config.VenvDir)) {
        $config.VenvDir = $VenvDir
    }

    if ($null -eq $config.PSObject.Properties["AutoStartManager"]) {
        $config | Add-Member -NotePropertyName AutoStartManager -NotePropertyValue $false
    }

    $config.AutoStartManager = Test-Path (Get-StartupShortcutPath)
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
        throw "未找到 Python。请先安装 Python，并确保 python 在 PATH 中。"
    }

    & $python.Source -m venv $venvRoot
    if ($LASTEXITCODE -ne 0) {
        throw "创建生产虚拟环境失败：$venvRoot"
    }

    & $venvPython -m pip install --upgrade pip
    if ($LASTEXITCODE -ne 0) {
        throw "升级 pip 失败。"
    }

    & $venvPython -m pip install -r (Join-Path $ProjectRoot "requirements.txt") waitress
    if ($LASTEXITCODE -ne 0) {
        throw "安装生产依赖失败。"
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
    Ensure-ProjectDirs
    $pythonExe = Ensure-ProductionEnvironment

    $service = Get-ServiceObject
    if ($null -eq $service) {
        & $NssmPath install $ServiceName $pythonExe | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "创建 Windows 服务失败：$ServiceName"
        }
    }

    $appParameters = "-m waitress --host=$BindHost --port=$Port --threads=8 --channel-timeout=120 app:app"

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
    $config = Read-ManagerConfig
    $service = Get-ServiceObject

    if ($null -eq $service) {
        return [pscustomobject]@{
            Exists = $false
            Running = $false
            Status = "未安装"
            Port = $config.Port
            AutoStartManager = $config.AutoStartManager
        }
    }

    return [pscustomobject]@{
        Exists = $true
        Running = $service.Status -eq [System.ServiceProcess.ServiceControllerStatus]::Running
        Status = [string]$service.Status
        Port = $config.Port
        AutoStartManager = $config.AutoStartManager
    }
}

function Start-ServiceSafe() {
    $config = Read-ManagerConfig
    Ensure-ServiceConfigured $config.Port

    $service = Get-ServiceObject
    if ($null -eq $service) {
        throw "服务创建失败。"
    }

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
    $config = Read-ManagerConfig
    Ensure-ServiceConfigured $config.Port

    $service = Get-ServiceObject
    if ($null -eq $service) {
        throw "服务尚未安装。"
    }

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

function Set-ManagerAutoStart([bool]$Enabled) {
    if ([string]::IsNullOrWhiteSpace($ManagerExePath) -or !(Test-Path $ManagerExePath)) {
        throw "当前未检测到可用于开机自启的 EXE 路径。请使用打包后的 EXE 运行。"
    }

    $shortcutPath = Get-StartupShortcutPath
    if ($Enabled) {
        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = $ManagerExePath
        $shortcut.WorkingDirectory = Split-Path $ManagerExePath -Parent
        $shortcut.WindowStyle = 7
        $shortcut.Description = $appTitle
        $shortcut.Save()
    } else {
        if (Test-Path $shortcutPath) {
            Remove-Item -LiteralPath $shortcutPath -Force
        }
    }

    $config = Read-ManagerConfig
    $config.AutoStartManager = $Enabled
    Write-ManagerConfig $config
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
$autoStartStatusItem = New-Object System.Windows.Forms.ToolStripMenuItem
$autoStartStatusItem.Enabled = $false
$separator1 = New-Object System.Windows.Forms.ToolStripSeparator
$startItem = New-Object System.Windows.Forms.ToolStripMenuItem "启动服务"
$stopItem = New-Object System.Windows.Forms.ToolStripMenuItem "停止服务"
$restartItem = New-Object System.Windows.Forms.ToolStripMenuItem "重启服务"
$changePortItem = New-Object System.Windows.Forms.ToolStripMenuItem "修改端口"
$autoStartManagerItem = New-Object System.Windows.Forms.ToolStripMenuItem "开机自动启动管理器"
$separator2 = New-Object System.Windows.Forms.ToolStripSeparator
$exitItem = New-Object System.Windows.Forms.ToolStripMenuItem "退出程序"

$null = $contextMenu.Items.Add($statusItem)
$null = $contextMenu.Items.Add($portItem)
$null = $contextMenu.Items.Add($autoStartStatusItem)
$null = $contextMenu.Items.Add($separator1)
$null = $contextMenu.Items.Add($startItem)
$null = $contextMenu.Items.Add($stopItem)
$null = $contextMenu.Items.Add($restartItem)
$null = $contextMenu.Items.Add($changePortItem)
$null = $contextMenu.Items.Add($autoStartManagerItem)
$null = $contextMenu.Items.Add($separator2)
$null = $contextMenu.Items.Add($exitItem)

$notifyIcon.ContextMenuStrip = $contextMenu

function Refresh-Ui() {
    $state = Get-ServiceState
    $statusItem.Text = "服务状态：$($state.Status)"
    $portItem.Text = "当前端口：$($state.Port)"
    $autoStartStatusItem.Text = "开机自启：$(if ($state.AutoStartManager) { '已开启' } else { '未开启' })"
    $startItem.Enabled = !$state.Running
    $stopItem.Enabled = $state.Exists -and $state.Running
    $restartItem.Enabled = $state.Exists
    $changePortItem.Enabled = $true
    $autoStartManagerItem.Checked = [bool]$state.AutoStartManager
    $notifyIcon.Text = "$appTitle - $($state.Status) - 端口 $($state.Port)"
}

$startItem.Add_Click({
    try {
        Start-ServiceSafe
        Refresh-Ui
        Show-Info("服务已启动，当前为生产模式。")
    } catch {
        Show-ErrorDialog($_.Exception.Message)
        Refresh-Ui
    }
})

$stopItem.Add_Click({
    try {
        Stop-ServiceSafe
        Refresh-Ui
        Show-Info("服务已停止。")
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

$autoStartManagerItem.Add_Click({
    try {
        $targetState = -not $autoStartManagerItem.Checked
        Set-ManagerAutoStart $targetState
        Refresh-Ui
        if ($targetState) {
            Show-Info("已开启开机自动启动管理器。")
        } else {
            Show-Info("已关闭开机自动启动管理器。")
        }
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
    Show-Info("服务状态：$($state.Status)`n当前端口：$($state.Port)`n服务名：$ServiceName")
})

try {
    Start-ServiceSafe
} catch {
    Show-ErrorDialog($_.Exception.Message)
}

Refresh-Ui
[System.Windows.Forms.Application]::Run()
