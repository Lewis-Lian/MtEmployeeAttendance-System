from __future__ import annotations

from flask import g, jsonify, render_template, request

from routes.auth import admin_required


def register_admin_account_routes(admin_bp) -> None:
    from . import admin as admin_module

    def _manager_self_query_permissions() -> dict[str, bool]:
        permissions = {key: False for key in admin_module.ALL_PAGE_PERMISSION_KEYS}
        for key in admin_module.MANAGER_PAGE_PERMISSION_KEYS:
            permissions[key] = True
        return permissions

    def _batch_target_users(raw_ids) -> list:
        user_ids = [int(x) for x in (raw_ids or []) if str(x).isdigit()]
        if not user_ids:
            return []
        users = admin_module.User.query.filter(admin_module.User.id.in_(user_ids)).order_by(admin_module.User.id.asc()).all()
        return users

    @admin_bp.route("/accounts")
    @admin_required
    def accounts_page():
        return render_template(
            "admin/accounts.html",
            current_user_id=g.current_user.id,
            manager_page_permissions=[
                {"key": key, "label": admin_module.PAGE_PERMISSION_LABELS[key]}
                for key in admin_module.MANAGER_PAGE_PERMISSION_KEYS
            ],
            employee_page_permissions=[
                {"key": key, "label": admin_module.PAGE_PERMISSION_LABELS[key]}
                for key in admin_module.EMPLOYEE_PAGE_PERMISSION_KEYS
            ],
        )

    @admin_bp.route("/users/readonly", methods=["POST"])
    @admin_required
    def create_readonly_user():
        data = request.json or {}
        username = (data.get("username") or "").strip()
        password = (data.get("password") or "").strip()
        emp_ids = data.get("emp_ids") or []
        dept_ids = data.get("dept_ids") or []
        normalized_emp_ids = [int(x) for x in emp_ids if str(x).isdigit()]
        normalized_dept_ids = [int(x) for x in dept_ids if str(x).isdigit()]

        if not username or not password:
            return jsonify({"error": "username and password are required"}), 400
        if not normalized_emp_ids:
            return jsonify({"error": "请至少关联一名员工，工号和姓名为必填项"}), 400
        if admin_module.User.query.filter_by(username=username).first():
            return jsonify({"error": "username already exists"}), 400

        user = admin_module.User(username=username, role="readonly")
        user.set_password(password)
        user.page_permissions = admin_module._parse_page_permissions(data, "readonly")
        admin_module.db.session.add(user)
        admin_module.db.session.flush()
        admin_module._bind_user_profile_identity(user, normalized_emp_ids)

        for emp_id in normalized_emp_ids:
            if admin_module.db.session.get(admin_module.Employee, emp_id):
                admin_module.db.session.add(
                    admin_module.UserEmployeeAssignment(user_id=user.id, emp_id=emp_id)
                )
        for dept_id in normalized_dept_ids:
            if admin_module.db.session.get(admin_module.Department, dept_id):
                admin_module.db.session.add(
                    admin_module.UserDepartmentAssignment(user_id=user.id, dept_id=dept_id)
                )

        admin_module.db.session.commit()
        return jsonify({"status": "ok", "user_id": user.id})

    @admin_bp.route("/users", methods=["GET"])
    @admin_required
    def users_list():
        users = admin_module.User.query.order_by(admin_module.User.id.desc()).all()
        return jsonify([admin_module._serialize_user(user) for user in users])

    @admin_bp.route("/users", methods=["POST"])
    @admin_required
    def create_user():
        data = request.json or {}
        username = (data.get("username") or "").strip()
        password = (data.get("password") or "").strip()
        role = (data.get("role") or "readonly").strip() or "readonly"
        emp_ids = data.get("emp_ids") or []
        dept_ids = data.get("dept_ids") or []
        normalized_emp_ids = [int(x) for x in emp_ids if str(x).isdigit()]
        normalized_dept_ids = [int(x) for x in dept_ids if str(x).isdigit()]

        if role not in {"admin", "readonly"}:
            return jsonify({"error": "invalid role"}), 400
        if not username or not password:
            return jsonify({"error": "username and password are required"}), 400
        if not normalized_emp_ids:
            return jsonify({"error": "请至少关联一名员工，工号和姓名为必填项"}), 400
        if admin_module.User.query.filter_by(username=username).first():
            return jsonify({"error": "username already exists"}), 400

        user = admin_module.User(username=username, role=role)
        user.set_password(password)
        user.page_permissions = admin_module._parse_page_permissions(data, role)
        admin_module.db.session.add(user)
        admin_module.db.session.flush()
        admin_module._bind_user_profile_identity(user, normalized_emp_ids)
        admin_module._sync_user_assignments(user, normalized_emp_ids)
        admin_module._sync_user_department_assignments(user, normalized_dept_ids)
        admin_module.db.session.commit()
        return jsonify({"status": "ok", "user": admin_module._serialize_user(user)})

    @admin_bp.route("/users/manager-batch", methods=["POST"])
    @admin_required
    def create_manager_users_batch():
        created_users: list[dict] = []
        skipped_users: list[dict[str, str]] = []
        manager_permissions = _manager_self_query_permissions()

        managers = (
            admin_module.Employee.query.filter(admin_module.Employee.is_manager.is_(True))
            .order_by(admin_module.Employee.emp_no.asc())
            .all()
        )

        for employee in managers:
            username = (employee.emp_no or "").strip()
            if not username:
                skipped_users.append({"emp_no": "", "name": employee.name, "reason": "工号为空"})
                continue

            if admin_module.User.query.filter_by(username=username).first():
                skipped_users.append({"emp_no": username, "name": employee.name, "reason": "账号已存在"})
                continue

            existing_assignment = admin_module.UserEmployeeAssignment.query.filter_by(emp_id=employee.id).first()
            if existing_assignment:
                skipped_users.append({"emp_no": username, "name": employee.name, "reason": "已关联其他账号"})
                continue

            user = admin_module.User(username=username, role="readonly")
            user.set_password("mt@123")
            user.page_permissions = manager_permissions.copy()
            admin_module.db.session.add(user)
            admin_module.db.session.flush()
            admin_module._bind_user_profile_identity(user, [employee.id])
            admin_module._sync_user_assignments(user, [employee.id])
            created_users.append(admin_module._serialize_user(user))

        admin_module.db.session.commit()
        return jsonify(
            {
                "status": "ok",
                "created_count": len(created_users),
                "skipped_count": len(skipped_users),
                "created_users": created_users,
                "skipped_users": skipped_users,
            }
        )

    @admin_bp.route("/users/batch", methods=["POST"])
    @admin_required
    def batch_update_users():
        data = request.json or {}
        action = (data.get("action") or "").strip()
        users = _batch_target_users(data.get("user_ids"))

        if not users:
            return jsonify({"error": "请选择账号"}), 400

        if action == "reset_password":
            for user in users:
                user.set_password("mt@123")
            admin_module.db.session.commit()
            return jsonify({"status": "ok", "updated_count": len(users)})

        if action == "update_role":
            role = (data.get("role") or "").strip()
            if role not in {"admin", "readonly"}:
                return jsonify({"error": "invalid role"}), 400

            if role != "admin":
                if any(user.id == g.current_user.id for user in users):
                    return jsonify({"error": "cannot downgrade current admin"}), 400
                current_admin_count = admin_module.User.query.filter_by(role="admin").count()
                target_admin_count = sum(1 for user in users if user.role == "admin")
                if current_admin_count - target_admin_count <= 0:
                    return jsonify({"error": "cannot downgrade last admin"}), 400

            for user in users:
                user.role = role
                user.page_permissions = admin_module._parse_page_permissions(data, role, existing_user=user)
            admin_module.db.session.commit()
            return jsonify({"status": "ok", "updated_count": len(users)})

        if action == "update_permissions":
            for user in users:
                user.page_permissions = admin_module._parse_page_permissions(data, user.role, existing_user=user)
            admin_module.db.session.commit()
            return jsonify({"status": "ok", "updated_count": len(users)})

        if action == "delete":
            if any(user.id == g.current_user.id for user in users):
                return jsonify({"error": "cannot delete current user"}), 400
            current_admin_count = admin_module.User.query.filter_by(role="admin").count()
            target_admin_count = sum(1 for user in users if user.role == "admin")
            if current_admin_count - target_admin_count <= 0:
                return jsonify({"error": "cannot delete last admin"}), 400

            for user in users:
                admin_module.db.session.delete(user)
            admin_module.db.session.commit()
            return jsonify({"status": "ok", "updated_count": len(users)})

        return jsonify({"error": "invalid action"}), 400

    @admin_bp.route("/users/<int:user_id>", methods=["PUT"])
    @admin_required
    def update_user(user_id: int):
        data = request.json or {}
        role = (data.get("role") or "").strip()
        profile_emp_no = (data.get("profile_emp_no") or "").strip()
        profile_name = (data.get("profile_name") or "").strip()
        profile_dept_id = data.get("profile_dept_id")
        emp_ids = data.get("emp_ids")
        dept_ids = data.get("dept_ids")
        user = admin_module._require_model(admin_module.User, user_id)
        next_role = role or user.role

        if user.id == g.current_user.id and role and role != "admin":
            return jsonify({"error": "cannot downgrade current admin"}), 400

        if role:
            if role not in {"admin", "readonly"}:
                return jsonify({"error": "invalid role"}), 400
            user.role = role

        if "profile_emp_no" in data:
            if not profile_emp_no:
                return jsonify({"error": "工号不能为空"}), 400
            user.profile_emp_no = profile_emp_no
        if "profile_name" in data:
            if not profile_name:
                return jsonify({"error": "姓名不能为空"}), 400
            user.profile_name = profile_name
        if "profile_dept_id" in data:
            if not str(profile_dept_id).isdigit():
                return jsonify({"error": "部门信息不能为空"}), 400
            department = admin_module.db.session.get(admin_module.Department, int(profile_dept_id))
            if not department:
                return jsonify({"error": "部门不存在"}), 400
            user.profile_dept_id = department.id

        user.page_permissions = admin_module._parse_page_permissions(data, next_role, existing_user=user)

        if emp_ids is not None:
            normalized_emp_ids = [int(x) for x in emp_ids if str(x).isdigit()]
            if not normalized_emp_ids:
                return jsonify({"error": "请至少关联一名员工，工号和姓名为必填项"}), 400
            admin_module._sync_user_assignments(user, normalized_emp_ids)
        if dept_ids is not None:
            admin_module._sync_user_department_assignments(user, [int(x) for x in dept_ids if str(x).isdigit()])

        admin_module.db.session.commit()
        return jsonify({"status": "ok", "user": admin_module._serialize_user(user)})

    @admin_bp.route("/users/<int:user_id>/password", methods=["PUT"])
    @admin_required
    def reset_user_password(user_id: int):
        data = request.json or {}
        password = (data.get("password") or "").strip()
        if not password:
            return jsonify({"error": "password is required"}), 400

        user = admin_module._require_model(admin_module.User, user_id)
        user.set_password(password)
        admin_module.db.session.commit()
        return jsonify({"status": "ok"})

    @admin_bp.route("/users/<int:user_id>", methods=["DELETE"])
    @admin_required
    def delete_user(user_id: int):
        user = admin_module._require_model(admin_module.User, user_id)
        if user.id == g.current_user.id:
            return jsonify({"error": "cannot delete current user"}), 400

        admin_count = admin_module.User.query.filter_by(role="admin").count()
        if user.role == "admin" and admin_count <= 1:
            return jsonify({"error": "cannot delete last admin"}), 400

        admin_module.db.session.delete(user)
        admin_module.db.session.commit()
        return jsonify({"status": "ok"})
