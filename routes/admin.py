from __future__ import annotations

import os
import subprocess
from io import BytesIO
from datetime import datetime
from typing import Any

from flask import Blueprint, current_app, jsonify, redirect, render_template, request, send_file, g
import openpyxl

from models import db
from models.department import Department
from models.employee import Employee
from models.employee import (
    ATTENDANCE_SOURCE_AUTO_FALLBACK,
    ATTENDANCE_SOURCE_EMPLOYEE,
    ATTENDANCE_SOURCE_MANAGER,
    ATTENDANCE_SOURCE_VALUES,
)
from models.employee_shift import EmployeeShiftAssignment
from models.shift import Shift
from models.daily_record import DailyRecord
from models.account_set import AccountSet, AccountSetImport
from models.overtime import OvertimeRecord
from models.annual_leave import AnnualLeave
from models.manager_month_stat import ManagerMonthStat
from models.manager_attendance_override import ManagerAttendanceOverride
from models.employee_attendance_override import EmployeeAttendanceOverride
from models.attendance_override_history import AttendanceOverrideHistory
from models.user import (
    ALL_PAGE_PERMISSION_KEYS,
    EMPLOYEE_PAGE_PERMISSION_KEYS,
    MANAGER_PAGE_PERMISSION_KEYS,
    PAGE_PERMISSION_LABELS,
    User,
    UserEmployeeAssignment,
    UserDepartmentAssignment,
)
from services.import_service import ImportService
from services.manager_attendance_service import ManagerAttendanceOptions, build_manager_rows
from routes.auth import admin_required
from utils.helpers import parse_bool_zh


admin_bp = Blueprint("admin", __name__, url_prefix="/admin")


_EMPLOYEE_OVERRIDE_FIELDS = (
    "attendance_days",
    "work_hours",
    "half_days",
    "late_early_minutes",
)

_EMPLOYEE_OVERRIDE_LABELS = {
    "attendance_days": "考勤天数",
    "work_hours": "工时",
    "half_days": "半勤天数",
    "late_early_minutes": "迟到早退",
    "remark": "备注",
}

_MANAGER_ATTENDANCE_OVERRIDE_FIELDS = (
    "attendance_days",
    "injury_days",
    "business_trip_days",
    "marriage_days",
    "funeral_days",
    "late_early_minutes",
)

_MANAGER_OVERRIDE_LABELS = {
    "attendance_days": "出勤天数",
    "injury_days": "工伤",
    "business_trip_days": "出差",
    "marriage_days": "婚假",
    "funeral_days": "丧假",
    "late_early_minutes": "迟到早退",
    "remark": "备注",
}

_DEPARTMENT_ORIGINAL_ID_HEADER = "原始部门ID"
_DEPARTMENT_METADATA_SHEET = "部门导入元数据"


def _manager_scope_employees():
    return (
        Employee.query.filter(Employee.is_manager.is_(True))
        .order_by(Employee.dept_id.asc(), Employee.emp_no.asc(), Employee.name.asc())
        .all()
    )


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
        "page_permissions": user.effective_page_permissions(),
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


def _default_page_permissions_for_role(role: str) -> dict[str, bool]:
    if role == "admin":
        return {key: True for key in ALL_PAGE_PERMISSION_KEYS}
    return {key: True for key in ALL_PAGE_PERMISSION_KEYS}


def _parse_page_permissions(data: dict | None, role: str, existing_user: User | None = None) -> dict[str, bool]:
    if role == "admin":
        return {key: True for key in ALL_PAGE_PERMISSION_KEYS}

    if not data or "page_permissions" not in data:
        if existing_user and isinstance(existing_user.page_permissions, dict):
            return existing_user.effective_page_permissions()
        return _default_page_permissions_for_role(role)

    raw = data.get("page_permissions") or {}
    if not isinstance(raw, dict):
        return _default_page_permissions_for_role(role)
    return {key: bool(raw.get(key, False)) for key in ALL_PAGE_PERMISSION_KEYS}


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
        "is_manager": bool(employee.is_manager),
        "is_nursing": bool(employee.is_nursing),
        "employee_stats_attendance_source": employee.employee_stats_attendance_source or ATTENDANCE_SOURCE_EMPLOYEE,
        "manager_stats_attendance_source": employee.manager_stats_attendance_source or ATTENDANCE_SOURCE_MANAGER,
        "dept_id": employee.dept_id,
        "dept_no": employee.department.dept_no if employee.department else "",
        "dept_name": employee.department.dept_name if employee.department else "",
        "department": employee.department.dept_name if employee.department else "",
        "shift_id": shift.id if shift else None,
        "shift_no": shift.shift_no if shift else "",
        "shift_name": shift.shift_name if shift else "",
    }


def _parse_attendance_source(value: Any, default: str) -> str:
    source = str(value or "").strip() or default
    if source not in ATTENDANCE_SOURCE_VALUES:
        return default
    return source


def _parse_department_original_id(value: Any) -> int | None:
    raw_value = str(value or "").strip()
    if not raw_value:
        return None
    try:
        return int(float(raw_value))
    except (TypeError, ValueError):
        return None


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
        "is_locked": bool(row.is_locked),
        "locked_at": row.locked_at.isoformat() if row.locked_at else None,
        "locked_by": row.locked_by,
        "factory_rest_days": row.factory_rest_days or 0,
        "monthly_benefit_days": row.monthly_benefit_days or 0,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "imports_count": len(row.imports),
        "pending_count": pending_count,
        "success_count": success_count,
        "error_count": error_count,
        "latest_import_at": latest_import_at.isoformat() if latest_import_at else None,
    }


def _account_set_file_type(filename: str) -> str:
    if "加班" in filename:
        return "overtime"
    if "请假" in filename:
        return "leave"
    if "管理人员" in filename and "月报" in filename:
        return "manager_monthly"
    if "管理人员" in filename:
        return "manager_daily"
    if "月报" in filename:
        return "monthly"
    return "daily"


def _account_set_for_month(month: str | None) -> AccountSet | None:
    key = (month or "").strip()
    if not key:
        return None
    return AccountSet.query.filter_by(month=key).first()


def _locked_account_set_error(account_set: AccountSet, action_label: str):
    return jsonify({"error": f"{account_set.month} 账套已锁定，不能{action_label}"}), 400


def _ensure_account_set_unlocked(account_set: AccountSet | None, action_label: str):
    if account_set and account_set.is_locked:
        return _locked_account_set_error(account_set, action_label)
    return None


def _user_display_name(user: User | None) -> str:
    return user.username if user else ""


def _override_field_labels(override_type: str) -> dict[str, str]:
    return _EMPLOYEE_OVERRIDE_LABELS if override_type == "employee" else _MANAGER_OVERRIDE_LABELS


def _override_field_names(override_type: str) -> tuple[str, ...]:
    return _EMPLOYEE_OVERRIDE_FIELDS if override_type == "employee" else _MANAGER_ATTENDANCE_OVERRIDE_FIELDS


def _override_state_from_row(row: object | None, fields: tuple[str, ...]) -> dict[str, object]:
    state = {field: getattr(row, field) if row else None for field in fields}
    state["remark"] = row.remark if row else ""
    return state


def _has_override_state_changes(before: dict[str, object], after: dict[str, object]) -> bool:
    keys = set(before.keys()) | set(after.keys())
    return any(before.get(key) != after.get(key) for key in keys)


def _changed_override_fields(before: dict[str, object], after: dict[str, object]) -> list[str]:
    keys = [key for key in after.keys() if key in before or key == "remark"]
    return [key for key in keys if before.get(key) != after.get(key)]


def _record_override_history(
    override_type: str,
    emp_id: int,
    month: str,
    action_type: str,
    before_values: dict[str, object],
    after_values: dict[str, object],
    source_file_name: str | None = None,
) -> None:
    history = AttendanceOverrideHistory(
        override_type=override_type,
        emp_id=emp_id,
        month=month,
        action_type=action_type,
        changed_fields_json=_changed_override_fields(before_values, after_values),
        before_values_json=before_values,
        after_values_json=after_values,
        remark=str(after_values.get("remark") or ""),
        source_file_name=(source_file_name or "").strip() or None,
        operator_user_id=g.current_user.id if getattr(g, "current_user", None) else None,
    )
    db.session.add(history)


def _serialize_override_history(row: AttendanceOverrideHistory) -> dict[str, object]:
    labels = _override_field_labels(row.override_type)
    before = row.before_values_json if isinstance(row.before_values_json, dict) else {}
    after = row.after_values_json if isinstance(row.after_values_json, dict) else {}
    changed_fields = list(row.changed_fields_json or [])
    changes = [
        {
            "field": field,
            "label": labels.get(field, field),
            "before": before.get(field),
            "after": after.get(field),
        }
        for field in changed_fields
    ]
    return {
        "id": row.id,
        "override_type": row.override_type,
        "action_type": row.action_type,
        "month": row.month,
        "emp_id": row.emp_id,
        "emp_no": row.employee.emp_no if row.employee else "",
        "employee_name": row.employee.name if row.employee else "",
        "remark": row.remark or "",
        "source_file_name": row.source_file_name or "",
        "operator_name": _user_display_name(row.operator_user),
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "changes": changes,
    }


def _history_rows(override_type: str, emp_id: int, month: str) -> list[dict[str, object]]:
    rows = (
        AttendanceOverrideHistory.query.filter_by(override_type=override_type, emp_id=emp_id, month=month)
        .order_by(AttendanceOverrideHistory.created_at.desc(), AttendanceOverrideHistory.id.desc())
        .all()
    )
    return [_serialize_override_history(row) for row in rows]


