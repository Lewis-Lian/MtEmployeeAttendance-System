from __future__ import annotations

import os
from datetime import datetime

from flask import Blueprint, current_app, jsonify, redirect, render_template, request, send_file
from sqlalchemy import func

from models import db
from models.employee import Employee
from models.shift import Shift
from models.daily_record import DailyRecord
from models.user import User, UserEmployeeAssignment
from services.import_service import ImportService
from services.report_service import ReportService
from routes.auth import admin_required


admin_bp = Blueprint("admin", __name__, url_prefix="/admin")


@admin_bp.route("/dashboard")
@admin_required
def dashboard():
    users = User.query.order_by(User.id.desc()).all()
    employees = Employee.query.order_by(Employee.emp_no.asc()).all()
    shifts = Shift.query.order_by(Shift.shift_no.asc()).all()
    return render_template("admin/dashboard.html", users=users, employees=employees, shifts=shifts)


@admin_bp.route("/upload", methods=["POST"])
@admin_required
def upload_excel():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]
    if not file.filename:
        return jsonify({"error": "Invalid filename"}), 400

    save_path = os.path.join(current_app.config["UPLOAD_FOLDER"], file.filename)
    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    file.save(save_path)

    result = ImportService.import_file(save_path)
    return jsonify(result)


@admin_bp.route("/shifts", methods=["POST"])
@admin_required
def create_shift():
    data = request.json or {}
    shift_no = (data.get("shift_no") or "").strip()
    shift_name = (data.get("shift_name") or "").strip()
    time_slots = data.get("time_slots") or []
    is_cross_day = bool(data.get("is_cross_day", False))

    if not shift_no or not shift_name:
        return jsonify({"error": "shift_no and shift_name are required"}), 400

    shift = Shift.query.filter_by(shift_no=shift_no).first()
    if shift:
        shift.shift_name = shift_name
        shift.time_slots = time_slots
        shift.is_cross_day = is_cross_day
    else:
        shift = Shift(
            shift_no=shift_no,
            shift_name=shift_name,
            time_slots=time_slots,
            is_cross_day=is_cross_day,
        )
        db.session.add(shift)

    db.session.commit()
    return jsonify({"status": "ok", "id": shift.id})


@admin_bp.route("/employees", methods=["GET"])
@admin_required
def employees_list():
    rows = Employee.query.order_by(Employee.emp_no.asc()).all()
    return jsonify(
        [
            {
                "id": e.id,
                "emp_no": e.emp_no,
                "name": e.name,
                "department": e.department.dept_name if e.department else "",
            }
            for e in rows
        ]
    )


@admin_bp.route("/users/readonly", methods=["POST"])
@admin_required
def create_readonly_user():
    data = request.json or {}
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()
    emp_ids = data.get("emp_ids") or []

    if not username or not password:
        return jsonify({"error": "username and password are required"}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({"error": "username already exists"}), 400

    user = User(username=username, role="readonly")
    user.set_password(password)
    db.session.add(user)
    db.session.flush()

    for emp_id in emp_ids:
        if Employee.query.get(emp_id):
            db.session.add(UserEmployeeAssignment(user_id=user.id, emp_id=emp_id))

    db.session.commit()
    return jsonify({"status": "ok", "user_id": user.id})


@admin_bp.route("/daily-records/<int:record_id>/annotate", methods=["POST"])
@admin_required
def annotate_record(record_id: int):
    data = request.json or {}
    reason = (data.get("exception_reason") or "").strip()
    record = DailyRecord.query.get_or_404(record_id)
    record.exception_reason = reason
    db.session.commit()
    return jsonify({"status": "ok"})


@admin_bp.route("/export/daily", methods=["GET"])
@admin_required
def export_daily():
    month = request.args.get("month") or datetime.now().strftime("%Y-%m")
    records = (
        DailyRecord.query.filter(func.strftime("%Y-%m", DailyRecord.record_date) == month)
        .order_by(DailyRecord.record_date.asc())
        .all()
    )
    csv_text = ReportService.export_daily_records_csv(records)

    output_path = os.path.join(current_app.config["UPLOAD_FOLDER"], f"daily_report_{month}.csv")
    with open(output_path, "w", encoding="utf-8-sig") as f:
        f.write(csv_text)

    return send_file(output_path, as_attachment=True)


@admin_bp.route("/")
@admin_required
def admin_root():
    return redirect("/admin/dashboard")
