from __future__ import annotations

import os
import subprocess
from io import BytesIO
from datetime import datetime
from typing import Any

from flask import Blueprint, current_app, jsonify, redirect, render_template, request, send_file, g
from sqlalchemy import func
import openpyxl

from models import db
from models.department import Department
from models.employee import Employee
from models.employee_shift import EmployeeShiftAssignment
from models.shift import Shift
from models.daily_record import DailyRecord
from models.account_set import AccountSet, AccountSetImport
from models.user import User, UserEmployeeAssignment, UserDepartmentAssignment
from services.import_service import ImportService
from routes.auth import admin_required


admin_bp = Blueprint("admin", __name__, url_prefix="/admin")


def _convert_uploaded_xls_to_xlsx(xls_path: str) -> str | None:
    xlsx_path = f"{os.path.splitext(xls_path)[0]}.xlsx"
    try:
        subprocess.run(
            [
                "libreoffice",
                "--headless",
                "--convert-to",
                "xlsx",
                "--outdir",
                os.path.dirname(xls_path),
                xls_path,
            ],
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
    except Exception:
        return None
    return xlsx_path if os.path.exists(xlsx_path) else None


def _serialize_user(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "role": user.role,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "emp_ids": [a.emp_id for a in user.employee_assignments],
        "dept_ids": [a.dept_id for a in user.department_assignments],
        "employees": [
            {
                "id": a.employee.id,
                "emp_no": a.employee.emp_no,
                "name": a.employee.name,
            }
            for a in user.employee_assignments
            if a.employee
        ],
        "departments": [
            {
                "id": a.department.id,
                "dept_no": a.department.dept_no,
                "dept_name": a.department.dept_name,
                "parent_id": a.department.parent_id,
            }
            for a in user.department_assignments
            if a.department
        ],
    }


def _sync_user_assignments(user: User, emp_ids: list[int]) -> None:
    valid_ids = {
        row.id for row in Employee.query.with_entities(Employee.id).filter(Employee.id.in_(emp_ids)).all()
    }
    current_ids = {a.emp_id for a in user.employee_assignments}
    to_remove = [a for a in user.employee_assignments if a.emp_id not in valid_ids]
    for assignment in to_remove:
        db.session.delete(assignment)
    for emp_id in valid_ids - current_ids:
        db.session.add(UserEmployeeAssignment(user_id=user.id, emp_id=emp_id))


def _sync_user_department_assignments(user: User, dept_ids: list[int]) -> None:
    valid_ids = {
        row.id for row in Department.query.with_entities(Department.id).filter(Department.id.in_(dept_ids)).all()
    }
    current_ids = {a.dept_id for a in user.department_assignments}
    to_remove = [a for a in user.department_assignments if a.dept_id not in valid_ids]
    for assignment in to_remove:
        db.session.delete(assignment)
    for dept_id in valid_ids - current_ids:
        db.session.add(UserDepartmentAssignment(user_id=user.id, dept_id=dept_id))


def _serialize_employee(employee: Employee) -> dict:
    shift = employee.shift_assignment.shift if employee.shift_assignment else None
    return {
        "id": employee.id,
        "emp_no": employee.emp_no,
        "name": employee.name,
        "dept_id": employee.dept_id,
        "dept_no": employee.department.dept_no if employee.department else "",
        "dept_name": employee.department.dept_name if employee.department else "",
        "department": employee.department.dept_name if employee.department else "",
        "shift_id": shift.id if shift else None,
        "shift_no": shift.shift_no if shift else "",
        "shift_name": shift.shift_name if shift else "",
    }


def _serialize_account_set(row: AccountSet) -> dict:
    success_count = 0
    error_count = 0
    pending_count = 0
    latest_import_at = None
    for item in row.imports:
        if item.status == "ok":
            success_count += 1
        elif item.status == "error":
            error_count += 1
        else:
            pending_count += 1
        if item.created_at and (latest_import_at is None or item.created_at > latest_import_at):
            latest_import_at = item.created_at

    return {
        "id": row.id,
        "month": row.month,
        "name": row.name,
        "is_active": row.is_active,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "imports_count": len(row.imports),
        "pending_count": pending_count,
        "success_count": success_count,
        "error_count": error_count,
        "latest_import_at": latest_import_at.isoformat() if latest_import_at else None,
    }


def _next_auto_dept_no() -> str:
    index = Department.query.count() + 1
    while True:
        dept_no = f"AUTO-{index:04d}"
        if not Department.query.filter_by(dept_no=dept_no).first():
            return dept_no
        index += 1


def _resolve_department(dept_name: str | None, dept_no: str | None = None) -> Department | None:
    clean_name = (dept_name or "").strip()
    clean_no = (dept_no or "").strip()
    if not clean_name:
        return None

    if clean_no:
        existing_by_no = Department.query.filter_by(dept_no=clean_no).first()
        if existing_by_no:
            return existing_by_no
        department = Department(dept_no=clean_no, dept_name=clean_name)
        db.session.add(department)
        db.session.flush()
        return department

    existing_by_name = Department.query.filter_by(dept_name=clean_name).first()
    if existing_by_name:
        return existing_by_name

    department = Department(dept_no=_next_auto_dept_no(), dept_name=clean_name)
    db.session.add(department)
    db.session.flush()
    return department


def _parse_parent_id(raw: Any) -> int | None:
    if raw in (None, "", "null", "None"):
        return None
    if isinstance(raw, int):
        return raw
    text_value = str(raw).strip()
    if not text_value:
        return None
    if not text_value.isdigit():
        return -1
    return int(text_value)


def _validate_parent_department(parent_id: int | None, current_dept_id: int | None = None) -> tuple[Department | None, str | None]:
    if parent_id is None:
        return None, None
    parent = Department.query.get(parent_id)
    if not parent:
        return None, "上级部门不存在"
    if current_dept_id and parent.id == current_dept_id:
        return None, "上级部门不能选择自身"
    if current_dept_id:
        cursor = parent
        while cursor:
            if cursor.id == current_dept_id:
                return None, "上级部门设置非法，会形成循环层级"
            cursor = cursor.parent
    return parent, None


def _parse_header_row(rows: list[list[Any]], expected: list[str]) -> tuple[int, dict[str, int]]:
    best_idx = 0
    best_map: dict[str, int] = {}
    best_score = -1
    limit = min(len(rows), 8)
    for idx in range(limit):
        raw = rows[idx]
        header_map = {}
        for i, value in enumerate(raw):
            text = str(value).strip() if value is not None else ""
            if text:
                header_map[text] = i
        score = sum(1 for key in expected if key in header_map)
        if score > best_score:
            best_score = score
            best_idx = idx
            best_map = header_map
    return best_idx, best_map


def _resolve_shift(shift_no: str | None) -> Shift | None:
    key = (shift_no or "").strip()
    if not key:
        return None
    return Shift.query.filter_by(shift_no=key).first()


def _assign_employee_shift(employee: Employee, shift: Shift | None) -> None:
    assignment = employee.shift_assignment
    if shift is None:
        if assignment:
            db.session.delete(assignment)
        return

    if not assignment:
        assignment = EmployeeShiftAssignment(emp_id=employee.id, shift_id=shift.id)
        db.session.add(assignment)
        employee.shift_assignment = assignment
    else:
        assignment.shift_id = shift.id


@admin_bp.route("/dashboard")
@admin_required
def dashboard():
    return render_template("admin/dashboard.html")


@admin_bp.route("/account-sets", methods=["GET"])
@admin_required
def list_account_sets():
    rows = AccountSet.query.order_by(AccountSet.month.desc()).all()
    return jsonify([_serialize_account_set(row) for row in rows])


@admin_bp.route("/account-sets", methods=["POST"])
@admin_required
def create_account_set():
    data = request.json or {}
    month = (data.get("month") or "").strip()
    if not month or len(month) != 7:
        return jsonify({"error": "month is required in YYYY-MM format"}), 400
    if AccountSet.query.filter_by(month=month).first():
        return jsonify({"error": "该月份账套已存在"}), 400

    row = AccountSet(month=month, name=f"{month} 账套")
    if AccountSet.query.count() == 0:
        row.is_active = True
    db.session.add(row)
    db.session.commit()
    return jsonify({"status": "ok", "account_set": _serialize_account_set(row)})


@admin_bp.route("/account-sets/<int:account_set_id>/activate", methods=["POST"])
@admin_required
def activate_account_set(account_set_id: int):
    row = AccountSet.query.get_or_404(account_set_id)
    AccountSet.query.update({AccountSet.is_active: False})
    row.is_active = True
    db.session.commit()
    return jsonify({"status": "ok", "account_set": _serialize_account_set(row)})


@admin_bp.route("/account-sets/<int:account_set_id>", methods=["DELETE"])
@admin_required
def delete_account_set(account_set_id: int):
    row = AccountSet.query.get_or_404(account_set_id)

    # best-effort cleanup archived files
    for record in row.imports:
        path = (record.stored_path or "").strip()
        if path and os.path.exists(path):
            try:
                os.remove(path)
            except Exception:
                pass

    was_active = row.is_active
    db.session.delete(row)
    db.session.commit()

    if was_active:
        fallback = AccountSet.query.order_by(AccountSet.month.desc()).first()
        if fallback:
            AccountSet.query.update({AccountSet.is_active: False})
            fallback.is_active = True
            db.session.commit()

    return jsonify({"status": "ok"})


@admin_bp.route("/account-sets/<int:account_set_id>/imports", methods=["GET"])
@admin_required
def list_account_set_imports(account_set_id: int):
    row = AccountSet.query.get_or_404(account_set_id)
    records = AccountSetImport.query.filter_by(account_set_id=row.id).order_by(AccountSetImport.id.desc()).all()
    return jsonify(
        [
            {
                "id": r.id,
                "source_filename": r.source_filename,
                "stored_path": r.stored_path,
                "file_type": r.file_type,
                "status": r.status,
                "imported_count": r.imported_count,
                "error_message": r.error_message,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in records
        ]
    )


@admin_bp.route("/account-sets/<int:account_set_id>/calculate", methods=["POST"])
@admin_required
def calculate_account_set(account_set_id: int):
    row = AccountSet.query.get_or_404(account_set_id)
    records = AccountSetImport.query.filter_by(account_set_id=row.id).order_by(AccountSetImport.id.asc()).all()

    if not records:
        return jsonify({"status": "error", "message": "该账套暂无可计算文件"}), 400

    success = 0
    failed = 0
    results = []

    for rec in records:
        path = (rec.stored_path or "").strip()
        filename = rec.source_filename or os.path.basename(path)
        if not path or not os.path.exists(path):
            failed += 1
            rec.status = "error"
            rec.error_message = "archive file not found"
            rec.imported_count = 0
            results.append({"file": filename, "status": "error", "error": rec.error_message})
            db.session.commit()
            continue

        try:
            imported = ImportService.import_file(path)
            if imported.get("status") == "ok":
                success += 1
                rec.status = "ok"
                rec.file_type = imported.get("file_type")
                rec.imported_count = imported.get("imported", 0)
                rec.error_message = None
                results.append({"file": filename, "status": "ok", "result": imported})
            else:
                failed += 1
                rec.status = "error"
                rec.error_message = imported.get("message", "import failed")
                rec.imported_count = 0
                results.append({"file": filename, "status": "error", "error": rec.error_message, "result": imported})
        except Exception as exc:
            failed += 1
            rec.status = "error"
            rec.error_message = str(exc)
            rec.imported_count = 0
            results.append({"file": filename, "status": "error", "error": str(exc)})
        db.session.commit()

    return jsonify(
        {
            "status": "ok" if failed == 0 else "partial",
            "account_set": _serialize_account_set(row),
            "total": len(records),
            "success": success,
            "failed": failed,
            "results": results,
        }
    )


@admin_bp.route("/accounts")
@admin_required
def accounts_page():
    return render_template("admin/accounts.html", current_user_id=g.current_user.id)


@admin_bp.route("/employees/manage")
@admin_required
def employees_page():
    shifts = Shift.query.order_by(Shift.shift_no.asc()).all()
    return render_template("admin/employees.html", shifts=shifts)


@admin_bp.route("/shifts/manage")
@admin_required
def shifts_page():
    return render_template("admin/shifts.html")


@admin_bp.route("/departments/manage")
@admin_required
def departments_page():
    return render_template("admin/departments.html")


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


@admin_bp.route("/import/raw-files", methods=["POST"])
@admin_required
def import_raw_files():
    account_set_id = request.form.get("account_set_id", type=int)
    account_set = AccountSet.query.get(account_set_id) if account_set_id else AccountSet.query.filter_by(is_active=True).first()
    if not account_set:
        return jsonify({"status": "error", "message": "请先创建并选择账套"}), 400

    uploaded_files = request.files.getlist("files")
    if not uploaded_files:
        return jsonify({"status": "error", "message": "No files uploaded"}), 400

    results = []
    success = 0
    failed = 0
    for file in uploaded_files:
        filename = (file.filename or "").strip()
        if not filename:
            failed += 1
            results.append({"file": "", "status": "error", "error": "invalid filename"})
            continue

        account_set_dir = os.path.join(current_app.config["UPLOAD_FOLDER"], "account_sets", account_set.month)
        os.makedirs(account_set_dir, exist_ok=True)
        save_name = f"{int(datetime.now().timestamp())}_{filename}"
        save_path = os.path.join(account_set_dir, save_name)
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        file.save(save_path)

        file_type = "daily"
        if "加班" in filename:
            file_type = "overtime"
        elif "请假" in filename:
            file_type = "leave"
        elif "月报" in filename:
            file_type = "monthly"

        import_record = AccountSetImport(
            account_set_id=account_set.id,
            source_filename=filename,
            stored_path=save_path,
            file_type=file_type,
            status="uploaded",
            imported_count=0,
        )
        db.session.add(import_record)

        try:
            success += 1
            import_record.error_message = None
            results.append({"file": filename, "status": "ok", "message": "uploaded"})
        except Exception as exc:
            failed += 1
            import_record.status = "error"
            import_record.error_message = str(exc)
            results.append({"file": filename, "status": "error", "error": str(exc)})
        db.session.commit()

    return jsonify(
        {
            "status": "ok" if failed == 0 else "partial",
            "account_set": _serialize_account_set(account_set),
            "total": len(uploaded_files),
            "success": success,
            "failed": failed,
            "results": results,
        }
    )


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
        return jsonify({"error": "shift_no already exists"}), 400

    shift = Shift(
        shift_no=shift_no,
        shift_name=shift_name,
        time_slots=time_slots,
        is_cross_day=is_cross_day,
    )
    db.session.add(shift)

    db.session.commit()
    return jsonify({"status": "ok", "id": shift.id})


@admin_bp.route("/shifts", methods=["GET"])
@admin_required
def list_shifts():
    rows = Shift.query.order_by(Shift.shift_no.asc()).all()
    return jsonify(
        [
            {
                "id": s.id,
                "shift_no": s.shift_no,
                "shift_name": s.shift_name,
                "time_slots": s.time_slots or [],
                "is_cross_day": s.is_cross_day,
            }
            for s in rows
        ]
    )


@admin_bp.route("/shifts/<int:shift_id>", methods=["PUT"])
@admin_required
def update_shift(shift_id: int):
    data = request.json or {}
    shift_no = (data.get("shift_no") or "").strip()
    shift_name = (data.get("shift_name") or "").strip()
    time_slots = data.get("time_slots") or []
    is_cross_day = bool(data.get("is_cross_day", False))

    shift = Shift.query.get_or_404(shift_id)
    if not shift_no or not shift_name:
        return jsonify({"error": "shift_no and shift_name are required"}), 400

    duplicate = Shift.query.filter(Shift.shift_no == shift_no, Shift.id != shift_id).first()
    if duplicate:
        return jsonify({"error": "shift_no already exists"}), 400

    shift.shift_no = shift_no
    shift.shift_name = shift_name
    shift.time_slots = time_slots
    shift.is_cross_day = is_cross_day
    db.session.commit()
    return jsonify({"status": "ok"})


@admin_bp.route("/shifts/<int:shift_id>", methods=["DELETE"])
@admin_required
def delete_shift(shift_id: int):
    shift = Shift.query.get_or_404(shift_id)
    if shift.employee_assignments:
        return jsonify({"error": "该班次已绑定员工，无法删除"}), 400
    if shift.daily_records:
        return jsonify({"error": "该班次已有关联考勤记录，无法删除"}), 400

    db.session.delete(shift)
    db.session.commit()
    return jsonify({"status": "ok"})


@admin_bp.route("/employees", methods=["GET"])
@admin_required
def employees_list():
    rows = Employee.query.order_by(Employee.emp_no.asc()).all()
    return jsonify([_serialize_employee(e) for e in rows])


@admin_bp.route("/departments", methods=["GET"])
@admin_required
def departments_list():
    rows = Department.query.order_by(Department.dept_name.asc()).all()
    return jsonify(
        [
            {
                "id": d.id,
                "dept_no": d.dept_no,
                "dept_name": d.dept_name,
                "parent_id": d.parent_id,
                "parent_name": d.parent.dept_name if d.parent else "",
                "is_locked": bool(d.is_locked),
            }
            for d in rows
        ]
    )


@admin_bp.route("/departments", methods=["POST"])
@admin_required
def create_department():
    data = request.json or {}
    dept_no = (data.get("dept_no") or "").strip()
    dept_name = (data.get("dept_name") or "").strip()
    parent_id = _parse_parent_id(data.get("parent_id"))
    is_locked = bool(data.get("is_locked"))
    if not dept_no or not dept_name:
        return jsonify({"error": "dept_no and dept_name are required"}), 400
    if parent_id == -1:
        return jsonify({"error": "parent_id must be integer"}), 400
    if Department.query.filter_by(dept_no=dept_no).first():
        return jsonify({"error": "dept_no already exists"}), 400
    parent, err = _validate_parent_department(parent_id)
    if err:
        return jsonify({"error": err}), 400

    department = Department(
        dept_no=dept_no,
        dept_name=dept_name,
        parent_id=parent.id if parent else None,
        is_locked=is_locked,
    )
    db.session.add(department)
    db.session.commit()
    return jsonify({"status": "ok", "id": department.id})


@admin_bp.route("/departments/<int:dept_id>", methods=["PUT"])
@admin_required
def update_department(dept_id: int):
    data = request.json or {}
    dept_no = (data.get("dept_no") or "").strip()
    dept_name = (data.get("dept_name") or "").strip()
    parent_id = _parse_parent_id(data.get("parent_id"))
    is_locked = bool(data.get("is_locked"))
    if not dept_no or not dept_name:
        return jsonify({"error": "dept_no and dept_name are required"}), 400
    if parent_id == -1:
        return jsonify({"error": "parent_id must be integer"}), 400

    department = Department.query.get_or_404(dept_id)
    duplicate = Department.query.filter(Department.dept_no == dept_no, Department.id != dept_id).first()
    if duplicate:
        return jsonify({"error": "dept_no already exists"}), 400
    parent, err = _validate_parent_department(parent_id, dept_id)
    if err:
        return jsonify({"error": err}), 400

    department.dept_no = dept_no
    department.dept_name = dept_name
    department.parent_id = parent.id if parent else None
    department.is_locked = is_locked
    db.session.commit()
    return jsonify({"status": "ok"})


@admin_bp.route("/departments/<int:dept_id>", methods=["DELETE"])
@admin_required
def delete_department(dept_id: int):
    department = Department.query.get_or_404(dept_id)
    if department.children:
        return jsonify({"error": "该部门存在下级部门，无法删除"}), 400
    if department.employees:
        return jsonify({"error": "该部门已绑定员工，无法删除"}), 400
    if department.user_assignments:
        return jsonify({"error": "该部门已绑定账号权限，无法删除"}), 400

    db.session.delete(department)
    db.session.commit()
    return jsonify({"status": "ok"})


@admin_bp.route("/departments/batch", methods=["POST"])
@admin_required
def batch_operate_departments():
    data = request.json or {}
    ids = data.get("ids") or []
    action = (data.get("action") or "").strip()

    if action not in {"delete", "set_parent", "lock", "unlock"}:
        return jsonify({"error": "unsupported action"}), 400
    if not ids:
        return jsonify({"error": "ids are required"}), 400

    departments = Department.query.filter(Department.id.in_(ids)).all()
    if not departments:
        return jsonify({"error": "departments not found"}), 404

    if action == "delete":
        blocked = []
        for department in departments:
            if department.children:
                blocked.append(f"{department.dept_name}（存在下级部门）")
            elif department.employees:
                blocked.append(f"{department.dept_name}（已绑定员工）")
            elif department.user_assignments:
                blocked.append(f"{department.dept_name}（已绑定账号权限）")
        if blocked:
            return jsonify({"error": f"以下部门不可删除：{', '.join(blocked)}"}), 400

        for department in departments:
            db.session.delete(department)
        db.session.commit()
        return jsonify({"status": "ok", "action": action, "affected": len(departments)})

    if action in {"lock", "unlock"}:
        locked = action == "lock"
        for department in departments:
            department.is_locked = locked
        db.session.commit()
        return jsonify({"status": "ok", "action": action, "affected": len(departments)})

    parent_id = _parse_parent_id(data.get("parent_id"))
    if parent_id == -1:
        return jsonify({"error": "parent_id must be integer"}), 400
    selected_ids = {d.id for d in departments}
    if parent_id in selected_ids:
        return jsonify({"error": "上级部门不能选择已选部门"}), 400
    parent, err = _validate_parent_department(parent_id)
    if err:
        return jsonify({"error": err}), 400

    for department in departments:
        if parent:
            cursor = parent
            while cursor:
                if cursor.id == department.id:
                    return jsonify({"error": f"{department.dept_name} 的上级部门设置会形成循环层级"}), 400
                cursor = cursor.parent
        department.parent_id = parent.id if parent else None
    db.session.commit()
    return jsonify({"status": "ok", "action": action, "affected": len(departments)})


@admin_bp.route("/departments/delete-unbound", methods=["POST"])
@admin_required
def delete_unbound_departments():
    all_departments = Department.query.all()
    deleted = 0
    skipped_locked = 0
    skipped_employee_bound = 0
    skipped_account_bound = 0

    for department in all_departments:
        if department.children:
            continue
        if department.is_locked:
            skipped_locked += 1
            continue
        if department.employees:
            skipped_employee_bound += 1
            continue
        if department.user_assignments:
            skipped_account_bound += 1
            continue
        db.session.delete(department)
        deleted += 1

    db.session.commit()
    return jsonify(
        {
            "status": "ok",
            "deleted": deleted,
            "skipped_locked": skipped_locked,
            "skipped_employee_bound": skipped_employee_bound,
            "skipped_account_bound": skipped_account_bound,
        }
    )


@admin_bp.route("/departments/import", methods=["POST"])
@admin_required
def import_departments_xlsx():
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "file is required"}), 400
    if not file.filename.lower().endswith(".xlsx"):
        return jsonify({"error": "only .xlsx is supported"}), 400

    save_path = os.path.join(current_app.config["UPLOAD_FOLDER"], f"departments_{int(datetime.now().timestamp())}.xlsx")
    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    file.save(save_path)

    wb = openpyxl.load_workbook(save_path, data_only=True, read_only=True)
    ws = wb[wb.sheetnames[0]]
    raw_rows = [list(r) for r in ws.iter_rows(values_only=True)]
    if not raw_rows:
        return jsonify({"error": "empty file"}), 400

    header_idx, header_map = _parse_header_row(raw_rows, ["部门编号", "部门名称", "上级部门编号"])
    dept_no_idx = header_map.get("部门编号", -1)
    dept_name_idx = header_map.get("部门名称", -1)
    parent_no_idx = header_map.get("上级部门编号", -1)
    if dept_no_idx < 0 or dept_name_idx < 0:
        return jsonify({"error": "missing required headers: 部门编号, 部门名称"}), 400

    imported = 0
    pending_parent_links: list[tuple[Department, str]] = []
    for row in raw_rows[header_idx + 1 :]:
        dept_no = (str(row[dept_no_idx]).strip() if dept_no_idx < len(row) and row[dept_no_idx] is not None else "")
        dept_name = (
            str(row[dept_name_idx]).strip() if dept_name_idx < len(row) and row[dept_name_idx] is not None else ""
        )
        parent_no = (
            str(row[parent_no_idx]).strip() if parent_no_idx >= 0 and parent_no_idx < len(row) and row[parent_no_idx] is not None else ""
        )
        if not dept_no or not dept_name:
            continue

        department = Department.query.filter_by(dept_no=dept_no).first()
        if not department:
            department = Department(dept_no=dept_no, dept_name=dept_name)
            db.session.add(department)
        else:
            department.dept_name = dept_name
        pending_parent_links.append((department, parent_no))
        imported += 1

    db.session.flush()
    for department, parent_no in pending_parent_links:
        if not parent_no:
            department.parent_id = None
            continue
        parent = Department.query.filter_by(dept_no=parent_no).first()
        if not parent or parent.id == department.id:
            department.parent_id = None
            continue
        department.parent_id = parent.id

    db.session.commit()
    return jsonify({"status": "ok", "imported": imported})


