from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import func

from models import db
from models.daily_record import DailyRecord
from models.leave import LeaveRecord
from models.annual_leave import AnnualLeave


LEAVE_TYPES = ["病假", "事假", "工伤", "丧假", "婚假", "出差", "补休（调休）"]


def _month_date_range(month: str) -> tuple[date, date] | None:
    try:
        start = datetime.strptime(month, "%Y-%m").date().replace(day=1)
    except ValueError:
        return None
    if start.month == 12:
        return start, date(start.year + 1, 1, 1)
    return start, date(start.year, start.month + 1, 1)


class AttendanceService:
    @staticmethod
    def monthly_summary(emp_id: int, month: str) -> dict:
        date_range = _month_date_range(month)
        if not date_range:
            totals = [0, 0, 0, 0, 0, 0, 0]
        else:
            start_date, end_date = date_range
            totals = (
                db.session.query(
                    func.coalesce(func.sum(DailyRecord.expected_hours), 0),
                    func.coalesce(func.sum(DailyRecord.actual_hours), 0),
                    func.coalesce(func.sum(DailyRecord.absent_hours), 0),
                    func.coalesce(func.sum(DailyRecord.leave_hours), 0),
                    func.coalesce(func.sum(DailyRecord.overtime_hours), 0),
                    func.coalesce(func.sum(DailyRecord.late_minutes), 0),
                    func.coalesce(func.sum(DailyRecord.early_leave_minutes), 0),
                )
                .filter(DailyRecord.emp_id == emp_id)
                .filter(DailyRecord.record_date >= start_date, DailyRecord.record_date < end_date)
                .first()
            )

        return {
            "expected_hours": float(totals[0] or 0),
            "actual_hours": float(totals[1] or 0),
            "absent_hours": float(totals[2] or 0),
            "leave_hours": float(totals[3] or 0),
            "overtime_hours": float(totals[4] or 0),
            "late_minutes": int(totals[5] or 0),
            "early_leave_minutes": int(totals[6] or 0),
        }

    @staticmethod
    def yearly_summary(emp_id: int, year: int) -> dict:
        daily_totals = (
            db.session.query(
                func.coalesce(func.sum(DailyRecord.actual_hours), 0),
                func.coalesce(func.sum(DailyRecord.absent_hours), 0),
                func.coalesce(func.sum(DailyRecord.overtime_hours), 0),
            )
            .filter(DailyRecord.emp_id == emp_id)
            .filter(func.strftime("%Y", DailyRecord.record_date) == str(year))
            .first()
        )

        leave_total = (
            db.session.query(func.coalesce(func.sum(LeaveRecord.duration), 0))
            .filter(LeaveRecord.emp_id == emp_id)
            .filter(func.strftime("%Y", LeaveRecord.start_time) == str(year))
            .scalar()
        )

        return {
            "actual_hours": float(daily_totals[0] or 0),
            "absent_hours": float(daily_totals[1] or 0),
            "overtime_hours": float(daily_totals[2] or 0),
            "leave_duration": float(leave_total or 0),
        }

    @staticmethod
    def deduction_calc(emp_id: int, month: str) -> dict:
        summary = AttendanceService.monthly_summary(emp_id, month)
        late_penalty = round(summary["late_minutes"] * 0.1, 2)
        early_penalty = round(summary["early_leave_minutes"] * 0.1, 2)
        absent_penalty = round(summary["absent_hours"] * 20, 2)
        total_penalty = round(late_penalty + early_penalty + absent_penalty, 2)
        return {
            "late_penalty": late_penalty,
            "early_penalty": early_penalty,
            "absent_penalty": absent_penalty,
            "total_penalty": total_penalty,
        }

    @staticmethod
    def annual_leave_balance(emp_id: int, year: int) -> dict:
        row = AnnualLeave.query.filter_by(emp_id=emp_id, year=year).first()
        if not row:
            return {"year": year, "total_days": 0, "used_days": 0, "remaining_days": 0}
        return {
            "year": year,
            "total_days": row.total_days,
            "used_days": row.used_days,
            "remaining_days": row.remaining_days,
        }
