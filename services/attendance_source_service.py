from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy.orm import joinedload

from models.daily_record import DailyRecord
from models.employee import (
    ATTENDANCE_SOURCE_AUTO_FALLBACK,
    ATTENDANCE_SOURCE_EMPLOYEE,
    ATTENDANCE_SOURCE_MANAGER,
    Employee,
)
from models.monthly_report import MonthlyReport


EMPLOYEE_STATS_CONTEXT = "employee_stats"
MANAGER_STATS_CONTEXT = "manager_stats"


@dataclass
class AttendanceRecordView:
    employee: Employee | None
    shift: object
    record_date: date | None
    source: str
    expected_hours: float
    actual_hours: float
    absent_hours: float
    check_in_times: list[object]
    check_out_times: list[object]
    leave_hours: float
    leave_type: str | None
    overtime_hours: float
    overtime_type: str | None
    late_minutes: int
    early_leave_minutes: int
    exception_reason: str | None
    raw_data: dict


def _month_date_range(month: str) -> tuple[date, date] | None:
    try:
        start = datetime.strptime(month, "%Y-%m").date().replace(day=1)
    except ValueError:
        return None
    if start.month == 12:
        return start, date(start.year + 1, 1, 1)
    return start, date(start.year, start.month + 1, 1)


def _payload_for_source(record: DailyRecord, source: str) -> dict:
    if source == ATTENDANCE_SOURCE_MANAGER:
        payload = record.manager_payload
    else:
        payload = record.employee_payload
    if isinstance(payload, dict) and payload:
        return payload
    raw = record.raw_data if isinstance(record.raw_data, dict) else {}
    return raw if isinstance(raw, dict) else {}


def _record_has_source_payload(record: DailyRecord, source: str) -> bool:
    payload = _payload_for_source(record, source)
    if payload:
        return True
    if source == ATTENDANCE_SOURCE_EMPLOYEE:
        return bool(record.check_in_times or record.check_out_times or record.shift_id or record.expected_hours or record.absent_hours)
    return bool(record.actual_hours or record.late_minutes or record.early_leave_minutes)


def _select_sources(configured_source: str, default_source: str) -> list[str]:
    source = configured_source or default_source
    if source == ATTENDANCE_SOURCE_AUTO_FALLBACK:
        if default_source == ATTENDANCE_SOURCE_MANAGER:
            return [ATTENDANCE_SOURCE_MANAGER, ATTENDANCE_SOURCE_EMPLOYEE]
        return [ATTENDANCE_SOURCE_EMPLOYEE, ATTENDANCE_SOURCE_MANAGER]
    if source == ATTENDANCE_SOURCE_MANAGER:
        return [ATTENDANCE_SOURCE_MANAGER, ATTENDANCE_SOURCE_EMPLOYEE]
    return [ATTENDANCE_SOURCE_EMPLOYEE, ATTENDANCE_SOURCE_MANAGER]


def attendance_source_for_context(employee: Employee, context: str) -> str:
    if context == MANAGER_STATS_CONTEXT:
        return employee.manager_stats_attendance_source or ATTENDANCE_SOURCE_MANAGER
    return employee.employee_stats_attendance_source or ATTENDANCE_SOURCE_EMPLOYEE


def manager_stats_included(employee: Employee) -> bool:
    return bool(employee.is_manager)


def employee_stats_included(employee: Employee) -> bool:
    return not bool(employee.is_manager)


