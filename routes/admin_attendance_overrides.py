from __future__ import annotations

from datetime import datetime

import openpyxl
from flask import jsonify, render_template, request

from routes.auth import admin_required


def register_admin_attendance_override_routes(admin_bp) -> None:
    from . import admin as admin_module

    @admin_bp.route("/manager-attendance-overrides")
    @admin_required
    def manager_attendance_overrides_page():
        employees = admin_module._manager_scope_employees()
        return render_template("admin/manager_attendance_overrides.html", employees=employees)

    @admin_bp.route("/manager-attendance-overrides/record", methods=["GET"])
    @admin_required
    def manager_attendance_override_record():
        emp_id = request.args.get("emp_id", type=int) or 0
        month = admin_module._validate_month(request.args.get("month"))
        if not emp_id or not month:
            return jsonify({"error": "请选择管理人员和有效月份"}), 400
        payload, status = admin_module._manager_attendance_response(emp_id, month)
        return jsonify(payload), status

    @admin_bp.route("/manager-attendance-overrides/record", methods=["PUT"])
    @admin_required
    def save_manager_attendance_override_record():
        data = request.json or {}
        emp_id = int(data.get("emp_id") or 0)
        month = admin_module._validate_month(data.get("month"))
        if not emp_id or not month:
            return jsonify({"error": "请选择管理人员和有效月份"}), 400
        account_set = admin_module._account_set_for_month(month)
        locked_error = admin_module._ensure_account_set_unlocked(account_set, "保存管理人员考勤修正")
        if locked_error:
            return locked_error
        employee = admin_module.Employee.query.get(emp_id)
        if not employee or not employee.is_manager:
            return jsonify({"error": "employee is not manager"}), 400

        values: dict[str, float | int | None] = {}
        for key in (
            "attendance_days",
            "injury_days",
            "business_trip_days",
            "marriage_days",
            "funeral_days",
        ):
            value, error = admin_module._nullable_float(data, key)
            if error:
                return jsonify({"error": error}), 400
            values[key] = value
        late_value, error = admin_module._nullable_int(data, "late_early_minutes")
        if error:
            return jsonify({"error": error}), 400
        values["late_early_minutes"] = late_value

        row = admin_module.ManagerAttendanceOverride.query.filter_by(emp_id=emp_id, month=month).first()
        before_values = admin_module._override_state_from_row(
            row, admin_module._MANAGER_ATTENDANCE_OVERRIDE_FIELDS
        )
        after_values = dict(values)
        after_values["remark"] = (data.get("remark") or "").strip()
        if admin_module._has_override_state_changes(before_values, after_values):
            if not row:
                row = admin_module.ManagerAttendanceOverride(emp_id=emp_id, month=month)
                admin_module.db.session.add(row)
            for key, value in values.items():
                setattr(row, key, value)
            row.remark = after_values["remark"]
            row.updated_by = admin_module.g.current_user.id
            admin_module._record_override_history(
                "manager", emp_id, month, "manual_save", before_values, after_values
            )
            admin_module.db.session.commit()

        payload, status = admin_module._manager_attendance_response(emp_id, month)
        return jsonify(payload), status

    @admin_bp.route("/manager-attendance-overrides/record", methods=["DELETE"])
    @admin_required
    def delete_manager_attendance_override_record():
        emp_id = request.args.get("emp_id", type=int) or 0
        month = admin_module._validate_month(request.args.get("month"))
        if not emp_id or not month:
            return jsonify({"error": "请选择管理人员和有效月份"}), 400
        account_set = admin_module._account_set_for_month(month)
        locked_error = admin_module._ensure_account_set_unlocked(account_set, "清空管理人员考勤修正")
        if locked_error:
            return locked_error
        row = admin_module.ManagerAttendanceOverride.query.filter_by(emp_id=emp_id, month=month).first()
        if row:
            before_values = admin_module._override_state_from_row(
                row, admin_module._MANAGER_ATTENDANCE_OVERRIDE_FIELDS
            )
            after_values = admin_module._override_state_from_row(
                None, admin_module._MANAGER_ATTENDANCE_OVERRIDE_FIELDS
            )
            admin_module._record_override_history("manager", emp_id, month, "clear", before_values, after_values)
            admin_module.db.session.delete(row)
            admin_module.db.session.commit()
        payload, status = admin_module._manager_attendance_response(emp_id, month)
        return jsonify(payload), status

    @admin_bp.route("/manager-attendance-overrides/history", methods=["GET"])
    @admin_required
    def manager_attendance_override_history():
        month = admin_module._validate_month(request.args.get("month"))
        if not month:
            return jsonify({"error": "请选择有效月份"}), 400
        return jsonify({"rows": admin_module._history_rows_for_month("manager", month)})

    @admin_bp.route("/manager-attendance-overrides/template", methods=["GET"])
    @admin_required
    def download_manager_attendance_override_template():
        month = admin_module._validate_month(request.args.get("month")) or datetime.now().strftime("%Y-%m")
        return admin_module._override_workbook_response(
            admin_module._build_manager_override_export_workbook(month, include_real_rows=False),
            "管理人员考勤修正导入示例.xlsx",
        )

    @admin_bp.route("/manager-attendance-overrides/export", methods=["GET"])
    @admin_required
    def export_manager_attendance_overrides():
        month = admin_module._validate_month(request.args.get("month"))
        if not month:
            return jsonify({"error": "请选择有效月份"}), 400
        return admin_module._override_workbook_response(
            admin_module._build_manager_override_export_workbook(month, include_real_rows=True),
            f"管理人员考勤修正导出_{month}.xlsx",
        )

    @admin_bp.route("/manager-attendance-overrides/import", methods=["POST"])
    @admin_required
    def import_manager_attendance_overrides():
        month = admin_module._validate_month(request.form.get("month"))
        if not month:
            return jsonify({"error": "请选择有效月份"}), 400
        account_set = admin_module._account_set_for_month(month)
        locked_error = admin_module._ensure_account_set_unlocked(account_set, "导入管理人员考勤修正")
        if locked_error:
            return locked_error
        file = request.files.get("file")
        if not file or not file.filename:
            return jsonify({"error": "请选择导入文件"}), 400
        wb = openpyxl.load_workbook(file, data_only=True, read_only=True)
        ws = wb[wb.sheetnames[0]]
        rows = [list(row) for row in ws.iter_rows(values_only=True)]
        if not rows:
            return jsonify({"error": "empty file"}), 400
        header_idx, header_map = admin_module._parse_header_row(rows, ["月份", "工号", "姓名", "出勤天数", "备注"])
        required = ["月份", "工号", "姓名", "出勤天数", "工伤", "出差", "婚假", "丧假", "迟到早退", "备注"]
        missing = [key for key in required if key not in header_map]
        if missing:
            return jsonify({"error": f"缺少列：{', '.join(missing)}"}), 400
        success_count = skipped_count = failed_count = changed_count = 0
        errors: list[str] = []
        for row_index, raw in enumerate(rows[header_idx + 1 :], start=header_idx + 2):
            row_month = (
                str(raw[header_map["月份"]]).strip()
                if header_map["月份"] < len(raw) and raw[header_map["月份"]] is not None
                else ""
            )
            emp_no = (
                str(raw[header_map["工号"]]).strip()
                if header_map["工号"] < len(raw) and raw[header_map["工号"]] is not None
                else ""
            )
            if not row_month and not emp_no:
                skipped_count += 1
                continue
            if row_month != month:
                failed_count += 1
                errors.append(f"第 {row_index} 行：月份 {row_month or '空'} 与当前月份 {month} 不一致")
                continue
            employee = admin_module.Employee.query.filter_by(emp_no=emp_no).first()
            if not employee or not employee.is_manager:
                failed_count += 1
                errors.append(f"第 {row_index} 行：工号 {emp_no or '空'} 未找到管理人员")
                continue
            updates: dict[str, object] = {}
            for key in (
                "attendance_days",
                "injury_days",
                "business_trip_days",
                "marriage_days",
                "funeral_days",
            ):
                label = admin_module._MANAGER_OVERRIDE_LABELS[key]
                value = raw[header_map[label]] if header_map[label] < len(raw) else None
                parsed, error = admin_module._nullable_float({key: value}, key)
                if error:
                    failed_count += 1
                    errors.append(f"第 {row_index} 行：{error}")
                    updates = {}
                    break
                if value not in (None, ""):
                    updates[key] = parsed
            if not updates and failed_count and errors and errors[-1].startswith(f"第 {row_index} 行"):
                continue
            late_value = raw[header_map["迟到早退"]] if header_map["迟到早退"] < len(raw) else None
            parsed_late, error = admin_module._nullable_int(
                {"late_early_minutes": late_value}, "late_early_minutes"
            )
            if error:
                failed_count += 1
                errors.append(f"第 {row_index} 行：{error}")
                continue
            if late_value not in (None, ""):
                updates["late_early_minutes"] = parsed_late
            remark_value = raw[header_map["备注"]] if header_map["备注"] < len(raw) else None
            if remark_value not in (None, ""):
                updates["remark"] = str(remark_value).strip()
            row_obj = admin_module.ManagerAttendanceOverride.query.filter_by(
                emp_id=employee.id, month=month
            ).first()
            changed = admin_module._apply_manager_override_updates(
                row_obj, employee.id, month, updates, "import", file.filename
            )
            if changed:
                success_count += 1
                changed_count += 1
            else:
                skipped_count += 1
        admin_module.db.session.commit()
        return jsonify(
            admin_module._import_summary(
                success_count, skipped_count, failed_count, changed_count, errors
            )
        )

    @admin_bp.route("/employee-attendance-overrides")
    @admin_required
    def employee_attendance_overrides_page():
        employees = (
            admin_module.Employee.query.filter_by(is_manager=False)
            .order_by(
                admin_module.Employee.dept_id.asc(),
                admin_module.Employee.emp_no.asc(),
                admin_module.Employee.name.asc(),
            )
            .all()
        )
        return render_template("admin/employee_attendance_overrides.html", employees=employees)

    @admin_bp.route("/employee-attendance-overrides/record", methods=["GET"])
    @admin_required
    def employee_attendance_override_record():
        emp_id = request.args.get("emp_id", type=int) or 0
        month = admin_module._validate_month(request.args.get("month"))
        if not emp_id or not month:
            return jsonify({"error": "请选择员工和有效月份"}), 400
        payload, status = admin_module._employee_override_response(emp_id, month)
        return jsonify(payload), status

    @admin_bp.route("/employee-attendance-overrides/record", methods=["PUT"])
    @admin_required
    def save_employee_attendance_override_record():
        data = request.json or {}
        emp_id = int(data.get("emp_id") or 0)
        month = admin_module._validate_month(data.get("month"))
        if not emp_id or not month:
            return jsonify({"error": "请选择员工和有效月份"}), 400
        account_set = admin_module._account_set_for_month(month)
        locked_error = admin_module._ensure_account_set_unlocked(account_set, "保存员工考勤修正")
        if locked_error:
            return locked_error
        employee = admin_module.Employee.query.get(emp_id)
        if not employee or employee.is_manager:
            return jsonify({"error": "员工不存在或是管理人员"}), 400

        values: dict[str, float | int | None] = {}
        for key in ("attendance_days", "work_hours"):
            value, error = admin_module._nullable_float(data, key)
            if error:
                return jsonify({"error": error}), 400
            values[key] = value
        for key in ("half_days", "late_early_minutes"):
            value, error = admin_module._nullable_int(data, key)
            if error:
                return jsonify({"error": error}), 400
            values[key] = value

        row = admin_module.EmployeeAttendanceOverride.query.filter_by(emp_id=emp_id, month=month).first()
        updates = dict(values)
        updates["remark"] = (data.get("remark") or "").strip()
        if admin_module._apply_employee_override_updates(row, emp_id, month, updates, "manual_save"):
            admin_module.db.session.commit()

        payload, status = admin_module._employee_override_response(emp_id, month)
        return jsonify(payload), status

    @admin_bp.route("/employee-attendance-overrides/record", methods=["DELETE"])
    @admin_required
    def delete_employee_attendance_override_record():
        emp_id = request.args.get("emp_id", type=int) or 0
        month = admin_module._validate_month(request.args.get("month"))
        if not emp_id or not month:
            return jsonify({"error": "请选择员工和有效月份"}), 400
        account_set = admin_module._account_set_for_month(month)
        locked_error = admin_module._ensure_account_set_unlocked(account_set, "清空员工考勤修正")
        if locked_error:
            return locked_error
        row = admin_module.EmployeeAttendanceOverride.query.filter_by(emp_id=emp_id, month=month).first()
        if row:
            before_values = admin_module._override_state_from_row(row, admin_module._EMPLOYEE_OVERRIDE_FIELDS)
            after_values = admin_module._override_state_from_row(None, admin_module._EMPLOYEE_OVERRIDE_FIELDS)
            admin_module._record_override_history("employee", emp_id, month, "clear", before_values, after_values)
            admin_module.db.session.delete(row)
            admin_module.db.session.commit()
        payload, status = admin_module._employee_override_response(emp_id, month)
        return jsonify(payload), status

    @admin_bp.route("/employee-attendance-overrides/history", methods=["GET"])
    @admin_required
    def employee_attendance_override_history():
        month = admin_module._validate_month(request.args.get("month"))
        if not month:
            return jsonify({"error": "请选择有效月份"}), 400
        return jsonify({"rows": admin_module._history_rows_for_month("employee", month)})

    @admin_bp.route("/employee-attendance-overrides/template", methods=["GET"])
    @admin_required
    def download_employee_attendance_override_template():
        month = admin_module._validate_month(request.args.get("month")) or datetime.now().strftime("%Y-%m")
        return admin_module._override_workbook_response(
            admin_module._build_employee_override_export_workbook(month, include_real_rows=False),
            "员工考勤修正导入示例.xlsx",
        )

    @admin_bp.route("/employee-attendance-overrides/export", methods=["GET"])
    @admin_required
    def export_employee_attendance_overrides():
        month = admin_module._validate_month(request.args.get("month"))
        if not month:
            return jsonify({"error": "请选择有效月份"}), 400
        return admin_module._override_workbook_response(
            admin_module._build_employee_override_export_workbook(month, include_real_rows=True),
            f"员工考勤修正导出_{month}.xlsx",
        )

    @admin_bp.route("/employee-attendance-overrides/import", methods=["POST"])
    @admin_required
    def import_employee_attendance_overrides():
        month = admin_module._validate_month(request.form.get("month"))
        if not month:
            return jsonify({"error": "请选择有效月份"}), 400
        account_set = admin_module._account_set_for_month(month)
        locked_error = admin_module._ensure_account_set_unlocked(account_set, "导入员工考勤修正")
        if locked_error:
            return locked_error
        file = request.files.get("file")
        if not file or not file.filename:
            return jsonify({"error": "请选择导入文件"}), 400
        wb = openpyxl.load_workbook(file, data_only=True, read_only=True)
        ws = wb[wb.sheetnames[0]]
        rows = [list(row) for row in ws.iter_rows(values_only=True)]
        if not rows:
            return jsonify({"error": "empty file"}), 400
        header_idx, header_map = admin_module._parse_header_row(rows, ["月份", "工号", "姓名", "考勤天数", "备注"])
        required = ["月份", "工号", "姓名", "考勤天数", "工时", "半勤天数", "迟到早退", "备注"]
        missing = [key for key in required if key not in header_map]
        if missing:
            return jsonify({"error": f"缺少列：{', '.join(missing)}"}), 400
        success_count = skipped_count = failed_count = changed_count = 0
        errors: list[str] = []
        for row_index, raw in enumerate(rows[header_idx + 1 :], start=header_idx + 2):
            row_month = (
                str(raw[header_map["月份"]]).strip()
                if header_map["月份"] < len(raw) and raw[header_map["月份"]] is not None
                else ""
            )
            emp_no = (
                str(raw[header_map["工号"]]).strip()
                if header_map["工号"] < len(raw) and raw[header_map["工号"]] is not None
                else ""
            )
            if not row_month and not emp_no:
                skipped_count += 1
                continue
            if row_month != month:
                failed_count += 1
                errors.append(f"第 {row_index} 行：月份 {row_month or '空'} 与当前月份 {month} 不一致")
                continue
            employee = admin_module.Employee.query.filter_by(emp_no=emp_no).first()
            if not employee or employee.is_manager:
                failed_count += 1
                errors.append(f"第 {row_index} 行：工号 {emp_no or '空'} 未找到普通员工")
                continue
            updates: dict[str, object] = {}
            numeric_error = False
            for key in ("attendance_days", "work_hours"):
                label = admin_module._EMPLOYEE_OVERRIDE_LABELS[key]
                value = raw[header_map[label]] if header_map[label] < len(raw) else None
                parsed, error = admin_module._nullable_float({key: value}, key)
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
                label = admin_module._EMPLOYEE_OVERRIDE_LABELS[key]
                value = raw[header_map[label]] if header_map[label] < len(raw) else None
                parsed, error = admin_module._nullable_int({key: value}, key)
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
            row_obj = admin_module.EmployeeAttendanceOverride.query.filter_by(
                emp_id=employee.id, month=month
            ).first()
            changed = admin_module._apply_employee_override_updates(
                row_obj, employee.id, month, updates, "import", file.filename
            )
            if changed:
                success_count += 1
                changed_count += 1
            else:
                skipped_count += 1
        admin_module.db.session.commit()
        return jsonify(
            admin_module._import_summary(
                success_count, skipped_count, failed_count, changed_count, errors
            )
        )
