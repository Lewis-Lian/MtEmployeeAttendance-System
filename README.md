# MtEmployeeAttendance-System 

```bash
cd /home/lewis/Code/attendance_system
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python3 app.py
```

## Excel Import

Admin dashboard supports importing these files:
- `加班单.xlsx`
- `请假单查询.xlsx`
- `2026_3月员工基础数据.xls`
- `2026_3月员工基础数据(月报).xls`

Parser engine:
- `.xlsx` => `openpyxl`
- `.xls` => `xlrd`

## Windows Migration / Deployment

### 1) Prepare target machine

- Install Python 3.12 (enable `Add Python to PATH`)
- Install NSSM (recommended path: `C:\tools\nssm\win64\nssm.exe`)
- Copy project to Windows host, e.g. `D:\attendance_system`

### 2) Bootstrap once

Run in PowerShell (as Admin recommended):

```powershell
cd D:\attendance_system
powershell -ExecutionPolicy Bypass -File .\scripts\windows\bootstrap_windows.ps1 -ProjectRoot "D:\attendance_system" -InitEnv
```

If your network has SSL issues when downloading packages, keep mirror params explicit:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\bootstrap_windows.ps1 -ProjectRoot "D:\attendance_system" -InitEnv -PipIndexUrl "https://pypi.tuna.tsinghua.edu.cn/simple" -PipTrustedHost "pypi.tuna.tsinghua.edu.cn"
```

Manual run (for smoke test):

```powershell
.\.venv\Scripts\python.exe -m waitress --host=0.0.0.0 --port=5000 app:app
```

Do not use `python app.py` in production. That runs Flask development server and will show:
`WARNING: This is a development server...`

### 3) Install as Windows service

```powershell
cd D:\attendance_system
powershell -ExecutionPolicy Bypass -File .\scripts\windows\install_service.ps1 -ProjectRoot "D:\attendance_system" -ServiceName "attendance-system" -Port 5000 -NssmPath "C:\tools\nssm\win64\nssm.exe"
```

Service logs:
- `D:\attendance_system\logs\service-stdout.log`
- `D:\attendance_system\logs\service-stderr.log`

### 4) Backup before upgrade

```powershell
cd D:\attendance_system
powershell -ExecutionPolicy Bypass -File .\scripts\windows\backup_state.ps1 -ProjectRoot "D:\attendance_system"
```

Backed up:
- `.env`
- `instance\attendance.db`
- `static\uploads`

### 5) Rollback

```powershell
cd D:\attendance_system
powershell -ExecutionPolicy Bypass -File .\scripts\windows\rollback_state.ps1 -ProjectRoot "D:\attendance_system" -BackupDir "D:\attendance_system\backups\20260423_120000"
```

After rollback, restart service:

```powershell
C:\tools\nssm\win64\nssm.exe restart attendance-system
```

## Karpathy Skills Integration

Integrated from: <https://github.com/forrestchang/andrej-karpathy-skills>

Added files:
- `CLAUDE.md` (project-level behavior guidelines)
- `skills/karpathy-guidelines/SKILL.md` (reusable skill definition)
- `.cursor/rules/karpathy-guidelines.mdc` (Cursor auto-applied rule)
- `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`

Quick usage:
- Claude Code: keep `CLAUDE.md` at repo root (already added)
- Cursor: open this repo and the rule in `.cursor/rules` is auto-applied
- Codex/other agents: follow `CLAUDE.md` and `skills/karpathy-guidelines/SKILL.md` as project engineering constraints