def _history_rows_for_month(override_type: str, month: str) -> list[dict[str, object]]:
    rows = (
        AttendanceOverrideHistory.query.filter_by(override_type=override_type, month=month)
        .order_by(AttendanceOverrideHistory.created_at.desc(), AttendanceOverrideHistory.id.desc())
        .all()
    )
    return [_serialize_override_history(row) for row in rows]


def _locked_months_for_year(year: int, include_prev_dec: bool = False) -> list[str]:
    months = [f"{year}-{month:02d}" for month in range(1, 13)]
    if include_prev_dec:
        months.insert(0, f"{year - 1}-12")
    locked = []
    for month in months:
        account_set = _account_set_for_month(month)
        if account_set and account_set.is_locked:
            locked.append(month)
    return locked


def _ensure_year_months_unlocked(year: int, action_label: str, include_prev_dec: bool = False):
    locked_months = _locked_months_for_year(year, include_prev_dec=include_prev_dec)
    if locked_months:
        return jsonify({"error": f"{', '.join(locked_months)} 账套已锁定，不能{action_label}"}), 400
    return None


def _stat_key_month(year: int, stat_key: str) -> str | None:
    if stat_key == "prev_dec":
        return f"{year - 1}-12"
    if stat_key.startswith("m") and stat_key[1:].isdigit():
        month_no = int(stat_key[1:])
        if 1 <= month_no <= 12:
            return f"{year}-{month_no:02d}"
    return None


def _stat_key_lock_state(year: int, stat_key: str) -> str:
    month = _stat_key_month(year, stat_key)
    if not month:
        return "editable"
    account_set = _account_set_for_month(month)
    if not account_set:
        return "missing_account_set"
    return "locked" if account_set.is_locked else "editable"


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
    factory_rest_days = request.json.get("factory_rest_days", 0) if request.json else 0
    monthly_benefit_days = request.json.get("monthly_benefit_days", 0) if request.json else 0
    if not month or len(month) != 7:
        return jsonify({"error": "month is required in YYYY-MM format"}), 400
    if AccountSet.query.filter_by(month=month).first():
        return jsonify({"error": "该月份账套已存在"}), 400

    row = AccountSet(
        month=month,
        name=f"{month} 账套",
        factory_rest_days=float(factory_rest_days or 0),
        monthly_benefit_days=float(monthly_benefit_days or 0),
    )
    if AccountSet.query.count() == 0:
        row.is_active = True
    db.session.add(row)
    db.session.commit()
    return jsonify({"status": "ok", "account_set": _serialize_account_set(row)})


@admin_bp.route("/account-sets/<int:account_set_id>", methods=["PUT"])
@admin_required
def update_account_set(account_set_id: int):
    row = AccountSet.query.get_or_404(account_set_id)
    locked_error = _ensure_account_set_unlocked(row, "修改账套参数")
    if locked_error:
        return locked_error
    data = request.json or {}
    row.factory_rest_days = float(data.get("factory_rest_days") or 0)
    row.monthly_benefit_days = float(data.get("monthly_benefit_days") or 0)
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


@admin_bp.route("/account-sets/<int:account_set_id>/lock", methods=["POST"])
@admin_required
def lock_account_set(account_set_id: int):
    row = AccountSet.query.get_or_404(account_set_id)
    if not row.is_locked:
        row.is_locked = True
        row.locked_at = datetime.utcnow()
        row.locked_by = g.current_user.id
        db.session.commit()
    return jsonify({"status": "ok", "account_set": _serialize_account_set(row)})


@admin_bp.route("/account-sets/<int:account_set_id>/unlock", methods=["POST"])
@admin_required
def unlock_account_set(account_set_id: int):
    row = AccountSet.query.get_or_404(account_set_id)
    if row.is_locked:
        row.is_locked = False
        row.locked_at = None
        row.locked_by = None
        db.session.commit()
    return jsonify({"status": "ok", "account_set": _serialize_account_set(row)})


@admin_bp.route("/account-sets/<int:account_set_id>", methods=["DELETE"])
@admin_required
def delete_account_set(account_set_id: int):
    row = AccountSet.query.get_or_404(account_set_id)
    locked_error = _ensure_account_set_unlocked(row, "删除账套")
    if locked_error:
        return locked_error

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
    locked_error = _ensure_account_set_unlocked(row, "重新计算")
    if locked_error:
        return locked_error
    mode = (request.args.get("mode") or "all").strip()
    records_query = AccountSetImport.query.filter_by(account_set_id=row.id)
    if mode == "employee":
        records_query = records_query.filter(AccountSetImport.file_type.in_(["leave", "overtime", "monthly", "daily"]))
    elif mode == "manager":
        records_query = records_query.filter(AccountSetImport.file_type.in_(["leave", "overtime", "manager_monthly", "manager_daily"]))
    records = records_query.order_by(AccountSetImport.id.asc()).all()

    if not records:
        return jsonify({"status": "error", "message": "该账套暂无可计算文件", "mode": mode}), 400

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

    manager_stats_sync = None
    if mode == "manager" and failed == 0:
        try:
            manager_options = ManagerAttendanceOptions(
                month=row.month,
                factory_rest_days=row.factory_rest_days or 0,
                monthly_benefit_days=row.monthly_benefit_days or 0,
            )
            manager_rows = build_manager_rows(manager_options, sync_month_stats=True)
            manager_stats_sync = _sync_manager_stats_from_manager_rows(row.month, manager_rows)
            if manager_stats_sync["error_count"]:
                failed += manager_stats_sync["error_count"]
            db.session.commit()
        except Exception as exc:
            db.session.rollback()
            failed += 1
            manager_stats_sync = {
                "month": row.month,
                "overtime_synced": 0,
                "annual_leave_synced": 0,
                "error_count": 1,
                "errors": [str(exc)],
            }

    return jsonify(
        {
            "status": "ok" if failed == 0 else "partial",
            "account_set": _serialize_account_set(row),
            "mode": mode,
            "total": len(records),
            "success": success,
            "failed": failed,
            "manager_stats_sync": manager_stats_sync,
            "results": results,
        }
    )


@admin_bp.route("/accounts")
@admin_required
def accounts_page():
    return render_template(
        "admin/accounts.html",
        current_user_id=g.current_user.id,
        manager_page_permissions=[{"key": key, "label": PAGE_PERMISSION_LABELS[key]} for key in MANAGER_PAGE_PERMISSION_KEYS],
        employee_page_permissions=[{"key": key, "label": PAGE_PERMISSION_LABELS[key]} for key in EMPLOYEE_PAGE_PERMISSION_KEYS],
    )


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


@admin_bp.route("/manager-overtime")
@admin_required
def manager_overtime_page():
    return render_template("admin/manager_overtime.html")


@admin_bp.route("/manager-annual-leave")
@admin_required
def manager_annual_leave_page():
    return render_template("admin/manager_annual_leave.html")


@admin_bp.route("/manager-attendance-overrides")
@admin_required
def manager_attendance_overrides_page():
    employees = _manager_scope_employees()
    return render_template("admin/manager_attendance_overrides.html", employees=employees)


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
    locked_error = _ensure_account_set_unlocked(account_set, "上传原始文件")
    if locked_error:
        return locked_error

    uploaded_files = [file for file in request.files.getlist("files") if (file.filename or "").strip()]
    if not uploaded_files:
        return jsonify({"status": "error", "message": "请至少选择一个要上传的源文件"}), 400

    results = []
    success = 0
    failed = 0
    for file in uploaded_files:
        filename = file.filename.strip()

        file_type = _account_set_file_type(filename)
        previous_record = AccountSetImport.query.filter_by(account_set_id=account_set.id, file_type=file_type).first()
        replaced = previous_record is not None

        if previous_record:
            old_path = (previous_record.stored_path or "").strip()
            if old_path and os.path.exists(old_path):
                try:
                    os.remove(old_path)
                except Exception:
                    pass
            db.session.delete(previous_record)
            db.session.flush()

        account_set_dir = os.path.join(current_app.config["UPLOAD_FOLDER"], "account_sets", account_set.month)
        os.makedirs(account_set_dir, exist_ok=True)
        save_name = f"{int(datetime.now().timestamp())}_{filename}"
        save_path = os.path.join(account_set_dir, save_name)
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        file.save(save_path)

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
            results.append({"file": filename, "status": "ok", "message": "replaced" if replaced else "uploaded"})
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


@admin_bp.route("/manager-overtime/records", methods=["GET"])
@admin_required
def manager_overtime_records():
    year = request.args.get("year", type=int) or datetime.now().year
    return jsonify(_manager_month_rows(_manager_overtime_values(year), "剩余调休天数"))


@admin_bp.route("/manager-overtime/records", methods=["PUT"])
@admin_required
def update_manager_overtime_summary():
    payload, status = _save_manager_month_stat("overtime")
    return jsonify(payload), status


@admin_bp.route("/manager-overtime/template", methods=["GET"])
@admin_required
def download_manager_overtime_template():
    return _download_manager_stat_template("overtime")


@admin_bp.route("/manager-overtime/import", methods=["POST"])
@admin_required
def import_manager_overtime():
    year = request.form.get("year", type=int) or datetime.now().year
    locked_error = _ensure_year_months_unlocked(year, "导入管理人员加班统计", include_prev_dec=True)
    if locked_error:
        return locked_error
    return _import_manager_stat_file("overtime", year)