def build_attendance_record_view(record: DailyRecord, employee: Employee, context: str) -> AttendanceRecordView | None:
    configured_source = attendance_source_for_context(employee, context)
    default_source = ATTENDANCE_SOURCE_MANAGER if context == MANAGER_STATS_CONTEXT else ATTENDANCE_SOURCE_EMPLOYEE
    selected_source = None
    for source in _select_sources(configured_source, default_source):
        if _record_has_source_payload(record, source):
            selected_source = source
            break
    if not selected_source:
        return None

    payload = deepcopy(_payload_for_source(record, selected_source))
    if selected_source == ATTENDANCE_SOURCE_MANAGER:
        actual_hours = float((payload.get("actual_hours") if isinstance(payload, dict) else None) or record.actual_hours or 0)
        late_minutes = int((payload.get("late_minutes") if isinstance(payload, dict) else None) or record.late_minutes or 0)
        early_leave_minutes = int(
            (payload.get("early_leave_minutes") if isinstance(payload, dict) else None) or record.early_leave_minutes or 0
        )
        check_in_times = list(payload.get("check_in_times") or [])
        check_out_times = list(payload.get("check_out_times") or [])
        expected_hours = float(payload.get("expected_hours") or 0)
        absent_hours = float(payload.get("absent_hours") or 0)
        leave_hours = float(payload.get("leave_hours") or 0)
        overtime_hours = float(payload.get("overtime_hours") or 0)
        leave_type = payload.get("leave_type")
        overtime_type = payload.get("overtime_type")
        exception_reason = payload.get("exception_reason")
    else:
        actual_hours = float(payload.get("actual_hours") or 0)
        late_minutes = int(payload.get("late_minutes") or 0)
        early_leave_minutes = int(payload.get("early_leave_minutes") or 0)
        check_in_times = list(payload.get("check_in_times") or [])
        check_out_times = list(payload.get("check_out_times") or [])
        expected_hours = float(payload.get("expected_hours") or 0)
        absent_hours = float(payload.get("absent_hours") or 0)
        leave_hours = float(payload.get("leave_hours") or 0)
        overtime_hours = float(payload.get("overtime_hours") or 0)
        leave_type = payload.get("leave_type")
        overtime_type = payload.get("overtime_type")
        exception_reason = payload.get("exception_reason")

    return AttendanceRecordView(
        employee=record.employee,
        shift=record.shift,
        record_date=record.record_date,
        source=selected_source,
        expected_hours=expected_hours,
        actual_hours=actual_hours,
        absent_hours=absent_hours,
        check_in_times=check_in_times,
        check_out_times=check_out_times,
        leave_hours=leave_hours,
        leave_type=leave_type,
        overtime_hours=overtime_hours,
        overtime_type=overtime_type,
        late_minutes=late_minutes,
        early_leave_minutes=early_leave_minutes,
        exception_reason=exception_reason,
        raw_data=payload if isinstance(payload, dict) else {},
    )


def attendance_views_by_employee(month: str, employees: list[Employee], context: str) -> dict[int, list[AttendanceRecordView]]:
    if not employees:
        return {}
    date_range = _month_date_range(month)
    if not date_range:
        return {}
    start_date, end_date = date_range
    emp_ids = [employee.id for employee in employees]
    rows = (
        DailyRecord.query.options(joinedload(DailyRecord.employee).joinedload(Employee.department), joinedload(DailyRecord.shift))
        .filter(DailyRecord.emp_id.in_(emp_ids))
        .filter(DailyRecord.record_date >= start_date, DailyRecord.record_date < end_date)
        .order_by(DailyRecord.record_date.asc())
        .all()
    )
    employees_by_id = {employee.id: employee for employee in employees}
    result: dict[int, list[AttendanceRecordView]] = {employee.id: [] for employee in employees}
    for row in rows:
        employee = employees_by_id.get(row.emp_id)
        if not employee:
            continue
        view = build_attendance_record_view(row, employee, context)
        if view is None:
            continue
        result.setdefault(row.emp_id, []).append(view)
    return result


def selected_monthly_report_raw(employee: Employee, month: str, context: str) -> dict:
    rows = MonthlyReport.query.filter_by(emp_id=employee.id, report_month=month).all()
    candidates = []
    for row in rows:
        if context == MANAGER_STATS_CONTEXT:
            raw = row.manager_raw_data if isinstance(row.manager_raw_data, dict) and row.manager_raw_data else row.raw_data
        else:
            raw = row.employee_raw_data if isinstance(row.employee_raw_data, dict) and row.employee_raw_data else row.raw_data
        if isinstance(raw, dict) and raw:
            candidates.append(raw)
    return candidates[0] if candidates else {}
