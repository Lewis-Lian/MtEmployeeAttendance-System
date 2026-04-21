# Attendance Data Processing System (考勤数据处理系统)

## Setup

```bash
cd /home/lewis/Code/attendance_system
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python3 app.py
```

Default admin:
- username: `admin`
- password: `admin123`

## Excel Import

Admin dashboard supports importing these files:
- `加班单.xlsx`
- `请假单查询.xlsx`
- `2026_3月员工基础数据.xls`
- `2026_3月员工基础数据(月报).xls`

Parser engine:
- `.xlsx` => `openpyxl`
- `.xls` => `xlrd`