@admin_bp.route("/departments/template", methods=["GET"])
@admin_required
def download_departments_template():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "部门导入模板"
    ws.append(["部门编号", "部门名称", "上级部门编号"])
    ws.append(["D001", "行政部", ""])
    ws.append(["D002", "生产中心", ""])
    ws.append(["D003", "生产一部", "D002"])

    output = BytesIO()
    wb.save(output)
    output.seek(0)
    return send_file(
        output,
        as_attachment=True,
        download_name="部门导入模板.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@admin_bp.route("/employees", methods=["POST"])
@admin_required
def create_employee():
    data = request.json or {}
    emp_no = (data.get("emp_no") or "").strip()
    name = (data.get("name") or "").strip()
    dept_name = (data.get("dept_name") or "").strip()
    shift_no = (data.get("shift_no") or "").strip()

    if not emp_no or not name:
        return jsonify({"error": "emp_no and name are required"}), 400
    if Employee.query.filter_by(emp_no=emp_no).first():
        return jsonify({"error": "emp_no already exists"}), 400

    department = _resolve_department(dept_name) if dept_name else None
    employee = Employee(emp_no=emp_no, name=name, dept_id=department.id if department else None)
    db.session.add(employee)
    db.session.flush()
    _assign_employee_shift(employee, _resolve_shift(shift_no))
    db.session.commit()
    return jsonify({"status": "ok", "employee": _serialize_employee(employee)})


@admin_bp.route("/employees/<int:employee_id>", methods=["PUT"])
@admin_required
def update_employee(employee_id: int):
    data = request.json or {}
    emp_no = (data.get("emp_no") or "").strip()
    name = (data.get("name") or "").strip()
    dept_name = (data.get("dept_name") or "").strip()
    shift_no = (data.get("shift_no") or "").strip()

    employee = Employee.query.get_or_404(employee_id)

    if not emp_no or not name:
        return jsonify({"error": "emp_no and name are required"}), 400

    duplicate = Employee.query.filter(Employee.emp_no == emp_no, Employee.id != employee_id).first()
    if duplicate:
        return jsonify({"error": "emp_no already exists"}), 400

    employee.emp_no = emp_no
    employee.name = name
    if dept_name:
        department = _resolve_department(dept_name)
        employee.dept_id = department.id if department else None
    else:
        employee.dept_id = None
    _assign_employee_shift(employee, _resolve_shift(shift_no))

    db.session.commit()
    return jsonify({"status": "ok", "employee": _serialize_employee(employee)})


@admin_bp.route("/employees/<int:employee_id>", methods=["DELETE"])
@admin_required
def delete_employee(employee_id: int):
    employee = Employee.query.get_or_404(employee_id)
    db.session.delete(employee)
    db.session.commit()
    return jsonify({"status": "ok"})


@admin_bp.route("/employees/batch", methods=["POST"])
@admin_required
def batch_operate_employees():
    data = request.json or {}
    ids = data.get("ids") or []
    action = (data.get("action") or "").strip()

    if not ids:
        return jsonify({"error": "ids are required"}), 400

    employees = Employee.query.filter(Employee.id.in_(ids)).all()
    if not employees:
        return jsonify({"error": "employees not found"}), 404

    if action == "delete":
        for employee in employees:
            db.session.delete(employee)
        db.session.commit()
        return jsonify({"status": "ok", "action": action, "affected": len(employees)})

    if action == "set_department":
        dept_name = (data.get("dept_name") or "").strip()
        department = _resolve_department(dept_name) if dept_name else None
        for employee in employees:
            employee.dept_id = department.id if department else None
        db.session.commit()
        return jsonify({"status": "ok", "action": action, "affected": len(employees)})

    if action == "set_shift":
        shift_no = (data.get("shift_no") or "").strip()
        shift = _resolve_shift(shift_no) if shift_no else None
        for employee in employees:
            _assign_employee_shift(employee, shift)
        db.session.commit()
        return jsonify({"status": "ok", "action": action, "affected": len(employees)})

    if action == "set_name":
        name = (data.get("name") or "").strip()
        if not name:
            return jsonify({"error": "name is required"}), 400
        if len(employees) != 1:
            return jsonify({"error": "set_name only supports single selected employee"}), 400
        employees[0].name = name
        db.session.commit()
        return jsonify({"status": "ok", "action": action, "affected": 1})

    if action == "set_emp_no":
        emp_no = (data.get("emp_no") or "").strip()
        if not emp_no:
            return jsonify({"error": "emp_no is required"}), 400
        if len(employees) != 1:
            return jsonify({"error": "set_emp_no only supports single selected employee"}), 400
        duplicate = Employee.query.filter(Employee.emp_no == emp_no, Employee.id != employees[0].id).first()
        if duplicate:
            return jsonify({"error": "emp_no already exists"}), 400
        employees[0].emp_no = emp_no
        db.session.commit()
        return jsonify({"status": "ok", "action": action, "affected": 1})

    return jsonify({"error": "unsupported action"}), 400


@admin_bp.route("/employees/import", methods=["POST"])
@admin_required
def import_employees_xlsx():
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "file is required"}), 400
    if not file.filename.lower().endswith(".xlsx"):
        return jsonify({"error": "only .xlsx is supported"}), 400

    save_path = os.path.join(current_app.config["UPLOAD_FOLDER"], f"employees_{int(datetime.now().timestamp())}.xlsx")
    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    file.save(save_path)

    # Parse lightweight employee template directly.
    wb = openpyxl.load_workbook(save_path, data_only=True, read_only=True)
    ws = wb[wb.sheetnames[0]]
    raw_rows = [list(r) for r in ws.iter_rows(values_only=True)]
    if not raw_rows:
        return jsonify({"error": "empty file"}), 400

    header_idx, header_map = _parse_header_row(raw_rows, ["人员编号", "人员姓名", "部门名称", "班次编号"])
    emp_no_idx = header_map.get("人员编号", -1)
    name_idx = header_map.get("人员姓名", -1)
    dept_idx = header_map.get("部门名称", -1)
    shift_idx = header_map.get("班次编号", -1)
    if emp_no_idx < 0 or name_idx < 0:
        return jsonify({"error": "missing required headers: 人员编号, 人员姓名"}), 400

    imported = 0
    for row in raw_rows[header_idx + 1 :]:
        emp_no = (str(row[emp_no_idx]).strip() if emp_no_idx < len(row) and row[emp_no_idx] is not None else "")
        name = (str(row[name_idx]).strip() if name_idx < len(row) and row[name_idx] is not None else "")
        dept_name = (str(row[dept_idx]).strip() if dept_idx >= 0 and dept_idx < len(row) and row[dept_idx] is not None else "")
        shift_no = (str(row[shift_idx]).strip() if shift_idx >= 0 and shift_idx < len(row) and row[shift_idx] is not None else "")
        if not emp_no or not name:
            continue
        department = _resolve_department(dept_name) if dept_name else None
        shift = _resolve_shift(shift_no) if shift_no else None
        employee = Employee.query.filter_by(emp_no=emp_no).first()
        if not employee:
            employee = Employee(emp_no=emp_no, name=name, dept_id=department.id if department else None)
            db.session.add(employee)
            db.session.flush()
        else:
            employee.name = name
            employee.dept_id = department.id if department else None
        _assign_employee_shift(employee, shift)
        imported += 1

    db.session.commit()
    return jsonify({"status": "ok", "imported": imported})


