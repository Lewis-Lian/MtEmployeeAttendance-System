from __future__ import annotations

from datetime import datetime

from flask import Blueprint, jsonify, render_template, request, g
from sqlalchemy import func

from models.employee import Employee
from models.daily_record import DailyRecord
from models.overtime import OvertimeRecord
from models.leave import LeaveRecord
from models.annual_leave import AnnualLeave
from models.user import UserEmployeeAssignment
from services.attendance_service import AttendanceService
from routes.auth import login_required


employee_bp = Blueprint("employee", __name__, url_prefix="/employee")


def _accessible_emp_ids() -> list[int]:
    if g.current_user.role == "admin":
        return [e.id for e in Employee.query.with_entities(Employee.id).all()]
    rows = UserEmployeeAssignment.query.filter_by(user_id=g.current_user.id).all()
    return [r.emp_id for r in rows]


def _pick_emp_id() -> int | None:
    requested = request.args.get("emp_id", type=int)
    allowed = _accessible_emp_ids()
    if requested and requested in allowed:
        return requested
    return allowed[0] if allowed else None


@employee_bp.route("/dashboard")
@login_required
def dashboard():
    emp_ids = _accessible_emp_ids()
    employees = Employee.query.filter(Employee.id.in_(emp_ids)).order_by(Employee.emp_no).all() if emp_ids else []
    return render_template("dashboard.html", employees=employees)


@employee_bp.route("/api/summary", methods=["GET"])
@login_required
def summary_api():
    emp_id = _pick_emp_id()
    if not emp_id:
        return jsonify({"error": "No employee assigned"}), 404

    month = request.args.get("month") or datetime.now().strftime("%Y-%m")
    year = request.args.get("year", type=int) or datetime.now().year

    monthly = AttendanceService.monthly_summary(emp_id, month)
    yearly = AttendanceService.yearly_summary(emp_id, year)
    deduction = AttendanceService.deduction_calc(emp_id, month)
    annual = AttendanceService.annual_leave_balance(emp_id, year)

    return jsonify(
        {
            "emp_id": emp_id,
            "month": month,
            "year": year,
            "monthly": monthly,
            "yearly": yearly,
            "deduction": deduction,
            "annual_leave": annual,
        }
    )


@employee_bp.route("/api/daily-records", methods=["GET"])
@login_required
def daily_records_api():
    emp_id = _pick_emp_id()
    if not emp_id:
        return jsonify([])

    month = request.args.get("month") or datetime.now().strftime("%Y-%m")
    q = (
        DailyRecord.query.filter_by(emp_id=emp_id)
        .filter(func.strftime("%Y-%m", DailyRecord.record_date) == month)
        .order_by(DailyRecord.record_date.desc())
    )
    rows = q.all()
    return jsonify(
        [
            {
                "date": r.record_date.isoformat(),
                "expected_hours": r.expected_hours,
                "actual_hours": r.actual_hours,
                "absent_hours": r.absent_hours,
                "leave_hours": r.leave_hours,
                "leave_type": r.leave_type,
                "overtime_hours": r.overtime_hours,
                "overtime_type": r.overtime_type,
                "late_minutes": r.late_minutes,
                "early_leave_minutes": r.early_leave_minutes,
                "exception_reason": r.exception_reason,
            }
            for r in rows
        ]
    )


@employee_bp.route("/api/overtime", methods=["GET"])
@login_required
def overtime_api():
    emp_id = _pick_emp_id()
    if not emp_id:
        return jsonify([])

    rows = OvertimeRecord.query.filter_by(emp_id=emp_id).order_by(OvertimeRecord.start_time.desc()).all()
    return jsonify(
        [
            {
                "overtime_no": r.overtime_no,
                "start_time": r.start_time.isoformat() if r.start_time else None,
                "end_time": r.end_time.isoformat() if r.end_time else None,
                "effective_hours": r.effective_hours,
                "is_weekend": r.is_weekend,
                "is_holiday": r.is_holiday,
                "salary_option": r.salary_option,
                "reason": r.reason,
                "approval_status": r.approval_status,
            }
            for r in rows
        ]
    )


@employee_bp.route("/api/leave", methods=["GET"])
@login_required
def leave_api():
    emp_id = _pick_emp_id()
    if not emp_id:
        return jsonify([])

    rows = LeaveRecord.query.filter_by(emp_id=emp_id).order_by(LeaveRecord.start_time.desc()).all()
    return jsonify(
        [
            {
                "leave_no": r.leave_no,
                "apply_date": r.apply_date.isoformat() if r.apply_date else None,
                "leave_type": r.leave_type,
                "start_time": r.start_time.isoformat() if r.start_time else None,
                "end_time": r.end_time.isoformat() if r.end_time else None,
                "duration": r.duration,
                "reason": r.reason,
                "approval_status": r.approval_status,
            }
            for r in rows
        ]
    )


@employee_bp.route("/api/annual-leave", methods=["GET"])
@login_required
def annual_leave_api():
    emp_id = _pick_emp_id()
    year = request.args.get("year", type=int) or datetime.now().year
    if not emp_id:
        return jsonify({"year": year, "total_days": 0, "used_days": 0, "remaining_days": 0})

    row = AnnualLeave.query.filter_by(emp_id=emp_id, year=year).first()
    if not row:
        return jsonify({"year": year, "total_days": 0, "used_days": 0, "remaining_days": 0})
    return jsonify(
        {
            "year": row.year,
            "total_days": row.total_days,
            "used_days": row.used_days,
            "remaining_days": row.remaining_days,
        }
    )