@admin_bp.route("/manager-overtime/records/<int:record_id>", methods=["PUT"])
@admin_required
def update_manager_overtime_record(record_id: int):
    row = OvertimeRecord.query.get_or_404(record_id)
    if not row.employee or not row.employee.is_manager:
        return jsonify({"error": "record is not a manager overtime record"}), 400
    month = row.date.strftime("%Y-%m") if row.date else None
    account_set = _account_set_for_month(month)
    locked_error = _ensure_account_set_unlocked(account_set, "修改管理人员加班记录")
    if locked_error:
        return locked_error
    data = request.json or {}
    row.effective_hours = float(data.get("effective_hours") or 0)
    row.salary_option = (data.get("salary_option") or "").strip()
    row.is_weekend = bool(data.get("is_weekend"))
    row.is_holiday = bool(data.get("is_holiday"))
    row.approval_status = (data.get("approval_status") or "").strip()
    row.reason = (data.get("reason") or "").strip()
    db.session.commit()
    return jsonify({"status": "ok"})


def _manager_export_months(year: int) -> list[tuple[str, str]]:
    months = [(f"{year - 1}-12", "12月")]
    months.extend((f"{year}-{month:02d}", f"{month}月") for month in range(1, 13))
    return months


def _manager_base_month_values() -> dict[str, dict[str, object]]:
    employees = _manager_scope_employees()
    return {
        employee.name: {
            "emp_id": employee.id,
            "dept_name": employee.department.dept_name if employee.department else "",
            "remark": "",
        }
        for employee in employees
    }


def _month_value_keys() -> list[str]:
    return ["prev_dec", *[f"m{month}" for month in range(1, 13)]]


def _annual_leave_value_keys() -> list[str]:
    return [f"m{month}" for month in range(1, 13)]


def _number_or_blank(value: object) -> float | str:
    if value in (None, ""):
        return ""
    try:
        return float(value)
    except (TypeError, ValueError):
        return ""


def _month_for_stat_key(year: int, key: str) -> str:
    if key == "prev_dec":
        return f"{year - 1}-12"
    return f"{year}-{int(key[1:]):02d}"


def _validate_manager_month_stat(stat_type: str, year: int, values: dict[str, float]) -> str | None:
    if stat_type == "annual_leave":
        total = sum(values.values())
        if any(value < 0 for value in values.values()):
            return "年休使用天数不能为负数"
        if total > 12:
            return "年休一年最多 12 天"
        for key, value in values.items():
            if value > 3:
                return "年休每月使用不能超过 3 天"
            month = _month_for_stat_key(year, key)
            account_set = AccountSet.query.filter_by(month=month).first()
            factory_rest_days = (account_set.factory_rest_days if account_set else 0) or 0
            if factory_rest_days + value > 7:
                return f"{month} 厂休+年休不能超过 7 天"

    if stat_type == "overtime":
        balance = 0.0
        for key in _month_value_keys():
            value = values.get(key, 0.0)
            if value < 0 and balance <= 0:
                return "剩余加班天数为 0 时不能使用调休"
            if balance + value < 0:
                return "使用调休天数不能超过当前剩余加班天数"
            balance += value
    return None


def _stat_value_keys(stat_type: str) -> list[str]:
    return _annual_leave_value_keys() if stat_type == "annual_leave" else _month_value_keys()


def _stat_headers(stat_type: str) -> list[str]:
    if stat_type == "annual_leave":
        return ["部门", "姓名", "1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月", "剩余年休天数", "备注"]
    return ["部门", "姓名", "前年累积天数", "1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月", "剩余调休天数", "备注"]


def _stat_col_keys(stat_type: str) -> list[tuple[str, str]]:
    if stat_type == "annual_leave":
        return [(f"m{month}", f"{month}月") for month in range(1, 13)]
    return [("prev_dec", "前年累积天数"), *[(f"m{month}", f"{month}月") for month in range(1, 13)]]


def _apply_saved_manager_stats(values_by_name: dict[str, dict[str, object]], year: int, stat_type: str) -> None:
    rows = (
        ManagerMonthStat.query.join(Employee, ManagerMonthStat.emp_id == Employee.id)
        .filter(
            ManagerMonthStat.year == year,
            ManagerMonthStat.stat_type == stat_type,
            Employee.is_manager.is_(True),
        )
        .all()
    )
    for row in rows:
        if not row.employee or row.employee.name not in values_by_name:
            continue
        values = values_by_name[row.employee.name]
        for key in _stat_value_keys(stat_type):
            values[key] = getattr(row, key)
        if stat_type == "annual_leave":
            values["prev_dec"] = ""
        values["remaining"] = row.remaining
        values["remark"] = row.remark or ""


def _upsert_manager_month_stat(stat_type: str, emp_id: int, year: int, values: dict[str, float], remark: str) -> tuple[dict[str, str], int]:
    employee = Employee.query.get_or_404(emp_id)
    if not employee.is_manager:
        return {"error": "employee is not manager"}, 400
    row = ManagerMonthStat.query.filter_by(emp_id=employee.id, year=year, stat_type=stat_type).first()
    error = _validate_manager_month_stat(stat_type, year, values)
    if error:
        return {"error": error}, 400
    if not row:
        row = ManagerMonthStat(emp_id=employee.id, year=year, stat_type=stat_type)
        db.session.add(row)
    if stat_type == "annual_leave":
        row.prev_dec = 0
    for key, value in values.items():
        setattr(row, key, value)
    row.remaining = round(12 - sum(values.values()), 2) if stat_type == "annual_leave" else round(sum(values.values()), 2)
    row.remark = (remark or "").strip()
    db.session.commit()
    return {"status": "ok"}, 200


def _save_manager_month_stat(stat_type: str) -> tuple[dict[str, str], int]:
    data = request.json or {}
    emp_id = int(data.get("emp_id") or 0)
    year = int(data.get("year") or datetime.now().year)
    keys = _stat_value_keys(stat_type)
    submitted_values = {key: float(_number_or_blank(data.get(key)) or 0) for key in keys}
    employee = Employee.query.get_or_404(emp_id)
    if not employee.is_manager:
        return {"error": "employee is not manager"}, 400

    row = ManagerMonthStat.query.filter_by(emp_id=employee.id, year=year, stat_type=stat_type).first()
    values = {
        key: float(getattr(row, key) or 0) if row else 0.0
        for key in keys
    }
    skipped_locked_months: list[str] = []
    for key in keys:
        month = _stat_key_month(year, key)
        if _stat_key_lock_state(year, key) == "locked":
            if month:
                skipped_locked_months.append(month)
            continue
        values[key] = submitted_values[key]

    payload, status = _upsert_manager_month_stat(stat_type, emp_id, year, values, data.get("remark") or "")
    if status != 200:
        return payload, status
    if skipped_locked_months:
        payload["skipped_locked_months"] = sorted(set(skipped_locked_months))
        payload["warning"] = f"已跳过锁定月份：{'、'.join(payload['skipped_locked_months'])}"
    return payload, status

def _validate_month(value: str | None) -> str | None:
    text = (value or "").strip()
    try:
        datetime.strptime(text, "%Y-%m")
    except ValueError:
        return None
    return text


def _manager_attendance_options(month: str) -> ManagerAttendanceOptions:
    account = AccountSet.query.filter_by(month=month).first()
    return ManagerAttendanceOptions(
        month=month,
        factory_rest_days=(account.factory_rest_days if account else 0) or 0,
        monthly_benefit_days=(account.monthly_benefit_days if account else 0) or 0,
    )


def _manager_attendance_override_payload(row: ManagerAttendanceOverride | None) -> dict[str, object]:
    payload = {field: getattr(row, field) if row else None for field in _MANAGER_ATTENDANCE_OVERRIDE_FIELDS}
    payload["remark"] = row.remark if row else ""
    payload["updated_at"] = row.updated_at.isoformat() if row and row.updated_at else None
    payload["updated_by_name"] = _user_display_name(row.updated_by_user) if row else ""
    return payload


def _manager_attendance_row(emp_id: int, month: str, include_overrides: bool) -> dict[str, object] | None:
    options = _manager_attendance_options(month)
    rows = build_manager_rows(options, [emp_id], include_overrides=include_overrides)
    return rows[0] if rows else None


def _manager_attendance_response(emp_id: int, month: str) -> tuple[dict[str, object], int]:
    employee = Employee.query.get(emp_id)
    if not employee or not employee.is_manager:
        return {"error": "employee is not manager"}, 400
    automatic = _manager_attendance_row(emp_id, month, include_overrides=False)
    applied = _manager_attendance_row(emp_id, month, include_overrides=True)
    override = ManagerAttendanceOverride.query.filter_by(emp_id=emp_id, month=month).first()
    return {
        "employee": _serialize_employee(employee),
        "month": month,
        "automatic": automatic,
        "override": _manager_attendance_override_payload(override),
        "applied": applied,
        "history": _history_rows_for_month("manager", month),
    }, 200


def _nullable_float(data: dict[str, object], key: str) -> tuple[float | None, str | None]:
    value = data.get(key)
    if value in (None, ""):
        return None, None
    try:
        parsed = round(float(value), 2)
    except (TypeError, ValueError):
        return None, f"{key} 必须是数字"
    if parsed < 0:
        return None, f"{key} 不能为负数"
    return parsed, None


def _nullable_int(data: dict[str, object], key: str) -> tuple[int | None, str | None]:
    value = data.get(key)
    if value in (None, ""):
        return None, None
    try:
        parsed = int(round(float(value)))
    except (TypeError, ValueError):
        return None, f"{key} 必须是整数"
    if parsed < 0:
        return None, f"{key} 不能为负数"
    return parsed, None


