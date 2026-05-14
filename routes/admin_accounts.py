from __future__ import annotations

from flask import g, jsonify, render_template, request

from routes.auth import admin_required


def register_admin_account_routes(admin_bp) -> None:
    from . import admin as admin_module

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

        if not username or not password:
            return jsonify({"error": "username and password are required"}), 400
        if admin_module.User.query.filter_by(username=username).first():
            return jsonify({"error": "username already exists"}), 400

        user = admin_module.User(username=username, role="readonly")
        user.set_password(password)
        user.page_permissions = admin_module._parse_page_permissions(data, "readonly")
        admin_module.db.session.add(user)
        admin_module.db.session.flush()

        for emp_id in emp_ids:
            if admin_module.Employee.query.get(emp_id):
                admin_module.db.session.add(
                    admin_module.UserEmployeeAssignment(user_id=user.id, emp_id=emp_id)
                )
        for dept_id in dept_ids:
            if admin_module.Department.query.get(dept_id):
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

        if role not in {"admin", "readonly"}:
            return jsonify({"error": "invalid role"}), 400
        if not username or not password:
            return jsonify({"error": "username and password are required"}), 400
        if admin_module.User.query.filter_by(username=username).first():
            return jsonify({"error": "username already exists"}), 400

        user = admin_module.User(username=username, role=role)
        user.set_password(password)
        user.page_permissions = admin_module._parse_page_permissions(data, role)
        admin_module.db.session.add(user)
        admin_module.db.session.flush()
        admin_module._sync_user_assignments(user, [int(x) for x in emp_ids if str(x).isdigit()])
        admin_module._sync_user_department_assignments(user, [int(x) for x in dept_ids if str(x).isdigit()])
        admin_module.db.session.commit()
        return jsonify({"status": "ok", "user": admin_module._serialize_user(user)})

    @admin_bp.route("/users/<int:user_id>", methods=["PUT"])
    @admin_required
    def update_user(user_id: int):
        data = request.json or {}
        role = (data.get("role") or "").strip()
        emp_ids = data.get("emp_ids")
        dept_ids = data.get("dept_ids")
        user = admin_module.User.query.get_or_404(user_id)
        next_role = role or user.role

        if user.id == g.current_user.id and role and role != "admin":
            return jsonify({"error": "cannot downgrade current admin"}), 400

        if role:
            if role not in {"admin", "readonly"}:
                return jsonify({"error": "invalid role"}), 400
            user.role = role

        user.page_permissions = admin_module._parse_page_permissions(data, next_role, existing_user=user)

        if emp_ids is not None:
            admin_module._sync_user_assignments(user, [int(x) for x in emp_ids if str(x).isdigit()])
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

        user = admin_module.User.query.get_or_404(user_id)
        user.set_password(password)
        admin_module.db.session.commit()
        return jsonify({"status": "ok"})

    @admin_bp.route("/users/<int:user_id>", methods=["DELETE"])
    @admin_required
    def delete_user(user_id: int):
        user = admin_module.User.query.get_or_404(user_id)
        if user.id == g.current_user.id:
            return jsonify({"error": "cannot delete current user"}), 400

        admin_count = admin_module.User.query.filter_by(role="admin").count()
        if user.role == "admin" and admin_count <= 1:
            return jsonify({"error": "cannot delete last admin"}), 400

        admin_module.db.session.delete(user)
        admin_module.db.session.commit()
        return jsonify({"status": "ok"})
