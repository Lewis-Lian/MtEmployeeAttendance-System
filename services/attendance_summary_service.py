from __future__ import annotations

from models.employee import Employee
from services.attendance_source_service import attendance_views_by_employee


def empty_monthly_summary() -> dict:
    return {
        "expected_hours": 0.0,
        "actual_hours": 0.0,
        "absent_hours": 0.0,
        "leave_hours": 0.0,
        "overtime_hours": 0.0,
        "late_minutes": 0,
        "early_leave_minutes": 0,
    }


def summarize_monthly_rows(rows: list[object]) -> dict:
    return {
        "expected_hours": float(sum(float(row.expected_hours or 0) for row in rows) or 0),
        "actual_hours": float(sum(float(row.actual_hours or 0) for row in rows) or 0),
        "absent_hours": float(sum(float(row.absent_hours or 0) for row in rows) or 0),
        "leave_hours": float(sum(float(row.leave_hours or 0) for row in rows) or 0),
        "overtime_hours": float(sum(float(row.overtime_hours or 0) for row in rows) or 0),
        "late_minutes": int(sum(int(row.late_minutes or 0) for row in rows) or 0),
        "early_leave_minutes": int(sum(int(row.early_leave_minutes or 0) for row in rows) or 0),
    }


def batch_monthly_summaries(
    month: str,
    employees: list[Employee],
    context: str,
) -> dict[int, dict]:
    if not employees:
        return {}

    rows_by_employee = attendance_views_by_employee(month, employees, context)
    return {
        employee.id: summarize_monthly_rows(rows_by_employee.get(employee.id, []))
        for employee in employees
    }