@admin_bp.route("/manager-attendance-overrides/record", methods=["GET"])
@admin_required
def manager_attendance_override_record():
    emp_id = request.args.get("emp_id", type=int) or 0
    month = _validate_month(request.args.get("month"))
    if not emp_id or not month:
        return jsonify({"error": "请选择管理人员和有效月份"}), 400
    payload, status = _manager_attendance_response(emp_id, month)
    return jsonify(payload), status


@admin_bp.route("/manager-attendance-overrides/record", methods=["PUT"])
@admin_required
def save_manager_attendance_override_record():
    data = request.json or {}
    emp_id = int(data.get("emp_id") or 0)
    month = _validate_month(data.get("month"))
    if not emp_id or not month:
        return jsonify({"error": "请选择管理人员和有效月份"}), 400
    account_set = _account_set_for_month(month)
    locked_error = _ensure_account_set_unlocked(account_set, "保存管理人员考勤修正")
    if locked_error:
        return locked_error
    employee = Employee.query.get(emp_id)
    if not employee or not employee.is_manager:
        return jsonify({"error": "employee is not manager"}), 400

    values: dict[str, float | int | None] = {}
    for key in ("attendance_days", "injury_days", "business_trip_days", "marriage_days", "funeral_days"):
        value, error = _nullable_float(data, key)
        if error:
            return jsonify({"error": error}), 400
        values[key] = value
    late_value, error = _nullable_int(data, "late_early_minutes")
    if error:
        return jsonify({"error": error}), 400
    values["late_early_minutes"] = late_value

    row = ManagerAttendanceOverride.query.filter_by(emp_id=emp_id, month=month).first()
    before_values = _override_state_from_row(row, _MANAGER_ATTENDANCE_OVERRIDE_FIELDS)
    after_values = dict(values)
    after_values["remark"] = (data.get("remark") or "").strip()
    if _has_override_state_changes(before_values, after_values):
        if not row:
            row = ManagerAttendanceOverride(emp_id=emp_id, month=month)
            db.session.add(row)
        for key, value in values.items():
            setattr(row, key, value)
        row.remark = after_values["remark"]
        row.updated_by = g.current_user.id
        _record_override_history("manager", emp_id, month, "manual_save", before_values, after_values)
        db.session.commit()

    payload, status = _manager_attendance_response(emp_id, month)
    return jsonify(payload), status


@admin_bp.route("/manager-attendance-overrides/record", methods=["DELETE"])
@admin_required
def delete_manager_attendance_override_record():
    emp_id = request.args.get("emp_id", type=int) or 0
    month = _validate_month(request.args.get("month"))
    if not emp_id or not month:
        return jsonify({"error": "请选择管理人员和有效月份"}), 400
    account_set = _account_set_for_month(month)
    locked_error = _ensure_account_set_unlocked(account_set, "清空管理人员考勤修正")
    if locked_error:
        return locked_error
    row = ManagerAttendanceOverride.query.filter_by(emp_id=emp_id, month=month).first()
    if row:
        before_values = _override_state_from_row(row, _MANAGER_ATTENDANCE_OVERRIDE_FIELDS)
        after_values = _override_state_from_row(None, _MANAGER_ATTENDANCE_OVERRIDE_FIELDS)
        _record_override_history("manager", emp_id, month, "clear", before_values, after_values)
        db.session.delete(row)
        db.session.commit()
    payload, status = _manager_attendance_response(emp_id, month)
    return jsonify(payload), status


def _override_workbook_response(wb: openpyxl.Workbook, filename: str):
    output = BytesIO()
    wb.save(output)
    output.seek(0)
    return send_file(
        output,
        as_attachment=True,
        download_name=filename,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


def _employee_override_export_headers() -> list[str]:
    return [
        "月份",
        "工号",
        "姓名",
        "系统考勤天数",
        "系统工时",
        "系统半勤天数",
        "系统迟到早退",
        "考勤天数",
        "工时",
        "半勤天数",
        "迟到早退",
        "备注",
    ]


def _manager_override_export_headers() -> list[str]:
    return [
        "月份",
        "工号",
        "姓名",
        "系统出勤天数",
        "系统工伤",
        "系统出差",
        "系统婚假",
        "系统丧假",
        "系统迟到早退",
        "出勤天数",
        "工伤",
        "出差",
        "婚假",
        "丧假",
        "迟到早退",
        "备注",
    ]


def _build_employee_override_export_workbook(month: str, include_real_rows: bool) -> openpyxl.Workbook:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "员工考勤修正"
    ws.append(_employee_override_export_headers())
    if include_real_rows:
        employees = (
            Employee.query.filter_by(is_manager=False)
            .order_by(Employee.dept_id.asc(), Employee.emp_no.asc(), Employee.name.asc())
            .all()
        )
        for employee in employees:
            automatic = _employee_automatic_row(employee.id, month) or {}
            override = EmployeeAttendanceOverride.query.filter_by(emp_id=employee.id, month=month).first()
            ws.append(
                [
                    month,
                    employee.emp_no,
                    employee.name,
                    automatic.get("attendance_days"),
                    automatic.get("work_hours"),
                    automatic.get("half_days"),
                    automatic.get("late_early_minutes"),
                    override.attendance_days if override else "",
                    override.work_hours if override else "",
                    override.half_days if override else "",
                    override.late_early_minutes if override else "",
                    override.remark if override and override.remark else "",
                ]
            )
    else:
        ws.append(["2026-05", "1001001", "张三", 20, 160, 0, 5, "", "", "", "", "留空表示不覆盖"])
    return wb


def _build_manager_override_export_workbook(month: str, include_real_rows: bool) -> openpyxl.Workbook:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "管理人员考勤修正"
    ws.append(_manager_override_export_headers())
    if include_real_rows:
        for employee in _manager_scope_employees():
            automatic = _manager_attendance_row(employee.id, month, include_overrides=False) or {}
            override = ManagerAttendanceOverride.query.filter_by(emp_id=employee.id, month=month).first()
            ws.append(
                [
                    month,
                    employee.emp_no,
                    employee.name,
                    automatic.get("attendance_days"),
                    automatic.get("injury_days"),
                    automatic.get("business_trip_days"),
                    automatic.get("marriage_days"),
                    automatic.get("funeral_days"),
                    automatic.get("late_early_minutes"),
                    override.attendance_days if override else "",
                    override.injury_days if override else "",
                    override.business_trip_days if override else "",
                    override.marriage_days if override else "",
                    override.funeral_days if override else "",
                    override.late_early_minutes if override else "",
                    override.remark if override and override.remark else "",
                ]
            )
    else:
        ws.append(["2026-05", "2001001", "李经理", 22, 0, 2, 0, 0, 0, "", "", "", "", "", "", "留空表示不覆盖"])
    return wb


def _import_summary(success_count: int, skipped_count: int, failed_count: int, changed_count: int, errors: list[str]) -> dict[str, object]:
    return {
        "success_count": success_count,
        "skipped_count": skipped_count,
        "failed_count": failed_count,
        "changed_count": changed_count,
        "errors": errors,
    }


def _apply_employee_override_updates(
    row: EmployeeAttendanceOverride | None,
    emp_id: int,
    month: str,
    updates: dict[str, object],
    action_type: str,
    source_file_name: str | None = None,
) -> bool:
    before_values = _override_state_from_row(row, _EMPLOYEE_OVERRIDE_FIELDS)
    after_values = dict(before_values)
    after_values.update(updates)
    if not _has_override_state_changes(before_values, after_values):
        return False
    if not row:
        row = EmployeeAttendanceOverride(emp_id=emp_id, month=month)
        db.session.add(row)
    for field in _EMPLOYEE_OVERRIDE_FIELDS:
        setattr(row, field, after_values.get(field))
    row.remark = str(after_values.get("remark") or "")
    row.updated_by = g.current_user.id
    _record_override_history("employee", emp_id, month, action_type, before_values, after_values, source_file_name)
    return True


def _apply_manager_override_updates(
    row: ManagerAttendanceOverride | None,
    emp_id: int,
    month: str,
    updates: dict[str, object],
    action_type: str,
    source_file_name: str | None = None,
) -> bool:
    before_values = _override_state_from_row(row, _MANAGER_ATTENDANCE_OVERRIDE_FIELDS)
    after_values = dict(before_values)
    after_values.update(updates)
    if not _has_override_state_changes(before_values, after_values):
        return False
    if not row:
        row = ManagerAttendanceOverride(emp_id=emp_id, month=month)
        db.session.add(row)
    for field in _MANAGER_ATTENDANCE_OVERRIDE_FIELDS:
        setattr(row, field, after_values.get(field))
    row.remark = str(after_values.get("remark") or "")
    row.updated_by = g.current_user.id
    _record_override_history("manager", emp_id, month, action_type, before_values, after_values, source_file_name)
    return True


@admin_bp.route("/manager-attendance-overrides/history", methods=["GET"])
@admin_required
def manager_attendance_override_history():
    month = _validate_month(request.args.get("month"))
    if not month:
        return jsonify({"error": "请选择有效月份"}), 400
    return jsonify({"rows": _history_rows_for_month("manager", month)})


@admin_bp.route("/manager-attendance-overrides/template", methods=["GET"])
@admin_required
def download_manager_attendance_override_template():
    month = _validate_month(request.args.get("month")) or datetime.now().strftime("%Y-%m")
    return _override_workbook_response(_build_manager_override_export_workbook(month, include_real_rows=False), "管理人员考勤修正导入示例.xlsx")


@admin_bp.route("/manager-attendance-overrides/export", methods=["GET"])
@admin_required
def export_manager_attendance_overrides():
    month = _validate_month(request.args.get("month"))
    if not month:
        return jsonify({"error": "请选择有效月份"}), 400
    return _override_workbook_response(_build_manager_override_export_workbook(month, include_real_rows=True), f"管理人员考勤修正导出_{month}.xlsx")


@admin_bp.route("/manager-attendance-overrides/import", methods=["POST"])
@admin_required
def import_manager_attendance_overrides():
    month = _validate_month(request.form.get("month"))
    if not month:
        return jsonify({"error": "请选择有效月份"}), 400
    account_set = _account_set_for_month(month)
    locked_error = _ensure_account_set_unlocked(account_set, "导入管理人员考勤修正")
    if locked_error:
        return locked_error
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "请选择导入文件"}), 400
    wb = openpyxl.load_workbook(file, data_only=True, read_only=True)
    ws = wb[wb.sheetnames[0]]
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    if not rows:
        return jsonify({"error": "empty file"}), 400
    header_idx, header_map = _parse_header_row(rows, ["月份", "工号", "姓名", "出勤天数", "备注"])
    required = ["月份", "工号", "姓名", "出勤天数", "工伤", "出差", "婚假", "丧假", "迟到早退", "备注"]
    missing = [key for key in required if key not in header_map]
    if missing:
        return jsonify({"error": f"缺少列：{', '.join(missing)}"}), 400
    success_count = skipped_count = failed_count = changed_count = 0
    errors: list[str] = []
    for row_index, raw in enumerate(rows[header_idx + 1 :], start=header_idx + 2):
        row_month = str(raw[header_map["月份"]]).strip() if header_map["月份"] < len(raw) and raw[header_map["月份"]] is not None else ""
        emp_no = str(raw[header_map["工号"]]).strip() if header_map["工号"] < len(raw) and raw[header_map["工号"]] is not None else ""
        if not row_month and not emp_no:
            skipped_count += 1
            continue
        if row_month != month:
            failed_count += 1
            errors.append(f"第 {row_index} 行：月份 {row_month or '空'} 与当前月份 {month} 不一致")
            continue
        employee = Employee.query.filter_by(emp_no=emp_no).first()
        if not employee or not employee.is_manager:
            failed_count += 1
            errors.append(f"第 {row_index} 行：工号 {emp_no or '空'} 未找到管理人员")
            continue
        updates: dict[str, object] = {}
        for key in ("attendance_days", "injury_days", "business_trip_days", "marriage_days", "funeral_days"):
            label = _MANAGER_OVERRIDE_LABELS[key]
            value = raw[header_map[label]] if header_map[label] < len(raw) else None
            parsed, error = _nullable_float({key: value}, key)
            if error:
                failed_count += 1
                errors.append(f"第 {row_index} 行：{error}")
                updates = {}
                break
            if value not in (None, ""):
                updates[key] = parsed
        if not updates and failed_count and len(errors) and errors[-1].startswith(f"第 {row_index} 行"):
            continue
        late_value = raw[header_map["迟到早退"]] if header_map["迟到早退"] < len(raw) else None
        parsed_late, error = _nullable_int({"late_early_minutes": late_value}, "late_early_minutes")
        if error:
            failed_count += 1
            errors.append(f"第 {row_index} 行：{error}")
            continue
        if late_value not in (None, ""):
            updates["late_early_minutes"] = parsed_late
        remark_value = raw[header_map["备注"]] if header_map["备注"] < len(raw) else None
        if remark_value not in (None, ""):
            updates["remark"] = str(remark_value).strip()
        row_obj = ManagerAttendanceOverride.query.filter_by(emp_id=employee.id, month=month).first()
        changed = _apply_manager_override_updates(row_obj, employee.id, month, updates, "import", file.filename)
        if changed:
            success_count += 1
            changed_count += 1
        else:
            skipped_count += 1
    db.session.commit()
    return jsonify(_import_summary(success_count, skipped_count, failed_count, changed_count, errors))


