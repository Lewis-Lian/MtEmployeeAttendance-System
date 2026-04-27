from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
from typing import Any

from models import db
from models.department import Department
from models.employee import Employee
from models.shift import Shift
from models.daily_record import DailyRecord
from models.monthly_report import MonthlyReport
from models.overtime import OvertimeRecord
from models.leave import LeaveRecord
from models.annual_leave import AnnualLeave
from utils.excel_parser import ExcelParser
from utils.helpers import (
    clean_text,
    parse_bool_zh,
    parse_date,
    parse_datetime,
    parse_float,
    parse_int,
    split_time_cells,
)


class ImportService:
    @staticmethod
    def import_file(file_path: str) -> dict:
        filename = os.path.basename(file_path)
        cleanup_dir: str | None = None
        rows: list[list[Any]] = []

        try:
            try:
                rows = ExcelParser.read_rows(file_path)
            except Exception:
                rows = []

            # Some legacy xls files fail in xlrd; fallback to libreoffice conversion.
            if (not rows) and file_path.lower().endswith(".xls"):
                converted_path, tmpdir = ImportService._convert_xls_to_xlsx(file_path)
                if converted_path:
                    cleanup_dir = tmpdir
                    rows = ExcelParser.read_rows(converted_path)

            if not rows:
                return {"status": "error", "message": "Empty file or unsupported xls structure"}

            if "加班" in filename:
                stats = ImportService._import_overtime(rows)
                return {"status": "ok", "file_type": "overtime", **stats}
            if "请假" in filename:
                stats = ImportService._import_leave(rows)
                return {"status": "ok", "file_type": "leave", **stats}
            if "月报" in filename:
                stats = ImportService._import_monthly_report(rows, filename)
                return {"status": "ok", "file_type": "monthly", **stats}
            stats = ImportService._import_daily_records(rows)
            return {"status": "ok", "file_type": "daily", **stats}
        finally:
            if cleanup_dir and os.path.isdir(cleanup_dir):
                shutil.rmtree(cleanup_dir, ignore_errors=True)

    @staticmethod
    def _convert_xls_to_xlsx(file_path: str) -> tuple[str | None, str | None]:
        tmpdir = tempfile.mkdtemp(prefix="attendance_xls_")
        try:
            profile_dir = os.path.join(tmpdir, "lo-profile")
            os.makedirs(profile_dir, exist_ok=True)
            env = os.environ.copy()
            env["HOME"] = tmpdir
            env["XDG_CONFIG_HOME"] = tmpdir
            subprocess.run(
                [
                    "libreoffice",
                    f"-env:UserInstallation=file://{profile_dir}",
                    "--headless",
                    "--convert-to",
                    "xlsx",
                    "--outdir",
                    tmpdir,
                    file_path,
                ],
                check=False,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                env=env,
            )
            basename = os.path.splitext(os.path.basename(file_path))[0]
            converted_path = os.path.join(tmpdir, f"{basename}.xlsx")
            if os.path.exists(converted_path):
                return converted_path, tmpdir
            shutil.rmtree(tmpdir, ignore_errors=True)
            return None, None
        except Exception:
            shutil.rmtree(tmpdir, ignore_errors=True)
            return None, None

    @staticmethod
    def _build_header_map(header: list[Any]) -> dict[str, int]:
        result: dict[str, int] = {}
        for i, h in enumerate(header):
            text = clean_text(h)
            if text:
                result[text] = i
        return result

    @staticmethod
    def _find_col(header_map: dict[str, int], *names: str) -> int:
        for n in names:
            if n in header_map:
                return header_map[n]
        return -1

    @staticmethod
    def _find_header_row(rows: list[list[Any]], required_cols: list[str], probe_rows: int = 8) -> int:
        limit = min(len(rows), probe_rows)
        best_idx = 0
        best_score = -1
        for idx in range(limit):
            header_map = ImportService._build_header_map(rows[idx])
            score = sum(1 for col in required_cols if col in header_map)
            if score > best_score:
                best_idx = idx
                best_score = score
        return best_idx

    @staticmethod
    def _get_row_value(row: list[Any], idx: int) -> Any:
        if idx < 0:
            return None
        return row[idx] if idx < len(row) else None

    @staticmethod
    def _get_or_create_department(dept_no: str, dept_name: str) -> Department:
        dept_no = dept_no or dept_name or "UNKNOWN"
        dept = Department.query.filter_by(dept_no=dept_no).first()
        if not dept:
            dept = Department(dept_no=dept_no, dept_name=dept_name or dept_no)
            db.session.add(dept)
            db.session.flush()
        elif dept_name and dept.dept_name != dept_name:
            dept.dept_name = dept_name
        return dept

    @staticmethod
    def _get_or_create_employee(emp_no: str, name: str, dept: Department | None) -> Employee:
        emp = Employee.query.filter_by(emp_no=emp_no).first()
        if not emp:
            emp = Employee(emp_no=emp_no, name=name or emp_no, dept_id=dept.id if dept else None)
            db.session.add(emp)
            db.session.flush()
        else:
            if name:
                emp.name = name
            if dept:
                emp.dept_id = dept.id
        return emp

    @staticmethod
    def _get_or_create_shift(shift_no: str, shift_name: str, shift_time_text: Any) -> Shift | None:
        if not shift_no and not shift_name:
            return None
        key = shift_no or shift_name
        shift = Shift.query.filter_by(shift_no=key).first()
        slots = ImportService._parse_shift_slots(shift_time_text)
        is_cross_day = any(s[0] > s[1] for s in slots if len(s) == 2)
        if not shift:
            shift = Shift(
                shift_no=key,
                shift_name=shift_name or key,
                time_slots=slots,
                is_cross_day=is_cross_day,
            )
            db.session.add(shift)
            db.session.flush()
        else:
            if shift_name:
                shift.shift_name = shift_name
            if slots:
                shift.time_slots = slots
                shift.is_cross_day = is_cross_day
        return shift

    @staticmethod
    def _find_existing_employee(emp_no: str) -> Employee | None:
        key = clean_text(emp_no)
        if not key:
            return None
        return Employee.query.filter_by(emp_no=key).first()

    @staticmethod
    def _find_existing_shift(shift_no: str, shift_name: str) -> Shift | None:
        no_key = clean_text(shift_no)
        name_key = clean_text(shift_name)
        if no_key:
            shift = Shift.query.filter_by(shift_no=no_key).first()
            if shift:
                return shift
        if name_key:
            return Shift.query.filter_by(shift_name=name_key).first()
        return None

    @staticmethod
    def _parse_shift_slots(value: Any) -> list[list[str]]:
        text = clean_text(value)
        if not text:
            return []
        normalized = text.replace("；", ";").replace("，", ",").replace("~", "-")
        parts = re.split(r"[;\n]", normalized)
        slots: list[list[str]] = []
        for p in parts:
            seg = p.strip()
            if not seg:
                continue
            if "-" in seg:
                a, b = seg.split("-", 1)
                slots.append([a.strip(), b.strip()])
        return slots

    @staticmethod
    def _import_overtime(rows: list[list[Any]]) -> dict[str, int]:
        header_idx = ImportService._find_header_row(rows, ["加班单号", "工号", "开始时间", "结束时间"])
        header_map = ImportService._build_header_map(rows[header_idx])
        imported = 0
        scanned = 0
        skipped_no_key = 0
        skipped_unknown_employee = 0
        for row in rows[header_idx + 1 :]:
            overtime_no = clean_text(ImportService._get_row_value(row, ImportService._find_col(header_map, "加班单号")))
            if not overtime_no:
                skipped_no_key += 1
                continue
            scanned += 1
            emp_name = clean_text(ImportService._get_row_value(row, ImportService._find_col(header_map, "姓名")))
            emp_no = clean_text(ImportService._get_row_value(row, ImportService._find_col(header_map, "工号")))
            if not emp_no:
                skipped_no_key += 1
                continue

            emp = ImportService._find_existing_employee(emp_no)
            if not emp:
                skipped_unknown_employee += 1
                continue
            if emp_name:
                emp.name = emp_name

            record = OvertimeRecord.query.filter_by(overtime_no=overtime_no).first()
            if not record:
                record = OvertimeRecord(overtime_no=overtime_no, emp_id=emp.id)
                db.session.add(record)

            record.emp_id = emp.id
            record.start_time = parse_datetime(ImportService._get_row_value(row, ImportService._find_col(header_map, "开始时间")))
            record.end_time = parse_datetime(ImportService._get_row_value(row, ImportService._find_col(header_map, "结束时间")))
            record.is_weekend = parse_bool_zh(ImportService._get_row_value(row, ImportService._find_col(header_map, "是否周末加班")))
            record.is_holiday = parse_bool_zh(ImportService._get_row_value(row, ImportService._find_col(header_map, "是否法定加班")))
            record.salary_option = clean_text(ImportService._get_row_value(row, ImportService._find_col(header_map, "计薪选项")))
            record.effective_hours = parse_float(ImportService._get_row_value(row, ImportService._find_col(header_map, "有效工时")))
            record.reason = clean_text(ImportService._get_row_value(row, ImportService._find_col(header_map, "加班事由")))
            record.approval_comment = clean_text(ImportService._get_row_value(row, ImportService._find_col(header_map, "部门主管意见")))
            record.approval_status = "已审批" if record.approval_comment else "未知"
            imported += 1

        db.session.commit()
        return {
            "total_rows": max(len(rows) - header_idx - 1, 0),
            "scanned": scanned,
            "imported": imported,
            "skipped": scanned - imported,
            "skipped_no_key": skipped_no_key,
            "skipped_unknown_employee": skipped_unknown_employee,
        }

    @staticmethod
    def _import_leave(rows: list[list[Any]]) -> dict[str, int]:
        header_idx = ImportService._find_header_row(rows, ["请假单号", "工号", "请假类型", "开始时间", "结束时间"])
        header_map = ImportService._build_header_map(rows[header_idx])
        imported = 0
        scanned = 0
        skipped_no_key = 0
        skipped_unknown_employee = 0
        for row in rows[header_idx + 1 :]:
            leave_no = clean_text(ImportService._get_row_value(row, ImportService._find_col(header_map, "请假单号")))
            if not leave_no:
                skipped_no_key += 1
                continue
            scanned += 1

            emp_no = clean_text(ImportService._get_row_value(row, ImportService._find_col(header_map, "工号")))
            emp_name = clean_text(ImportService._get_row_value(row, ImportService._find_col(header_map, "请假人")))
            if not emp_no:
                skipped_no_key += 1
                continue

            emp = ImportService._find_existing_employee(emp_no)
            if not emp:
                skipped_unknown_employee += 1
                continue
            if emp_name:
                emp.name = emp_name

            record = LeaveRecord.query.filter_by(leave_no=leave_no).first()
            if not record:
                record = LeaveRecord(leave_no=leave_no, emp_id=emp.id)
                db.session.add(record)

            record.emp_id = emp.id
            record.apply_date = parse_date(ImportService._get_row_value(row, ImportService._find_col(header_map, "申请日期")))
            record.leave_type = clean_text(ImportService._get_row_value(row, ImportService._find_col(header_map, "请假类型")))
            record.start_time = parse_datetime(ImportService._get_row_value(row, ImportService._find_col(header_map, "开始时间")))
            record.end_time = parse_datetime(ImportService._get_row_value(row, ImportService._find_col(header_map, "结束时间")))
            record.duration = parse_float(ImportService._get_row_value(row, ImportService._find_col(header_map, "时长")))
            record.reason = clean_text(ImportService._get_row_value(row, ImportService._find_col(header_map, "事由文本")))
            record.approval_comment = clean_text(ImportService._get_row_value(row, ImportService._find_col(header_map, "部门主管意见")))
            record.approval_status = "已审批" if record.approval_comment else "未知"
            imported += 1

            if record.leave_type == "补休（调休）" and record.apply_date:
                year = record.apply_date.year
                leave_balance = AnnualLeave.query.filter_by(emp_id=emp.id, year=year).first()
                if not leave_balance:
                    leave_balance = AnnualLeave(emp_id=emp.id, year=year, total_days=0, used_days=0, remaining_days=0)
                    db.session.add(leave_balance)
                leave_balance.used_days = (leave_balance.used_days or 0) + (record.duration or 0) / 8
                leave_balance.remaining_days = (leave_balance.total_days or 0) - (leave_balance.used_days or 0)

        db.session.commit()
        return {
            "total_rows": max(len(rows) - header_idx - 1, 0),
            "scanned": scanned,
            "imported": imported,
            "skipped": scanned - imported,
            "skipped_no_key": skipped_no_key,
            "skipped_unknown_employee": skipped_unknown_employee,
        }

    @staticmethod
    def _import_daily_records(rows: list[list[Any]]) -> dict[str, int]:
        header_idx = ImportService._find_header_row(rows, ["人员编号", "人员名称", "考勤日期"])
        header_map = ImportService._build_header_map(rows[header_idx])
        imported = 0
        scanned = 0
        skipped_no_key = 0
        skipped_unknown_employee = 0
        header_row = rows[header_idx]
        for row in rows[header_idx + 1 :]:
            emp_no = clean_text(ImportService._get_row_value(row, ImportService._find_col(header_map, "人员编号", "工号")))
            if not emp_no:
                skipped_no_key += 1
                continue
            scanned += 1
            emp_name = clean_text(ImportService._get_row_value(row, ImportService._find_col(header_map, "人员名称", "姓名")))
            emp = ImportService._find_existing_employee(emp_no)
            if not emp:
                skipped_unknown_employee += 1
                continue
            if emp_name:
                emp.name = emp_name

            shift_no = clean_text(ImportService._get_row_value(row, ImportService._find_col(header_map, "班次编号")))
            shift_name = clean_text(ImportService._get_row_value(row, ImportService._find_col(header_map, "班次名称")))
            shift = ImportService._find_existing_shift(shift_no, shift_name)

            record_date = parse_date(ImportService._get_row_value(row, ImportService._find_col(header_map, "考勤日期")))
            if not record_date:
                continue

            record = DailyRecord.query.filter_by(emp_id=emp.id, record_date=record_date).first()
            if not record:
                record = DailyRecord(emp_id=emp.id, record_date=record_date)
                db.session.add(record)

            check_raw = clean_text(ImportService._get_row_value(row, ImportService._find_col(header_map, "刷卡时间数据")))
            times = split_time_cells(check_raw)
            check_in_times = times[::2]
            check_out_times = times[1::2]

            for idx in range(1, 6):
                in_key = f"段{idx}实际上班时间"
                out_key = f"段{idx}实际下班时间"
                in_val = clean_text(ImportService._get_row_value(row, ImportService._find_col(header_map, in_key)))
                out_val = clean_text(ImportService._get_row_value(row, ImportService._find_col(header_map, out_key)))
                if in_val:
                    check_in_times.append(in_val)
                if out_val:
                    check_out_times.append(out_val)

            record.shift_id = shift.id if shift else None
            record.expected_hours = parse_float(ImportService._get_row_value(row, ImportService._find_col(header_map, "应出勤小时")))
            record.actual_hours = parse_float(ImportService._get_row_value(row, ImportService._find_col(header_map, "实出勤小时")))
            record.absent_hours = parse_float(ImportService._get_row_value(row, ImportService._find_col(header_map, "旷工小时")))
            record.check_in_times = check_in_times
            record.check_out_times = check_out_times
            record.leave_hours = parse_float(ImportService._get_row_value(row, ImportService._find_col(header_map, "请假小时")))
            record.leave_type = clean_text(ImportService._get_row_value(row, ImportService._find_col(header_map, "假种名称")))
            record.overtime_hours = parse_float(ImportService._get_row_value(row, ImportService._find_col(header_map, "加班小时")))
            record.overtime_type = clean_text(ImportService._get_row_value(row, ImportService._find_col(header_map, "加班类型")))
            record.late_minutes = parse_int(ImportService._get_row_value(row, ImportService._find_col(header_map, "迟到分钟")))
            record.early_leave_minutes = parse_int(ImportService._get_row_value(row, ImportService._find_col(header_map, "早退分钟")))
            record.exception_reason = clean_text(ImportService._get_row_value(row, ImportService._find_col(header_map, "异常原因")))
            record.raw_data = {str(header_row[i]): row[i] if i < len(row) else None for i in range(len(header_row))}
            imported += 1

        db.session.commit()
        return {
            "total_rows": max(len(rows) - header_idx - 1, 0),
            "scanned": scanned,
            "imported": imported,
            "skipped": scanned - imported,
            "skipped_no_key": skipped_no_key,
            "skipped_unknown_employee": skipped_unknown_employee,
        }

    @staticmethod
    def _extract_report_month(filename: str) -> str:
        # e.g. 2026_3月员工基础数据(月报).xls -> 2026-03
        m = re.search(r"(\d{4})[_-]?(\d{1,2})月", filename)
        if m:
            y = m.group(1)
            mm = int(m.group(2))
            return f"{y}-{mm:02d}"
        return "1970-01"

    @staticmethod
    def _import_monthly_report(rows: list[list[Any]], filename: str) -> dict[str, int]:
        header_idx = ImportService._find_header_row(rows, ["人员编号", "人员名称", "部门编号", "部门名称"])
        header = rows[header_idx]
        header_map = ImportService._build_header_map(header)
        report_month = ImportService._extract_report_month(filename)
        imported = 0
        scanned = 0
        skipped_no_key = 0
        skipped_unknown_employee = 0

        emp_no_idx = ImportService._find_col(header_map, "人员编号", "工号")
        emp_name_idx = ImportService._find_col(header_map, "人员名称", "姓名")
        dept_no_idx = ImportService._find_col(header_map, "部门编号")
        dept_name_idx = ImportService._find_col(header_map, "部门名称", "部门")

        base_idx = {i for i in [emp_no_idx, emp_name_idx, dept_no_idx, dept_name_idx] if i >= 0}

        for row in rows[header_idx + 1 :]:
            emp_no = clean_text(ImportService._get_row_value(row, emp_no_idx))
            if not emp_no:
                skipped_no_key += 1
                continue
            scanned += 1

            emp_name = clean_text(ImportService._get_row_value(row, emp_name_idx))
            emp = ImportService._find_existing_employee(emp_no)
            if not emp:
                skipped_unknown_employee += 1
                continue
            if emp_name:
                emp.name = emp_name

            metric_values: list[float | None] = []
            for i in range(len(header)):
                if i in base_idx:
                    continue
                metric_values.append(parse_float(ImportService._get_row_value(row, i), default=0.0))
                if len(metric_values) >= 84:
                    break
            while len(metric_values) < 84:
                metric_values.append(0.0)

            report = MonthlyReport.query.filter_by(emp_id=emp.id, report_month=report_month).first()
            if not report:
                report = MonthlyReport(emp_id=emp.id, report_month=report_month)
                db.session.add(report)

            for i in range(84):
                setattr(report, f"agg_{i+1:02d}", metric_values[i])

            report.raw_data = {
                clean_text(header[i]) or f"COL_{i+1}": (row[i] if i < len(row) else None)
                for i in range(len(header))
            }
            imported += 1

        db.session.commit()
        return {
            "total_rows": max(len(rows) - header_idx - 1, 0),
            "scanned": scanned,
            "imported": imported,
            "skipped": scanned - imported,
            "skipped_no_key": skipped_no_key,
            "skipped_unknown_employee": skipped_unknown_employee,
        }
