from __future__ import annotations

import os
import re
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
        rows = ExcelParser.read_rows(file_path)
        if not rows:
            return {"status": "error", "message": "Empty file"}

        filename = os.path.basename(file_path)
        if "加班" in filename:
            count = ImportService._import_overtime(rows)
            return {"status": "ok", "file_type": "overtime", "imported": count}
        if "请假" in filename:
            count = ImportService._import_leave(rows)
            return {"status": "ok", "file_type": "leave", "imported": count}
        if "月报" in filename:
            count = ImportService._import_monthly_report(rows, filename)
            return {"status": "ok", "file_type": "monthly", "imported": count}
        count = ImportService._import_daily_records(rows)
        return {"status": "ok", "file_type": "daily", "imported": count}

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
    def _import_overtime(rows: list[list[Any]]) -> int:
        header_map = ImportService._build_header_map(rows[0])
        count = 0
        for row in rows[1:]:
            overtime_no = clean_text(ImportService._get_row_value(row, ImportService._find_col(header_map, "加班单号")))
            if not overtime_no:
                continue
            dept_name = clean_text(ImportService._get_row_value(row, ImportService._find_col(header_map, "部门")))
            emp_name = clean_text(ImportService._get_row_value(row, ImportService._find_col(header_map, "姓名")))
            emp_no = clean_text(ImportService._get_row_value(row, ImportService._find_col(header_map, "工号")))
            if not emp_no:
                continue

            dept = ImportService._get_or_create_department(dept_name, dept_name)
            emp = ImportService._get_or_create_employee(emp_no, emp_name, dept)

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
            count += 1

        db.session.commit()
        return count

    @staticmethod
    def _import_leave(rows: list[list[Any]]) -> int:
        header_map = ImportService._build_header_map(rows[0])
        count = 0
        for row in rows[1:]:
            leave_no = clean_text(ImportService._get_row_value(row, ImportService._find_col(header_map, "请假单号")))
            if not leave_no:
                continue

            emp_no = clean_text(ImportService._get_row_value(row, ImportService._find_col(header_map, "工号")))
            emp_name = clean_text(ImportService._get_row_value(row, ImportService._find_col(header_map, "请假人")))
            dept_name = clean_text(ImportService._get_row_value(row, ImportService._find_col(header_map, "部门", "所属部门")))
            if not emp_no:
                continue

            dept = ImportService._get_or_create_department(dept_name, dept_name)
            emp = ImportService._get_or_create_employee(emp_no, emp_name, dept)

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
            count += 1

            if record.leave_type == "补休（调休）" and record.apply_date:
                year = record.apply_date.year
                leave_balance = AnnualLeave.query.filter_by(emp_id=emp.id, year=year).first()
                if not leave_balance:
                    leave_balance = AnnualLeave(emp_id=emp.id, year=year, total_days=0, used_days=0, remaining_days=0)
                    db.session.add(leave_balance)
                leave_balance.used_days = (leave_balance.used_days or 0) + (record.duration or 0) / 8
                leave_balance.remaining_days = (leave_balance.total_days or 0) - (leave_balance.used_days or 0)

        db.session.commit()
        return count

    @staticmethod
    def _import_daily_records(rows: list[list[Any]]) -> int:
        header_map = ImportService._build_header_map(rows[0])
        count = 0
        for row in rows[1:]:
            emp_no = clean_text(ImportService._get_row_value(row, ImportService._find_col(header_map, "人员编号", "工号")))
            if not emp_no:
                continue
            emp_name = clean_text(ImportService._get_row_value(row, ImportService._find_col(header_map, "人员名称", "姓名")))
            dept_no = clean_text(ImportService._get_row_value(row, ImportService._find_col(header_map, "部门编号")))
            dept_name = clean_text(ImportService._get_row_value(row, ImportService._find_col(header_map, "部门名称", "部门")))

            dept = ImportService._get_or_create_department(dept_no or dept_name, dept_name or dept_no)
            emp = ImportService._get_or_create_employee(emp_no, emp_name, dept)

            shift_no = clean_text(ImportService._get_row_value(row, ImportService._find_col(header_map, "班次编号")))
            shift_name = clean_text(ImportService._get_row_value(row, ImportService._find_col(header_map, "班次名称")))
            shift_time = ImportService._get_row_value(row, ImportService._find_col(header_map, "班次时间数据"))
            shift = ImportService._get_or_create_shift(shift_no, shift_name, shift_time)

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
            record.raw_data = {str(rows[0][i]): row[i] if i < len(row) else None for i in range(len(rows[0]))}
            count += 1

        db.session.commit()
        return count

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
    def _import_monthly_report(rows: list[list[Any]], filename: str) -> int:
        header = rows[0]
        header_map = ImportService._build_header_map(header)
        report_month = ImportService._extract_report_month(filename)
        count = 0

        emp_no_idx = ImportService._find_col(header_map, "人员编号", "工号")
        emp_name_idx = ImportService._find_col(header_map, "人员名称", "姓名")
        dept_no_idx = ImportService._find_col(header_map, "部门编号")
        dept_name_idx = ImportService._find_col(header_map, "部门名称", "部门")

        base_idx = {i for i in [emp_no_idx, emp_name_idx, dept_no_idx, dept_name_idx] if i >= 0}

        for row in rows[1:]:
            emp_no = clean_text(ImportService._get_row_value(row, emp_no_idx))
            if not emp_no:
                continue

            emp_name = clean_text(ImportService._get_row_value(row, emp_name_idx))
            dept_no = clean_text(ImportService._get_row_value(row, dept_no_idx))
            dept_name = clean_text(ImportService._get_row_value(row, dept_name_idx))
            dept = ImportService._get_or_create_department(dept_no or dept_name, dept_name or dept_no)
            emp = ImportService._get_or_create_employee(emp_no, emp_name, dept)

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
            count += 1

        db.session.commit()
        return count