@admin_bp.route("/employees/template", methods=["GET"])
@admin_required
def download_employees_template():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "员工导入模板"
    ws.append(["人员编号", "人员姓名", "部门名称", "班次编号"])
    ws.append(["1001001", "张三", "生产中心", "A00001"])
    ws.append(["1001002", "李四", "行政部", "A00002"])

    output = BytesIO()
    wb.save(output)
    output.seek(0)
    return send_file(
        output,
        as_attachment=True,
        download_name="员工导入模板.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@admin_bp.route("/users/readonly", methods=["POST"])
@admin_required
def create_readonly_user():
    data = request.json or {}
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()
    emp_ids = data.get("emp_ids") or []
    dept_ids = data.get("dept_ids") or []

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
    for dept_id in dept_ids:
        if Department.query.get(dept_id):
            db.session.add(UserDepartmentAssignment(user_id=user.id, dept_id=dept_id))

    db.session.commit()
    return jsonify({"status": "ok", "user_id": user.id})


@admin_bp.route("/users", methods=["GET"])
@admin_required
def users_list():
    users = User.query.order_by(User.id.desc()).all()
    return jsonify([_serialize_user(u) for u in users])


@admin_bp.route("/users", methods=["POST"])
@admin_required
def create_user():
    data = request.json or {}
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()
    role = (data.get("role") or "readonly").strip() or "readonly"
    emp_ids = data.get("emp_ids") or []
    dept_ids = data.get("dept_ids") or []

    if role not in {"admin", "readonly"}:
        return jsonify({"error": "invalid role"}), 400
    if not username or not password:
        return jsonify({"error": "username and password are required"}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({"error": "username already exists"}), 400

    user = User(username=username, role=role)
    user.set_password(password)
    db.session.add(user)
    db.session.flush()
    _sync_user_assignments(user, [int(x) for x in emp_ids if str(x).isdigit()])
    _sync_user_department_assignments(user, [int(x) for x in dept_ids if str(x).isdigit()])
    db.session.commit()
    return jsonify({"status": "ok", "user": _serialize_user(user)})


@admin_bp.route("/users/<int:user_id>", methods=["PUT"])
@admin_required
def update_user(user_id: int):
    data = request.json or {}
    role = (data.get("role") or "").strip()
    emp_ids = data.get("emp_ids")
    dept_ids = data.get("dept_ids")
    user = User.query.get_or_404(user_id)

    if user.id == g.current_user.id and role and role != "admin":
        return jsonify({"error": "cannot downgrade current admin"}), 400

    if role:
        if role not in {"admin", "readonly"}:
            return jsonify({"error": "invalid role"}), 400
        user.role = role

    if emp_ids is not None:
        parsed_ids = [int(x) for x in emp_ids if str(x).isdigit()]
        _sync_user_assignments(user, parsed_ids)
    if dept_ids is not None:
        parsed_ids = [int(x) for x in dept_ids if str(x).isdigit()]
        _sync_user_department_assignments(user, parsed_ids)

    db.session.commit()
    return jsonify({"status": "ok", "user": _serialize_user(user)})


@admin_bp.route("/users/<int:user_id>/password", methods=["PUT"])
@admin_required
def reset_user_password(user_id: int):
    data = request.json or {}
    password = (data.get("password") or "").strip()
    if not password:
        return jsonify({"error": "password is required"}), 400

    user = User.query.get_or_404(user_id)
    user.set_password(password)
    db.session.commit()
    return jsonify({"status": "ok"})


@admin_bp.route("/users/<int:user_id>", methods=["DELETE"])
@admin_required
def delete_user(user_id: int):
    user = User.query.get_or_404(user_id)
    if user.id == g.current_user.id:
        return jsonify({"error": "cannot delete current user"}), 400

    admin_count = User.query.filter_by(role="admin").count()
    if user.role == "admin" and admin_count <= 1:
        return jsonify({"error": "cannot delete last admin"}), 400

    db.session.delete(user)
    db.session.commit()
    return jsonify({"status": "ok"})


@admin_bp.route("/daily-records/<int:record_id>/annotate", methods=["POST"])
@admin_required
def annotate_record(record_id: int):
    data = request.json or {}
    reason = (data.get("exception_reason") or "").strip()
    record = DailyRecord.query.get_or_404(record_id)
    record.exception_reason = reason
    db.session.commit()
    return jsonify({"status": "ok"})


@admin_bp.route("/")
@admin_required
def admin_root():
    return redirect("/admin/dashboard")