def _stat_key_for_month(month: str) -> tuple[int, str]:
    year, month_no = [int(part) for part in month.split("-", 1)]
    return year, f"m{month_no}"


def _sync_manager_stats_from_manager_rows(month: str, manager_rows: list[dict[str, object]]) -> dict[str, object]:
    """Stats are now written directly inside build_manager_rows.
    This function provides a compatibility layer — it validates the results
    but no longer writes to the stat tables to avoid double-writing.
    """
    year, key = _stat_key_for_month(month)
    employees_by_name = {employee.name: employee for employee in _manager_scope_employees()}
    errors: list[str] = []

    for item in manager_rows:
        name = str(item.get("name") or "").strip()
        employee = employees_by_name.get(name)
        if not employee:
            errors.append(f"{name or '空姓名'}：未找到管理人员")
            continue

        for stat_type, source_key, label in (
            ("overtime", "overtime_change", "加班变化"),
            ("annual_leave", "benefit_days", "福利天数"),
        ):
            stat_row = ManagerMonthStat.query.filter_by(emp_id=employee.id, year=year, stat_type=stat_type).first()
            values = {
                stat_key: float(getattr(stat_row, stat_key) or 0) if stat_row else 0.0
                for stat_key in _stat_value_keys(stat_type)
            }
            # Values already written by build_manager_rows; validate only
            error = _validate_manager_month_stat(stat_type, year, values)
            if error:
                errors.append(f"{employee.name} {label}：{error}")

    return {
        "month": month,
        "overtime_synced": 0,
        "annual_leave_synced": 0,
        "error_count": len(errors),
        "errors": errors,
    }


def _download_manager_stat_template(stat_type: str):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "年休统计表" if stat_type == "annual_leave" else "加班统计表"
    ws.append(_stat_headers(stat_type))
    employees = _manager_scope_employees()
    for employee in employees:
        values = [employee.department.dept_name if employee.department else "", employee.name]
        values.extend("" for _key, _label in _stat_col_keys(stat_type))
        values.extend([12 if stat_type == "annual_leave" else 0, ""])
        ws.append(values)

    output = BytesIO()
    wb.save(output)
    output.seek(0)
    filename = "管理人员年休导入示例.xlsx" if stat_type == "annual_leave" else "管理人员加班导入示例.xlsx"
    return send_file(
        output,
        as_attachment=True,
        download_name=filename,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


def _header_map(ws) -> dict[str, int]:
    headers = {}
    for cell in ws[1]:
        text = str(cell.value or "").strip()
        if text:
            headers[text] = cell.column
    return headers


def _import_manager_stat_file(stat_type: str, year: int):
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "请选择要导入的Excel文件"}), 400

    wb = openpyxl.load_workbook(file, data_only=True)
    ws = wb.active
    headers = _header_map(ws)
    if "姓名" not in headers:
        return jsonify({"error": "导入文件缺少姓名列"}), 400

    imported = 0
    errors: list[str] = []
    skipped_locked_months: set[str] = set()
    employees_by_name = {employee.name: employee for employee in _manager_scope_employees()}
    for row_idx in range(2, ws.max_row + 1):
        name = str(ws.cell(row_idx, headers["姓名"]).value or "").strip()
        if not name:
            continue
        employee = employees_by_name.get(name)
        if not employee:
            errors.append(f"第{row_idx}行：未找到管理人员 {name}")
            continue

        existing_row = ManagerMonthStat.query.filter_by(emp_id=employee.id, year=year, stat_type=stat_type).first()
        values = {
            key: float(getattr(existing_row, key) or 0) if existing_row else 0.0
            for key in _stat_value_keys(stat_type)
        }
        for key, label in _stat_col_keys(stat_type):
            col_idx = headers.get(label)
            month = _stat_key_month(year, key)
            if _stat_key_lock_state(year, key) == "locked":
                if month:
                    skipped_locked_months.add(month)
                continue
            values[key] = float(_number_or_blank(ws.cell(row_idx, col_idx).value if col_idx else None) or 0)
        remark_col = headers.get("备注")
        remark = str(ws.cell(row_idx, remark_col).value or "").strip() if remark_col else ""
        payload, status = _upsert_manager_month_stat(stat_type, employee.id, year, values, remark)
        if status != 200:
            errors.append(f"第{row_idx}行：{payload.get('error', '保存失败')}")
            continue
        imported += 1

    response = {
        "status": "ok",
        "imported": imported,
        "errors": errors,
        "error_count": len(errors),
        "skipped_locked_months": sorted(skipped_locked_months),
    }
    if skipped_locked_months:
        response["warning"] = f"已跳过锁定月份：{'、'.join(response['skipped_locked_months'])}"
    return jsonify(response)


def _manager_overtime_values(year: int) -> dict[str, dict[str, object]]:
    values_by_name = _manager_base_month_values()
    for values in values_by_name.values():
        values["remaining"] = 0
    _apply_saved_manager_stats(values_by_name, year, "overtime")
    return values_by_name


def _manager_annual_leave_values(year: int) -> dict[str, dict[str, object]]:
    values_by_name = _manager_base_month_values()
    for values in values_by_name.values():
        values["remaining"] = 12
    _apply_saved_manager_stats(values_by_name, year, "annual_leave")
    return values_by_name


def _manager_month_rows(values_by_name: dict[str, dict[str, object]], remaining_label: str, keys: list[str] | None = None) -> list[dict[str, object]]:
    keys = keys or _month_value_keys()
    rows = []
    for name, values in values_by_name.items():
        row = {
            "emp_id": values.get("emp_id"),
            "dept_name": values.get("dept_name", ""),
            "name": name,
            "remaining_label": remaining_label,
            "remaining": values.get("remaining", ""),
            "remark": values.get("remark", ""),
        }
        for key in keys:
            row[key] = values.get(key, "")
        rows.append(row)
    return rows


def _fill_named_month_template(ws, values_by_name: dict[str, dict[str, object]], total_key: str, keys: list[str] | None = None) -> None:
    keys = keys or _month_value_keys()
    total_col = 3 + len(keys)
    remark_col = total_col + 1
    filled: set[str] = set()
    for row_idx in range(2, ws.max_row + 1):
        name = str(ws.cell(row_idx, 2).value or "").strip()
        for col_idx in range(3, remark_col + 1):
            ws.cell(row_idx, col_idx).value = ""
        if not name or name not in values_by_name:
            continue
        values = values_by_name[name]
        for col_idx, key in enumerate(keys, start=3):
            ws.cell(row_idx, col_idx).value = values.get(key, "")
        ws.cell(row_idx, total_col).value = values.get(total_key, "")
        ws.cell(row_idx, remark_col).value = values.get("remark", "")
        filled.add(name)

    for name, values in values_by_name.items():
        if name in filled:
            continue
        ws.append(
            [
                values.get("dept_name", ""),
                name,
                *[values.get(key, "") for key in keys],
                values.get(total_key, ""),
                values.get("remark", ""),
            ]
        )


@admin_bp.route("/manager-overtime/export", methods=["GET"])
@admin_required
def export_manager_overtime():
    year = request.args.get("year", type=int) or datetime.now().year
    values_by_name = _manager_overtime_values(year)
    month_keys = _manager_export_months(year)
    template_path = "/home/lewis/文档/考勤/加班单查询表.xlsx"
    if os.path.exists(template_path):
        wb = openpyxl.load_workbook(template_path)
        ws = wb.active
    else:
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["部门", "姓名", *[label for _month, label in month_keys], "剩余调休天数", "备注"])
    ws.cell(1, 3).value = "前年累积天数"
    _fill_named_month_template(ws, values_by_name, "remaining")

    output = BytesIO()
    wb.save(output)
    output.seek(0)
    return send_file(
        output,
        as_attachment=True,
        download_name=f"管理人员加班信息_{year}.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@admin_bp.route("/manager-annual-leave/records", methods=["GET"])
@admin_required
def manager_annual_leave_records():
    year = request.args.get("year", type=int) or datetime.now().year
    return jsonify(_manager_month_rows(_manager_annual_leave_values(year), "剩余年休天数", _annual_leave_value_keys()))


@admin_bp.route("/manager-annual-leave/records", methods=["PUT"])
@admin_required
def update_manager_annual_leave_record():
    data = request.json or {}
    if any(key in data for key in _annual_leave_value_keys()) or "remaining" in data:
        payload, status = _save_manager_month_stat("annual_leave")
        return jsonify(payload), status

    emp_id = int(data.get("emp_id") or 0)
    year = int(data.get("year") or datetime.now().year)
    locked_error = _ensure_year_months_unlocked(year, "修改管理人员年休统计")
    if locked_error:
        return locked_error
    employee = Employee.query.get_or_404(emp_id)
    if not employee.is_manager:
        return jsonify({"error": "employee is not manager"}), 400
    row = AnnualLeave.query.filter_by(emp_id=employee.id, year=year).first()
    if not row:
        row = AnnualLeave(emp_id=employee.id, year=year)
        db.session.add(row)
    row.total_days = float(data.get("total_days") or 0)
    row.used_days = float(data.get("used_days") or 0)
    row.remaining_days = float(data.get("remaining_days") or 0)
    db.session.commit()
    return jsonify({"status": "ok", "id": row.id})


@admin_bp.route("/manager-annual-leave/template", methods=["GET"])
@admin_required
def download_manager_annual_leave_template():
    return _download_manager_stat_template("annual_leave")


@admin_bp.route("/manager-annual-leave/import", methods=["POST"])
@admin_required
def import_manager_annual_leave():
    year = request.form.get("year", type=int) or datetime.now().year
    locked_error = _ensure_year_months_unlocked(year, "导入管理人员年休统计")
    if locked_error:
        return locked_error
    return _import_manager_stat_file("annual_leave", year)


@admin_bp.route("/manager-annual-leave/export", methods=["GET"])
@admin_required
def export_manager_annual_leave():
    year = request.args.get("year", type=int) or datetime.now().year
    values_by_name = _manager_annual_leave_values(year)

    template_path = "/home/lewis/文档/考勤/加班单查询表.xlsx"
    if os.path.exists(template_path):
        wb = openpyxl.load_workbook(template_path)
        ws = wb.active
        ws.delete_cols(3)
    else:
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["部门", "姓名", "1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月", "剩余年休天数", "备注"])
    ws.title = "年休统计表"
    ws.cell(1, 15).value = "剩余年休天数"
    ws.cell(1, 16).value = "备注"
    _fill_named_month_template(ws, values_by_name, "remaining", _annual_leave_value_keys())

    output = BytesIO()
    wb.save(output)
    output.seek(0)
    return send_file(
        output,
        as_attachment=True,
        download_name=f"管理人员年休信息_{year}.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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

    wb = openpyxl.load_workbook(save_path, data_only=True)
    ws = wb[wb.sheetnames[0]]
    raw_rows = [list(r) for r in ws.iter_rows(values_only=True)]
    if not raw_rows:
        return jsonify({"error": "empty file"}), 400

    original_ids_by_row: dict[int, int] = {}
    if _DEPARTMENT_METADATA_SHEET in wb.sheetnames:
        metadata_ws = wb[_DEPARTMENT_METADATA_SHEET]
        for data_row_no, original_id in metadata_ws.iter_rows(min_row=2, values_only=True):
            if data_row_no is None or original_id is None:
                continue
            try:
                row_no = int(float(data_row_no))
            except (TypeError, ValueError):
                continue
            parsed_original_id = _parse_department_original_id(original_id)
            if parsed_original_id is not None:
                original_ids_by_row[row_no] = parsed_original_id

    header_idx, header_map = _parse_header_row(raw_rows, ["部门编号", "部门名称", "上级部门编号"])
    dept_no_idx = header_map.get("部门编号", -1)
    dept_name_idx = header_map.get("部门名称", -1)
    parent_no_idx = header_map.get("上级部门编号", -1)
    original_id_idx = header_map.get(_DEPARTMENT_ORIGINAL_ID_HEADER, -1)
    if dept_no_idx < 0 or dept_name_idx < 0:
        return jsonify({"error": "missing required headers: 部门编号, 部门名称"}), 400

    imported = 0
    pending_parent_links: list[tuple[Department, str]] = []
    existing_departments = Department.query.order_by(Department.id.asc()).all()
    departments_by_id = {department.id: department for department in existing_departments}
    departments_by_dept_no = {
        department.dept_no: department for department in existing_departments if department.dept_no
    }
    for row_idx, row in enumerate(raw_rows[header_idx + 1 :], start=header_idx + 2):
        dept_no = (str(row[dept_no_idx]).strip() if dept_no_idx < len(row) and row[dept_no_idx] is not None else "")
        dept_name = (
            str(row[dept_name_idx]).strip() if dept_name_idx < len(row) and row[dept_name_idx] is not None else ""
        )
        parent_no = (
            str(row[parent_no_idx]).strip() if parent_no_idx >= 0 and parent_no_idx < len(row) and row[parent_no_idx] is not None else ""
        )
        original_id = original_ids_by_row.get(row_idx)
        if original_id_idx >= 0 and original_id_idx < len(row):
            original_id = _parse_department_original_id(row[original_id_idx]) or original_id
        if not dept_no or not dept_name:
            continue

        department = departments_by_id.get(original_id) if original_id is not None else None
        if not department:
            department = departments_by_dept_no.get(dept_no)
        if not department:
            department = Department(dept_no=dept_no, dept_name=dept_name)
            db.session.add(department)
            departments_by_dept_no[dept_no] = department
        else:
            previous_dept_no = department.dept_no
            department.dept_no = dept_no
            department.dept_name = dept_name
            if previous_dept_no and departments_by_dept_no.get(previous_dept_no) is department:
                departments_by_dept_no.pop(previous_dept_no, None)
            departments_by_dept_no[dept_no] = department
        if department.id is not None:
            departments_by_id[department.id] = department
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


def _build_departments_workbook(rows: list[tuple[str, str, str, str]]) -> openpyxl.Workbook:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "部门导入模板"
    ws.append(["部门编号", "部门名称", "上级部门编号", _DEPARTMENT_ORIGINAL_ID_HEADER])
    ws.column_dimensions["D"].hidden = True

    for row in rows:
        ws.append(list(row[:4]))
    return wb


@admin_bp.route("/departments/template", methods=["GET"])
@admin_required
def download_departments_template():
    wb = _build_departments_workbook(
        [
            ("D001", "行政部", "", ""),
            ("D002", "生产中心", "", ""),
            ("D003", "生产一部", "D002", ""),
        ]
    )

    output = BytesIO()
    wb.save(output)
    output.seek(0)
    return send_file(
        output,
        as_attachment=True,
        download_name="部门导入模板.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@admin_bp.route("/departments/export", methods=["GET"])
@admin_required
def export_departments_xlsx():
    departments = Department.query.order_by(Department.dept_no.asc(), Department.dept_name.asc()).all()
    rows = [
        (
            department.dept_no or "",
            department.dept_name or "",
            department.parent.dept_no if department.parent else "",
            str(department.id),
        )
        for department in departments
    ]
    wb = _build_departments_workbook(rows)

    output = BytesIO()
    wb.save(output)
    output.seek(0)
    return send_file(
        output,
        as_attachment=True,
        download_name="部门导出.xlsx",
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
    is_manager = bool(data.get("is_manager"))
    is_nursing = bool(data.get("is_nursing"))
    employee_stats_attendance_source = _parse_attendance_source(
        data.get("employee_stats_attendance_source"), ATTENDANCE_SOURCE_EMPLOYEE
    )
    manager_stats_attendance_source = _parse_attendance_source(
        data.get("manager_stats_attendance_source"), ATTENDANCE_SOURCE_MANAGER
    )

    if not emp_no or not name:
        return jsonify({"error": "emp_no and name are required"}), 400
    if Employee.query.filter_by(emp_no=emp_no).first():
        return jsonify({"error": "emp_no already exists"}), 400

    department = _resolve_department(dept_name) if dept_name else None
    employee = Employee(
        emp_no=emp_no,
        name=name,
        dept_id=department.id if department else None,
        is_manager=is_manager,
        is_nursing=is_nursing,
        employee_stats_attendance_source=employee_stats_attendance_source,
        manager_stats_attendance_source=manager_stats_attendance_source,
    )
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
    is_manager = bool(data.get("is_manager"))
    is_nursing = data.get("is_nursing")
    employee_stats_attendance_source = data.get("employee_stats_attendance_source")
    manager_stats_attendance_source = data.get("manager_stats_attendance_source")
    if is_nursing is not None:
        is_nursing = bool(is_nursing)

    employee = Employee.query.get_or_404(employee_id)

    if not emp_no or not name:
        return jsonify({"error": "emp_no and name are required"}), 400

    duplicate = Employee.query.filter(Employee.emp_no == emp_no, Employee.id != employee_id).first()
    if duplicate:
        return jsonify({"error": "emp_no already exists"}), 400

    employee.emp_no = emp_no
    employee.name = name
    employee.is_manager = is_manager
    if is_nursing is not None:
        employee.is_nursing = is_nursing
    employee.employee_stats_attendance_source = _parse_attendance_source(
        employee_stats_attendance_source, employee.employee_stats_attendance_source or ATTENDANCE_SOURCE_EMPLOYEE
    )
    employee.manager_stats_attendance_source = _parse_attendance_source(
        manager_stats_attendance_source, employee.manager_stats_attendance_source or ATTENDANCE_SOURCE_MANAGER
    )
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

    if action == "set_manager":
        is_manager = bool(data.get("is_manager"))
        for employee in employees:
            employee.is_manager = is_manager
        db.session.commit()
        return jsonify({"status": "ok", "action": action, "affected": len(employees)})

    if action == "set_nursing":
        is_nursing = bool(data.get("is_nursing"))
        for employee in employees:
            employee.is_nursing = is_nursing
        db.session.commit()
        return jsonify({"status": "ok", "action": action, "affected": len(employees)})

    if action == "set_employee_stats_attendance_source":
        source = _parse_attendance_source(data.get("employee_stats_attendance_source"), ATTENDANCE_SOURCE_EMPLOYEE)
        for employee in employees:
            employee.employee_stats_attendance_source = source
        db.session.commit()
        return jsonify({"status": "ok", "action": action, "affected": len(employees)})

    if action == "set_manager_stats_attendance_source":
        source = _parse_attendance_source(data.get("manager_stats_attendance_source"), ATTENDANCE_SOURCE_MANAGER)
        for employee in employees:
            employee.manager_stats_attendance_source = source
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
    manager_idx = header_map.get("是否管理人员", -1)
    nursing_idx = header_map.get("是否哺乳假", -1)
    employee_source_idx = header_map.get("员工考勤统计来源", -1)
    manager_source_idx = header_map.get("管理人员考勤统计来源", -1)
    if emp_no_idx < 0 or name_idx < 0:
        return jsonify({"error": "missing required headers: 人员编号, 人员姓名"}), 400

    imported = 0
    for row in raw_rows[header_idx + 1 :]:
        emp_no = (str(row[emp_no_idx]).strip() if emp_no_idx < len(row) and row[emp_no_idx] is not None else "")
        name = (str(row[name_idx]).strip() if name_idx < len(row) and row[name_idx] is not None else "")
        dept_name = (str(row[dept_idx]).strip() if dept_idx >= 0 and dept_idx < len(row) and row[dept_idx] is not None else "")
        shift_no = (str(row[shift_idx]).strip() if shift_idx >= 0 and shift_idx < len(row) and row[shift_idx] is not None else "")
        is_manager = parse_bool_zh(row[manager_idx]) if manager_idx >= 0 and manager_idx < len(row) else False
        is_nursing = parse_bool_zh(row[nursing_idx]) if nursing_idx >= 0 and nursing_idx < len(row) else False
        employee_stats_attendance_source = _parse_attendance_source(
            row[employee_source_idx] if employee_source_idx >= 0 and employee_source_idx < len(row) else None,
            ATTENDANCE_SOURCE_EMPLOYEE,
        )
        manager_stats_attendance_source = _parse_attendance_source(
            row[manager_source_idx] if manager_source_idx >= 0 and manager_source_idx < len(row) else None,
            ATTENDANCE_SOURCE_MANAGER,
        )
        if not emp_no or not name:
            continue
        department = _resolve_department(dept_name) if dept_name else None
        shift = _resolve_shift(shift_no) if shift_no else None
        employee = Employee.query.filter_by(emp_no=emp_no).first()
        if not employee:
            employee = Employee(
                emp_no=emp_no,
                name=name,
                dept_id=department.id if department else None,
                is_manager=is_manager,
                is_nursing=is_nursing,
                employee_stats_attendance_source=employee_stats_attendance_source,
                manager_stats_attendance_source=manager_stats_attendance_source,
            )
            db.session.add(employee)
            db.session.flush()
        else:
            employee.name = name
            employee.dept_id = department.id if department else None
            employee.is_manager = is_manager
            employee.is_nursing = is_nursing
            employee.employee_stats_attendance_source = employee_stats_attendance_source
            employee.manager_stats_attendance_source = manager_stats_attendance_source
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
    ws.append(["人员编号", "人员姓名", "部门名称", "班次编号", "是否管理人员", "是否哺乳假", "员工考勤统计来源", "管理人员考勤统计来源"])
    ws.append(["1001001", "张三", "生产中心", "A00001", "否", "否", "员工考勤源文件取值", "管理人员考勤源文件取值"])
    ws.append(["1001002", "李四", "行政部", "A00002", "是", "是", "员工考勤源文件取值", "管理人员考勤源文件取值"])

    output = BytesIO()
    wb.save(output)
    output.seek(0)
    return send_file(
        output,
        as_attachment=True,
        download_name="员工导入模板.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@admin_bp.route("/employees/export", methods=["GET"])
@admin_required
def export_employees_xlsx():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "员工主数据导出"
    ws.append(["人员编号", "人员姓名", "部门名称", "班次编号", "是否管理人员", "是否哺乳假", "员工考勤统计来源", "管理人员考勤统计来源"])

    requested_ids: list[int] = []
    for raw in request.args.getlist("ids"):
        for part in str(raw).split(","):
            text = part.strip()
            if text.isdigit():
                requested_ids.append(int(text))

    query = Employee.query
    if requested_ids:
        query = query.filter(Employee.id.in_(requested_ids))

    employees = query.order_by(Employee.emp_no.asc(), Employee.name.asc()).all()
    for employee in employees:
        shift = employee.shift_assignment.shift if employee.shift_assignment else None
        ws.append([
            employee.emp_no or "",
            employee.name or "",
            employee.department.dept_name if employee.department else "",
            shift.shift_no if shift else "",
            "是" if employee.is_manager else "否",
            "是" if employee.is_nursing else "否",
            "管理人员考勤源文件取值" if employee.employee_stats_attendance_source == ATTENDANCE_SOURCE_MANAGER else ("自动回退" if employee.employee_stats_attendance_source == ATTENDANCE_SOURCE_AUTO_FALLBACK else "员工考勤源文件取值"),
            "员工考勤源文件取值" if employee.manager_stats_attendance_source == ATTENDANCE_SOURCE_EMPLOYEE else ("自动回退" if employee.manager_stats_attendance_source == ATTENDANCE_SOURCE_AUTO_FALLBACK else "管理人员考勤源文件取值"),
        ])

    output = BytesIO()
    wb.save(output)
    output.seek(0)
    return send_file(
        output,
        as_attachment=True,
        download_name="员工主数据导出.xlsx",
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
    user.page_permissions = _parse_page_permissions(data, "readonly")
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
    user.page_permissions = _parse_page_permissions(data, role)
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
    next_role = role or user.role

    if user.id == g.current_user.id and role and role != "admin":
        return jsonify({"error": "cannot downgrade current admin"}), 400

    if role:
        if role not in {"admin", "readonly"}:
            return jsonify({"error": "invalid role"}), 400
        user.role = role

    user.page_permissions = _parse_page_permissions(data, next_role, existing_user=user)

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


@admin_bp.route("/employee-attendance-overrides")
@admin_required
def employee_attendance_overrides_page():
    employees = (
        Employee.query.filter_by(is_manager=False)
        .order_by(Employee.dept_id.asc(), Employee.emp_no.asc(), Employee.name.asc())
        .all()
    )
    return render_template("admin/employee_attendance_overrides.html", employees=employees)

def _employee_override_values(override: EmployeeAttendanceOverride | None) -> dict[str, float | int | None]:
    return {field: getattr(override, field) if override else None for field in _EMPLOYEE_OVERRIDE_FIELDS}


def _employee_automatic_row(emp_id: int, month: str) -> dict[str, object] | None:
    from routes.employee import _build_final_rows

    rows = _build_final_rows(month, [emp_id])
    if not rows:
        return None
    row = rows[0]
    return {
        "attendance_days": row[3],
        "work_hours": row[16],
        "half_days": row[17],
        "late_early_minutes": _employee_late_early_minutes(emp_id, month),
    }


def _employee_late_early_minutes(emp_id: int, month: str) -> int:
    from routes.employee import _month_date_range

    date_range = _month_date_range(month)
    if not date_range:
        return 0
    start_date, end_date = date_range
    records = (
        DailyRecord.query.filter_by(emp_id=emp_id)
        .filter(DailyRecord.record_date >= start_date, DailyRecord.record_date < end_date)
        .all()
    )
    return sum((r.late_minutes or 0) + (r.early_leave_minutes or 0) for r in records)


def _employee_override_payload(row: EmployeeAttendanceOverride | None) -> dict[str, object]:
    payload = {field: getattr(row, field) if row else None for field in _EMPLOYEE_OVERRIDE_FIELDS}
    payload["remark"] = row.remark if row else ""
    payload["updated_at"] = row.updated_at.isoformat() if row and row.updated_at else None
    payload["updated_by_name"] = _user_display_name(row.updated_by_user) if row else ""
    return payload


def _employee_override_response(emp_id: int, month: str) -> tuple[dict[str, object], int]:
    employee = Employee.query.get(emp_id)
    if not employee or employee.is_manager:
        return {"error": "employee is a manager, not a regular employee"}, 400
    automatic = _employee_automatic_row(emp_id, month)
    override = EmployeeAttendanceOverride.query.filter_by(emp_id=emp_id, month=month).first()
    override_data = _employee_override_values(override)
    applied: dict[str, object] = {}
    if automatic:
        for field in _EMPLOYEE_OVERRIDE_FIELDS:
            applied[field] = override_data[field] if override_data[field] is not None else automatic.get(field)
    return {
        "employee": _serialize_employee(employee),
        "month": month,
        "automatic": automatic,
        "override": _employee_override_payload(override),
        "applied": applied,
        "history": _history_rows_for_month("employee", month),
    }, 200


@admin_bp.route("/employee-attendance-overrides/record", methods=["GET"])
@admin_required
def employee_attendance_override_record():
    emp_id = request.args.get("emp_id", type=int) or 0
    month = _validate_month(request.args.get("month"))
    if not emp_id or not month:
        return jsonify({"error": "请选择员工和有效月份"}), 400
    payload, status = _employee_override_response(emp_id, month)
    return jsonify(payload), status


@admin_bp.route("/employee-attendance-overrides/record", methods=["PUT"])
@admin_required
def save_employee_attendance_override_record():
    data = request.json or {}
    emp_id = int(data.get("emp_id") or 0)
    month = _validate_month(data.get("month"))
    if not emp_id or not month:
        return jsonify({"error": "请选择员工和有效月份"}), 400
    account_set = _account_set_for_month(month)
    locked_error = _ensure_account_set_unlocked(account_set, "保存员工考勤修正")
    if locked_error:
        return locked_error
    employee = Employee.query.get(emp_id)
    if not employee or employee.is_manager:
        return jsonify({"error": "员工不存在或是管理人员"}), 400

    values: dict[str, float | int | None] = {}
    for key in ("attendance_days", "work_hours"):
        value, error = _nullable_float(data, key)
        if error:
            return jsonify({"error": error}), 400
        values[key] = value
    for key in ("half_days", "late_early_minutes"):
        value, error = _nullable_int(data, key)
        if error:
            return jsonify({"error": error}), 400
        values[key] = value

    row = EmployeeAttendanceOverride.query.filter_by(emp_id=emp_id, month=month).first()
    updates = dict(values)
    updates["remark"] = (data.get("remark") or "").strip()
    if _apply_employee_override_updates(row, emp_id, month, updates, "manual_save"):
        db.session.commit()

    payload, status = _employee_override_response(emp_id, month)
    return jsonify(payload), status


@admin_bp.route("/employee-attendance-overrides/record", methods=["DELETE"])
@admin_required
def delete_employee_attendance_override_record():
    emp_id = request.args.get("emp_id", type=int) or 0
    month = _validate_month(request.args.get("month"))
    if not emp_id or not month:
        return jsonify({"error": "请选择员工和有效月份"}), 400
    account_set = _account_set_for_month(month)
    locked_error = _ensure_account_set_unlocked(account_set, "清空员工考勤修正")
    if locked_error:
        return locked_error
    row = EmployeeAttendanceOverride.query.filter_by(emp_id=emp_id, month=month).first()
    if row:
        before_values = _override_state_from_row(row, _EMPLOYEE_OVERRIDE_FIELDS)
        after_values = _override_state_from_row(None, _EMPLOYEE_OVERRIDE_FIELDS)
        _record_override_history("employee", emp_id, month, "clear", before_values, after_values)
        db.session.delete(row)
        db.session.commit()
    payload, status = _employee_override_response(emp_id, month)
    return jsonify(payload), status


@admin_bp.route("/employee-attendance-overrides/history", methods=["GET"])
@admin_required
def employee_attendance_override_history():
    month = _validate_month(request.args.get("month"))
    if not month:
        return jsonify({"error": "请选择有效月份"}), 400
    return jsonify({"rows": _history_rows_for_month("employee", month)})


@admin_bp.route("/employee-attendance-overrides/template", methods=["GET"])
@admin_required
def download_employee_attendance_override_template():
    month = _validate_month(request.args.get("month")) or datetime.now().strftime("%Y-%m")
    return _override_workbook_response(_build_employee_override_export_workbook(month, include_real_rows=False), "员工考勤修正导入示例.xlsx")


@admin_bp.route("/employee-attendance-overrides/export", methods=["GET"])
@admin_required
def export_employee_attendance_overrides():
    month = _validate_month(request.args.get("month"))
    if not month:
        return jsonify({"error": "请选择有效月份"}), 400
    return _override_workbook_response(_build_employee_override_export_workbook(month, include_real_rows=True), f"员工考勤修正导出_{month}.xlsx")


@admin_bp.route("/employee-attendance-overrides/import", methods=["POST"])
@admin_required
def import_employee_attendance_overrides():
    month = _validate_month(request.form.get("month"))
    if not month:
        return jsonify({"error": "请选择有效月份"}), 400
    account_set = _account_set_for_month(month)
    locked_error = _ensure_account_set_unlocked(account_set, "导入员工考勤修正")
    if locked_error:
        return locked_error
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "请选择导入文件"}), 400
    wb = openpyxl.load_workbook(file, data_only=True, read_only=True)
    ws = wb[wb.sheetnames[0]]
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    if not rows:
        return jsonify({"error": "empty file"}), 400
    header_idx, header_map = _parse_header_row(rows, ["月份", "工号", "姓名", "考勤天数", "备注"])
    required = ["月份", "工号", "姓名", "考勤天数", "工时", "半勤天数", "迟到早退", "备注"]
    missing = [key for key in required if key not in header_map]
    if missing:
        return jsonify({"error": f"缺少列：{', '.join(missing)}"}), 400
    success_count = skipped_count = failed_count = changed_count = 0
    errors: list[str] = []
    for row_index, raw in enumerate(rows[header_idx + 1 :], start=header_idx + 2):
        row_month = str(raw[header_map["月份"]]).strip() if header_map["月份"] < len(raw) and raw[header_map["月份"]] is not None else ""
        emp_no = str(raw[header_map["工号"]]).strip() if header_map["工号"] < len(raw) and raw[header_map["工号"]] is not None else ""
        if not row_month and not emp_no:
            skipped_count += 1
            continue
        if row_month != month:
            failed_count += 1
            errors.append(f"第 {row_index} 行：月份 {row_month or '空'} 与当前月份 {month} 不一致")
            continue
        employee = Employee.query.filter_by(emp_no=emp_no).first()
        if not employee or employee.is_manager:
            failed_count += 1
            errors.append(f"第 {row_index} 行：工号 {emp_no or '空'} 未找到普通员工")
            continue
        updates: dict[str, object] = {}
        numeric_error = False
        for key in ("attendance_days", "work_hours"):
            label = _EMPLOYEE_OVERRIDE_LABELS[key]
            value = raw[header_map[label]] if header_map[label] < len(raw) else None
            parsed, error = _nullable_float({key: value}, key)
            if error:
                failed_count += 1
                errors.append(f"第 {row_index} 行：{error}")
                numeric_error = True
                break
            if value not in (None, ""):
                updates[key] = parsed
        if numeric_error:
            continue
        for key in ("half_days", "late_early_minutes"):
            label = _EMPLOYEE_OVERRIDE_LABELS[key]
            value = raw[header_map[label]] if header_map[label] < len(raw) else None
            parsed, error = _nullable_int({key: value}, key)
            if error:
                failed_count += 1
                errors.append(f"第 {row_index} 行：{error}")
                numeric_error = True
                break
            if value not in (None, ""):
                updates[key] = parsed
        if numeric_error:
            continue
        remark_value = raw[header_map["备注"]] if header_map["备注"] < len(raw) else None
        if remark_value not in (None, ""):
            updates["remark"] = str(remark_value).strip()
        row_obj = EmployeeAttendanceOverride.query.filter_by(emp_id=employee.id, month=month).first()
        changed = _apply_employee_override_updates(row_obj, employee.id, month, updates, "import", file.filename)
        if changed:
            success_count += 1
            changed_count += 1
        else:
            skipped_count += 1
    db.session.commit()
    return jsonify(_import_summary(success_count, skipped_count, failed_count, changed_count, errors))


@admin_bp.route("/")
@admin_required
def admin_root():
    return redirect("/admin/dashboard")
