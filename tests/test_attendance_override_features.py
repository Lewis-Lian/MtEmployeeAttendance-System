import io
import os
import tempfile
import unittest
import urllib.parse
from types import SimpleNamespace

import openpyxl
from flask import Flask, g, render_template

from models import db
from models.account_set import AccountSet
from models.department import Department
from models.employee import Employee
from models.user import User
from routes import register_routes
from utils.app_navigation import module_by_slug, nav_context, visible_modules


class AttendanceOverrideFeatureTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmpdir.name, "test.db")
        self.upload_dir = os.path.join(self.tmpdir.name, "uploads")

        project_root = os.path.dirname(os.path.dirname(__file__))
        app = Flask(
            __name__,
            template_folder=os.path.join(project_root, "templates"),
            static_folder=os.path.join(project_root, "static"),
        )
        app.config.update(
            TESTING=True,
            SECRET_KEY="test-secret",
            SQLALCHEMY_DATABASE_URI=f"sqlite:///{self.db_path}",
            SQLALCHEMY_TRACK_MODIFICATIONS=False,
            JWT_EXPIRES_HOURS=12,
            JWT_EXPIRES_DELTA=__import__("datetime").timedelta(hours=12),
            UPLOAD_FOLDER=self.upload_dir,
        )
        os.makedirs(self.upload_dir, exist_ok=True)

        db.init_app(app)
        register_routes(app)
        self.app = app

        with self.app.app_context():
            db.create_all()
            admin = User(username="admin", role="admin")
            admin.set_password("admin123")
            dept = Department(dept_no="D001", dept_name="行政部")
            employee = Employee(emp_no="E001", name="员工甲", dept_id=None, is_manager=False)
            manager = Employee(emp_no="M001", name="经理甲", dept_id=None, is_manager=True)
            db.session.add_all([admin, dept])
            db.session.flush()
            employee.dept_id = dept.id
            manager.dept_id = dept.id
            db.session.add_all([employee, manager])
            employee_b = Employee(emp_no="E002", name="员工乙", dept_id=dept.id, is_manager=False)
            db.session.add(employee_b)
            db.session.add(AccountSet(month="2026-05", name="2026-05", is_active=True, is_locked=False))
            db.session.commit()
            self.employee_id = employee.id
            self.employee_b_id = employee_b.id
            self.manager_id = manager.id

        self.client = self.app.test_client()
        self.client.post("/login", data={"username": "admin", "password": "admin123"})

    def tearDown(self) -> None:
        with self.app.app_context():
            db.session.remove()
            db.drop_all()
        self.tmpdir.cleanup()

    def test_employee_manual_save_creates_history_once(self) -> None:
        payload = {
            "month": "2026-05",
            "emp_id": self.employee_id,
            "attendance_days": "3",
            "work_hours": "21.5",
            "half_days": "1",
            "late_early_minutes": "10",
            "remark": "手工修正",
        }

        first = self.client.put("/admin/employee-attendance-overrides/record", json=payload)
        self.assertEqual(first.status_code, 200)

        history = self.client.get(
            f"/admin/employee-attendance-overrides/history?emp_id={self.employee_id}&month=2026-05"
        )
        self.assertEqual(history.status_code, 200)
        first_rows = history.get_json()["rows"]
        self.assertEqual(len(first_rows), 1)
        self.assertEqual(first_rows[0]["action_type"], "manual_save")

        second = self.client.put("/admin/employee-attendance-overrides/record", json=payload)
        self.assertEqual(second.status_code, 200)
        history_again = self.client.get(
            f"/admin/employee-attendance-overrides/history?emp_id={self.employee_id}&month=2026-05"
        )
        self.assertEqual(len(history_again.get_json()["rows"]), 1)

    def test_employee_clear_creates_clear_history(self) -> None:
        self.client.put(
            "/admin/employee-attendance-overrides/record",
            json={
                "month": "2026-05",
                "emp_id": self.employee_id,
                "attendance_days": "2",
                "remark": "先保存",
            },
        )

        cleared = self.client.delete(
            f"/admin/employee-attendance-overrides/record?emp_id={self.employee_id}&month=2026-05"
        )
        self.assertEqual(cleared.status_code, 200)

        history = self.client.get(
            f"/admin/employee-attendance-overrides/history?emp_id={self.employee_id}&month=2026-05"
        )
        rows = history.get_json()["rows"]
        self.assertEqual(rows[0]["action_type"], "clear")
        self.assertEqual(rows[1]["action_type"], "manual_save")

    def test_employee_import_only_overrides_provided_values(self) -> None:
        self.client.put(
            "/admin/employee-attendance-overrides/record",
            json={
                "month": "2026-05",
                "emp_id": self.employee_id,
                "attendance_days": "2",
                "work_hours": "8",
                "remark": "原值",
            },
        )

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "员工考勤修正"
        ws.append(
            [
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
        )
        ws.append(["2026-05", "E001", "员工甲", "", "", "", "", "5", "", "", "", "导入修正"])
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)

        res = self.client.post(
            "/admin/employee-attendance-overrides/import",
            data={"month": "2026-05", "file": (buf, "employee-import.xlsx")},
            content_type="multipart/form-data",
        )
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["changed_count"], 1)

        record = self.client.get(
            f"/admin/employee-attendance-overrides/record?emp_id={self.employee_id}&month=2026-05"
        ).get_json()
        self.assertEqual(record["override"]["attendance_days"], 5.0)
        self.assertEqual(record["override"]["work_hours"], 8.0)
        self.assertEqual(record["override"]["remark"], "导入修正")

        history = self.client.get(
            f"/admin/employee-attendance-overrides/history?emp_id={self.employee_id}&month=2026-05"
        ).get_json()["rows"]
        self.assertEqual(history[0]["action_type"], "import")

    def test_employee_history_lists_all_overrides_in_month(self) -> None:
        self.client.put(
            "/admin/employee-attendance-overrides/record",
            json={"month": "2026-05", "emp_id": self.employee_id, "attendance_days": "2", "remark": "员工甲修正"},
        )
        self.client.put(
            "/admin/employee-attendance-overrides/record",
            json={"month": "2026-05", "emp_id": self.employee_b_id, "attendance_days": "4", "remark": "员工乙修正"},
        )

        history = self.client.get("/admin/employee-attendance-overrides/history?month=2026-05")
        self.assertEqual(history.status_code, 200)
        rows = history.get_json()["rows"]
        names = {row["employee_name"] for row in rows}
        self.assertEqual(names, {"员工甲", "员工乙"})

    def test_manager_example_download_returns_expected_headers(self) -> None:
        res = self.client.get("/admin/manager-attendance-overrides/template?month=2026-05")
        self.assertEqual(res.status_code, 200)

        wb = openpyxl.load_workbook(io.BytesIO(res.data))
        ws = wb.active
        headers = [cell.value for cell in ws[1]]
        self.assertIn("月份", headers)
        self.assertIn("工号", headers)
        self.assertIn("出勤天数", headers)
        self.assertIn("备注", headers)

    def test_departments_template_download_uses_importable_headers(self) -> None:
        res = self.client.get("/admin/departments/template")
        self.assertEqual(res.status_code, 200)

        wb = openpyxl.load_workbook(io.BytesIO(res.data))
        ws = wb.active
        headers = [cell.value for cell in ws[1]]
        self.assertEqual(headers[:3], ["部门编号", "部门名称", "上级部门编号"])
        self.assertEqual(headers[3], "原始部门ID")
        self.assertEqual(ws.max_column, 4)
        self.assertTrue(ws.column_dimensions["D"].hidden)
        self.assertNotIn("部门导入元数据", wb.sheetnames)

    def test_departments_page_renders_with_export_link(self) -> None:
        project_root = os.path.dirname(os.path.dirname(__file__))
        app = Flask(
            "departments_template_render_test",
            template_folder=os.path.join(project_root, "templates"),
            static_folder=os.path.join(project_root, "static"),
        )
        register_routes(app)

        admin_user = SimpleNamespace(
            username="admin",
            role="admin",
            has_any_page_access=lambda _keys: True,
            can_access_page=lambda _key: True,
        )
        with app.test_request_context("/admin/departments/manage"):
            g.current_user = admin_user
            html = render_template("admin/departments.html")

        self.assertIn("/admin/departments/export", html)

    def test_authenticated_shell_renders_enterprise_navigation(self) -> None:
        project_root = os.path.dirname(os.path.dirname(__file__))
        app = Flask(
            "enterprise_shell_render_test",
            template_folder=os.path.join(project_root, "templates"),
            static_folder=os.path.join(project_root, "static"),
        )
        register_routes(app)

        admin_user = SimpleNamespace(
            username="admin",
            role="admin",
            has_any_page_access=lambda _keys: True,
            can_access_page=lambda _key: True,
        )
        with app.test_request_context("/admin/dashboard"):
            g.current_user = admin_user
            html = render_template("admin/dashboard.html")

        self.assertIn("企业考勤处理中心", html)
        self.assertIn("app-top-modules", html)
        self.assertIn("app-top-module", html)
        self.assertIn("app-module-sidebar", html)
        self.assertIn("module-bottom-nav", html)
        self.assertIn("module-bottom-link", html)
        self.assertIn("/module/query", html)
        self.assertIn("/module/account", html)
        self.assertIn("查询中心", html)
        self.assertIn("账套中心", html)
        self.assertIn("主数据", html)
        self.assertIn("修正中心", html)
        self.assertIn("系统设置", html)

    def test_authenticated_shell_hides_restricted_modules_for_readonly_user(self) -> None:
        project_root = os.path.dirname(os.path.dirname(__file__))
        app = Flask(
            "enterprise_shell_readonly_render_test",
            template_folder=os.path.join(project_root, "templates"),
            static_folder=os.path.join(project_root, "static"),
        )
        register_routes(app)

        readonly_user = SimpleNamespace(
            username="reader",
            role="readonly",
            has_any_page_access=lambda keys: "employee_dashboard" in keys,
            can_access_page=lambda key: key == "employee_dashboard",
        )
        with app.test_request_context("/employee/dashboard"):
            g.current_user = readonly_user
            html = render_template("dashboard.html", employees=[])

        self.assertIn("/module/query", html)
        self.assertIn("/employee/dashboard", html)
        self.assertNotIn("/module/account", html)
        self.assertNotIn("/admin/dashboard", html)
        self.assertNotIn("/module/master-data", html)
        self.assertNotIn("/module/corrections", html)
        self.assertNotIn("/module/settings", html)

    def test_authenticated_shell_renders_icon_class_for_every_sidebar_entry(self) -> None:
        project_root = os.path.dirname(os.path.dirname(__file__))
        app = Flask(
            "enterprise_shell_icon_render_test",
            template_folder=os.path.join(project_root, "templates"),
            static_folder=os.path.join(project_root, "static"),
        )
        register_routes(app)

        admin_user = SimpleNamespace(
            username="admin",
            role="admin",
            has_any_page_access=lambda _keys: True,
            can_access_page=lambda _key: True,
        )

        expected_entry_keys = {
            "employee_dashboard",
            "abnormal_query",
            "punch_records",
            "department_hours_query",
            "summary_download",
            "manager_query",
            "manager_overtime_query",
            "manager_annual_leave_query",
            "manager_department_hours_query",
            "account_dashboard",
            "employees",
            "departments",
            "shifts",
            "employee_attendance_overrides",
            "manager_attendance_overrides",
            "manager_overtime",
            "manager_annual_leave",
            "accounts",
        }
        seen_keys = set()
        modules = visible_modules(admin_user)

        for module in modules:
            request_path = module["entries"][0]["href"]
            with app.test_request_context(request_path):
                g.current_user = admin_user
                html = render_template("partials/app_nav.html", app_nav=nav_context(admin_user, request_path))

            for entry in module["entries"]:
                seen_keys.add(entry["key"])
                expected_icon_class = f"icon-{entry['key'].replace('_', '-')}"
                with self.subTest(module=module["slug"], entry_key=entry["key"]):
                    self.assertIn(expected_icon_class, html)

        self.assertEqual(seen_keys, expected_entry_keys)

    def test_login_page_renders_enterprise_entry_copy(self) -> None:
        project_root = os.path.dirname(os.path.dirname(__file__))
        app = Flask(
            "enterprise_login_render_test",
            template_folder=os.path.join(project_root, "templates"),
            static_folder=os.path.join(project_root, "static"),
        )

        with app.test_request_context("/login"):
            html = render_template("login.html", error=None)

        self.assertIn("企业考勤处理中心", html)
        self.assertIn("统一处理账套、考勤、人员与部门数据", html)
        self.assertIn("login-brand-panel", html)
        self.assertIn("login-capability-grid", html)

    def test_representative_pages_render_workflow_classes(self) -> None:
        project_root = os.path.dirname(os.path.dirname(__file__))
        app = Flask(
            "enterprise_workflow_render_test",
            template_folder=os.path.join(project_root, "templates"),
            static_folder=os.path.join(project_root, "static"),
        )
        register_routes(app)

        admin_user = SimpleNamespace(
            username="admin",
            role="admin",
            has_any_page_access=lambda _keys: True,
            can_access_page=lambda _key: True,
        )
        with app.test_request_context("/admin/dashboard"):
            g.current_user = admin_user
            admin_html = render_template("admin/dashboard.html")

        with app.test_request_context("/employee/dashboard"):
            g.current_user = admin_user
            query_html = render_template("dashboard.html", employees=[])

        self.assertIn("account-workflow", admin_html)
        self.assertIn("account-status-card", admin_html)
        self.assertIn("account-audit-card", admin_html)
        self.assertIn("query-page-shell", query_html)
        self.assertIn("query-filter-rail", query_html)
        self.assertIn("query-workspace", query_html)
        self.assertIn("query-metric-grid", query_html)
        self.assertIn("query-result-panel", query_html)
        self.assertIn("employeePickerModal", query_html)
        self.assertIn("static/js/dashboard.js", query_html)

    def render_query_template(self, path: str, template_name: str, **context: object) -> str:
        project_root = os.path.dirname(os.path.dirname(__file__))
        app = Flask(
            f"query_center_render_{template_name.replace('/', '_')}",
            template_folder=os.path.join(project_root, "templates"),
            static_folder=os.path.join(project_root, "static"),
        )
        register_routes(app)

        admin_user = SimpleNamespace(
            username="admin",
            role="admin",
            has_any_page_access=lambda _keys: True,
            can_access_page=lambda _key: True,
        )
        with app.test_request_context(path):
            g.current_user = admin_user
            return render_template(template_name, **context)

    def test_query_center_table_pages_render_query_workspace(self) -> None:
        pages = [
            (
                "/employee/dashboard",
                "dashboard.html",
                {"employees": []},
                ["selectedEmpIds", "accountSetSelect", "refreshBtn", "downloadBtn", "finalDataTable", "static/js/dashboard.js"],
            ),
            (
                "/employee/abnormal-query",
                "abnormal_query.html",
                {"employees": []},
                ["selectedEmpIds", "accountSetSelect", "queryBtn", "downloadBtn", "abnormalTableBody", "static/js/abnormal_query.js"],
            ),
            (
                "/employee/punch-records",
                "punch_records.html",
                {"employees": []},
                ["selectedEmpIds", "accountSetSelect", "queryBtn", "downloadBtn", "punchTableBody", "static/js/punch_records.js"],
            ),
            (
                "/employee/department-hours-query",
                "department_hours_query.html",
                {},
                ["accountSetSelect", "queryBtn", "downloadBtn", "departmentHoursBody", "static/js/department_hours_query.js"],
            ),
            (
                "/employee/manager-query",
                "manager_query.html",
                {"employees": []},
                ["selectedEmpIds", "managerAccountSetSelect", "managerQueryBtn", "managerDownloadBtn", "managerQueryBody", "static/js/manager_query.js"],
            ),
            (
                "/employee/manager-overtime-query",
                "manager_overtime_query.html",
                {"employees": []},
                ["selectedEmpIds", "managerOvertimeQueryYear", "managerOvertimeQueryBtn", "managerOvertimeQueryBody", "static/js/manager_overtime_query.js"],
            ),
            (
                "/employee/manager-annual-leave-query",
                "manager_annual_leave_query.html",
                {"employees": []},
                ["selectedEmpIds", "managerAnnualLeaveQueryYear", "managerAnnualLeaveQueryBtn", "managerAnnualLeaveQueryBody", "static/js/manager_annual_leave_query.js"],
            ),
            (
                "/employee/manager-department-hours-query",
                "manager_department_hours_query.html",
                {},
                ["accountSetSelect", "queryBtn", "downloadBtn", "managerDepartmentHoursBody", "static/js/manager_department_hours_query.js"],
            ),
        ]

        for path, template_name, context, expected_fragments in pages:
            with self.subTest(template=template_name):
                html = self.render_query_template(path, template_name, **context)
                self.assertIn("query-page-shell", html)
                self.assertIn("query-filter-rail", html)
                self.assertIn("query-workspace", html)
                self.assertIn("query-result-panel", html)
                self.assertNotIn("query-page-heading", html)
                self.assertNotIn("Query Center", html)
                for fragment in expected_fragments:
                    self.assertIn(fragment, html)

    def test_summary_download_renders_download_task_layout(self) -> None:
        html = self.render_query_template("/employee/summary-download", "summary_download.html", employees=[])

        self.assertIn("download-page-shell", html)
        self.assertIn("download-task-panel", html)
        self.assertIn("download-report-grid", html)
        self.assertIn("download-header-panel", html)
        self.assertIn("download-help-panel", html)
        self.assertIn("employeePickerModal", html)
        self.assertIn("accountSetSelect", html)
        self.assertIn("selectedEmpIds", html)
        self.assertIn("includeFinalData", html)
        self.assertIn("includePunchRecords", html)
        self.assertIn("downloadBtn", html)
        self.assertIn("finalHeaderCheckboxes", html)
        self.assertIn("punchHeaderCheckboxes", html)
        self.assertIn("static/js/summary_download.js", html)

    def test_product_navigation_groups_pages_into_modules(self) -> None:
        admin_user = SimpleNamespace(
            username="admin",
            role="admin",
            has_any_page_access=lambda _keys: True,
            can_access_page=lambda _key: True,
        )

        modules = visible_modules(admin_user)
        slugs = [module["slug"] for module in modules]
        self.assertEqual(slugs, ["query", "account", "master-data", "corrections", "settings"])

        query = module_by_slug("query")
        self.assertIsNotNone(query)
        self.assertEqual(query["label"], "查询中心")
        self.assertIn("/employee/dashboard", [entry["href"] for entry in query["entries"]])

        context = nav_context(admin_user, "/admin/departments/manage")
        self.assertEqual(context["current_module"]["slug"], "master-data")
        self.assertIn("/admin/departments/manage", [entry["href"] for entry in context["current_entries"]])

    def test_product_navigation_filters_readonly_permissions(self) -> None:
        readonly_user = SimpleNamespace(
            username="reader",
            role="readonly",
            has_any_page_access=lambda keys: "employee_dashboard" in keys,
            can_access_page=lambda key: key == "employee_dashboard",
        )

        modules = visible_modules(readonly_user)
        self.assertEqual([module["slug"] for module in modules], ["query"])

        context = nav_context(readonly_user, "/employee/dashboard")
        self.assertEqual(context["current_module"]["slug"], "query")
        self.assertEqual([entry["href"] for entry in context["current_entries"]], ["/employee/dashboard"])

    def test_module_home_routes_render_accessible_entries(self) -> None:
        res = self.client.get("/module/query")
        self.assertEqual(res.status_code, 200)
        html = res.get_data(as_text=True)
        self.assertIn("module-home", html)
        self.assertIn("module-entry-grid", html)
        self.assertIn("module-summary-grid", html)
        self.assertIn("查询中心", html)
        self.assertIn("/employee/dashboard", html)

        account_res = self.client.get("/module/account")
        self.assertEqual(account_res.status_code, 200)
        self.assertIn("/admin/dashboard", account_res.get_data(as_text=True))

    def test_module_home_rejects_inaccessible_module(self) -> None:
        with self.app.app_context():
            reader = User(username="reader", role="readonly", page_permissions={"employee_dashboard": True})
            reader.set_password("reader123")
            db.session.add(reader)
            db.session.commit()

        reader_client = self.app.test_client()
        reader_client.post("/login", data={"username": "reader", "password": "reader123"})

        allowed = reader_client.get("/module/query")
        self.assertEqual(allowed.status_code, 200)
        allowed_html = allowed.get_data(as_text=True)
        self.assertIn("/employee/dashboard", allowed_html)
        self.assertNotIn("/employee/abnormal-query", allowed_html)

        denied = reader_client.get("/module/account")
        self.assertEqual(denied.status_code, 403)

    def test_departments_export_downloads_importable_rows(self) -> None:
        with self.app.app_context():
            parent = Department.query.filter_by(dept_no="D001").first()
            child = Department(dept_no="D010", dept_name="行政一部", parent_id=parent.id)
            db.session.add(child)
            db.session.commit()

        res = self.client.get("/admin/departments/export")
        self.assertEqual(res.status_code, 200)
        content_disposition = res.headers.get("Content-Disposition", "")
        self.assertIn("attachment", content_disposition)
        filename = ""
        for part in [segment.strip() for segment in content_disposition.split(";")]:
            if part.startswith("filename*="):
                value = part.split("=", 1)[1].strip().strip('"')
                if value.lower().startswith("utf-8''"):
                    value = value[7:]
                filename = urllib.parse.unquote(value)
                break
            if part.startswith("filename="):
                filename = part.split("=", 1)[1].strip().strip('"')
        self.assertEqual(filename, "部门导出.xlsx")

        wb = openpyxl.load_workbook(io.BytesIO(res.data))
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        normalized_rows = [
            (row[0], row[1], row[2] or "")
            for row in rows[1:]
            if row[0] and row[1]
        ]
        self.assertEqual(rows[0][:3], ("部门编号", "部门名称", "上级部门编号"))
        self.assertEqual(rows[0][3], "原始部门ID")
        self.assertEqual(ws.max_column, 4)
        self.assertTrue(ws.column_dimensions["D"].hidden)
        self.assertIn("部门导入元数据", wb.sheetnames)
        self.assertIn(("D001", "行政部", ""), normalized_rows)
        self.assertIn(("D010", "行政一部", "D001"), normalized_rows)
        exported_ids = {
            str(row[3])
            for row in rows[1:]
            if row[0] and row[1] and row[3] is not None
        }
        self.assertEqual(len(exported_ids), 2)

    def test_departments_import_updates_existing_department_when_exported_dept_no_changes(self) -> None:
        with self.app.app_context():
            parent = Department.query.filter_by(dept_no="D001").first()
            child = Department(dept_no="D010", dept_name="行政一部", parent_id=parent.id)
            db.session.add(child)
            db.session.commit()

        export_res = self.client.get("/admin/departments/export")
        self.assertEqual(export_res.status_code, 200)

        wb = openpyxl.load_workbook(io.BytesIO(export_res.data))
        ws = wb.active
        headers = [cell.value for cell in ws[1]]
        dept_no_idx = headers.index("部门编号") + 1
        dept_name_idx = headers.index("部门名称") + 1
        parent_no_idx = headers.index("上级部门编号") + 1

        for row_idx in range(2, ws.max_row + 1):
            dept_no = ws.cell(row=row_idx, column=dept_no_idx).value
            dept_name = ws.cell(row=row_idx, column=dept_name_idx).value
            if dept_no == "D001" and dept_name == "行政部":
                ws.cell(row=row_idx, column=dept_no_idx, value="D099")
                continue
            if dept_no == "D010" and dept_name == "行政一部":
                ws.cell(row=row_idx, column=parent_no_idx, value="D099")

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)

        import_res = self.client.post(
            "/admin/departments/import",
            data={"file": (buf, "departments-renumbered.xlsx")},
            content_type="multipart/form-data",
        )
        self.assertEqual(import_res.status_code, 200)

        with self.app.app_context():
            departments = Department.query.order_by(Department.dept_no.asc()).all()
            self.assertEqual(len(departments), 2)
            self.assertIsNone(Department.query.filter_by(dept_no="D001").first())

            renamed_parent = Department.query.filter_by(dept_no="D099").first()
            self.assertIsNotNone(renamed_parent)
            self.assertEqual(renamed_parent.dept_name, "行政部")

            child = Department.query.filter_by(dept_no="D010").first()
            self.assertIsNotNone(child)
            self.assertEqual(child.parent_id, renamed_parent.id)

    def test_departments_import_keeps_identity_when_rows_are_reordered(self) -> None:
        with self.app.app_context():
            parent = Department.query.filter_by(dept_no="D001").first()
            child = Department(dept_no="D010", dept_name="行政一部", parent_id=parent.id)
            db.session.add(child)
            db.session.commit()

        export_res = self.client.get("/admin/departments/export")
        self.assertEqual(export_res.status_code, 200)

        wb = openpyxl.load_workbook(io.BytesIO(export_res.data))
        ws = wb.active
        row_two = [ws.cell(row=2, column=col_idx).value for col_idx in range(1, ws.max_column + 1)]
        row_three = [ws.cell(row=3, column=col_idx).value for col_idx in range(1, ws.max_column + 1)]
        for col_idx, value in enumerate(row_three, start=1):
            ws.cell(row=2, column=col_idx, value=value)
        for col_idx, value in enumerate(row_two, start=1):
            ws.cell(row=3, column=col_idx, value=value)

        ws.cell(row=2, column=2, value="行政一部-已排序")
        ws.cell(row=3, column=2, value="行政部-已排序")
        ws.cell(row=2, column=3, value="D001")
        ws.cell(row=3, column=3, value="")

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)

        import_res = self.client.post(
            "/admin/departments/import",
            data={"file": (buf, "departments-reordered.xlsx")},
            content_type="multipart/form-data",
        )
        self.assertEqual(import_res.status_code, 200)

        with self.app.app_context():
            departments = Department.query.order_by(Department.dept_no.asc()).all()
            self.assertEqual(len(departments), 2)

            parent = Department.query.filter_by(dept_no="D001").first()
            self.assertIsNotNone(parent)
            self.assertEqual(parent.dept_name, "行政部-已排序")

            child = Department.query.filter_by(dept_no="D010").first()
            self.assertIsNotNone(child)
            self.assertEqual(child.dept_name, "行政一部-已排序")
            self.assertEqual(child.parent_id, parent.id)

    def test_departments_import_ignores_malformed_hidden_metadata(self) -> None:
        for hidden_id in ("not-a-number", "Infinity", "1e309"):
            with self.subTest(hidden_id=hidden_id):
                export_res = self.client.get("/admin/departments/export")
                self.assertEqual(export_res.status_code, 200)

                wb = openpyxl.load_workbook(io.BytesIO(export_res.data))
                ws = wb.active
                ws.cell(row=2, column=4, value=hidden_id)
                ws.cell(row=2, column=2, value=f"行政部-安全导入-{hidden_id}")

                buf = io.BytesIO()
                wb.save(buf)
                buf.seek(0)

                import_res = self.client.post(
                    "/admin/departments/import",
                    data={"file": (buf, f"departments-malformed-metadata-{hidden_id}.xlsx")},
                    content_type="multipart/form-data",
                )
                self.assertEqual(import_res.status_code, 200)

                with self.app.app_context():
                    departments = Department.query.order_by(Department.id.asc()).all()
                    self.assertEqual(len(departments), 1)
                    self.assertEqual(departments[0].dept_no, "D001")
                    self.assertEqual(departments[0].dept_name, f"行政部-安全导入-{hidden_id}")

    def test_departments_import_rejects_rows_when_hidden_ids_mismatch_current_identity(self) -> None:
        export_res = self.client.get("/admin/departments/export")
        self.assertEqual(export_res.status_code, 200)

        other_db_path = os.path.join(self.tmpdir.name, "other.db")
        other_upload_dir = os.path.join(self.tmpdir.name, "other_uploads")
        other_app = Flask("departments_cross_db_test")
        other_app.config.update(
            TESTING=True,
            SECRET_KEY="test-secret",
            SQLALCHEMY_DATABASE_URI=f"sqlite:///{other_db_path}",
            SQLALCHEMY_TRACK_MODIFICATIONS=False,
            JWT_EXPIRES_HOURS=12,
            JWT_EXPIRES_DELTA=__import__("datetime").timedelta(hours=12),
            UPLOAD_FOLDER=other_upload_dir,
        )
        os.makedirs(other_upload_dir, exist_ok=True)
        db.init_app(other_app)
        register_routes(other_app)

        with other_app.app_context():
            db.create_all()
            admin = User(username="other-admin", role="admin")
            admin.set_password("admin123")
            unrelated = Department(dept_no="X001", dept_name="外部部门")
            db.session.add_all([admin, unrelated])
            db.session.commit()
            self.assertEqual(unrelated.id, 1)

        other_client = other_app.test_client()
        other_client.post("/login", data={"username": "other-admin", "password": "admin123"})
        import_res = other_client.post(
            "/admin/departments/import",
            data={"file": (io.BytesIO(export_res.data), "departments-cross-db.xlsx")},
            content_type="multipart/form-data",
        )
        self.assertEqual(import_res.status_code, 400)
        self.assertIn("原始部门", import_res.get_json()["error"])

        with other_app.app_context():
            unrelated = Department.query.filter_by(dept_no="X001").first()
            imported = Department.query.filter_by(dept_no="D001").first()

            self.assertIsNotNone(unrelated)
            self.assertEqual(unrelated.dept_name, "外部部门")
            self.assertIsNone(imported)
            self.assertEqual(Department.query.count(), 1)

    def test_departments_import_handles_duplicate_new_rows_for_same_dept_no(self) -> None:
        export_res = self.client.get("/admin/departments/export")
        self.assertEqual(export_res.status_code, 200)

        wb = openpyxl.load_workbook(io.BytesIO(export_res.data))
        ws = wb.active
        ws.append(["D020", "新部门一版", "", ""])
        ws.append(["D020", "新部门二版", "", ""])

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)

        import_res = self.client.post(
            "/admin/departments/import",
            data={"file": (buf, "departments-duplicate-new-rows.xlsx")},
            content_type="multipart/form-data",
        )
        self.assertEqual(import_res.status_code, 200)

        with self.app.app_context():
            matches = Department.query.filter_by(dept_no="D020").all()
            self.assertEqual(len(matches), 1)
            self.assertEqual(matches[0].dept_name, "新部门二版")

    def test_departments_import_allows_swapping_existing_department_numbers(self) -> None:
        with self.app.app_context():
            db.session.add(Department(dept_no="D002", dept_name="生产部"))
            db.session.commit()

        export_res = self.client.get("/admin/departments/export")
        self.assertEqual(export_res.status_code, 200)

        wb = openpyxl.load_workbook(io.BytesIO(export_res.data))
        ws = wb.active
        headers = [cell.value for cell in ws[1]]
        dept_no_idx = headers.index("部门编号") + 1
        dept_name_idx = headers.index("部门名称") + 1

        row_by_name = {}
        for row_idx in range(2, ws.max_row + 1):
            dept_name = ws.cell(row=row_idx, column=dept_name_idx).value
            if dept_name:
                row_by_name[dept_name] = row_idx

        admin_row = row_by_name["行政部"]
        prod_row = row_by_name["生产部"]
        admin_dept_no = ws.cell(row=admin_row, column=dept_no_idx).value
        prod_dept_no = ws.cell(row=prod_row, column=dept_no_idx).value
        ws.cell(row=admin_row, column=dept_no_idx, value=prod_dept_no)
        ws.cell(row=prod_row, column=dept_no_idx, value=admin_dept_no)

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)

        import_res = self.client.post(
            "/admin/departments/import",
            data={"file": (buf, "departments-swapped.xlsx")},
            content_type="multipart/form-data",
        )
        self.assertEqual(import_res.status_code, 200)

        with self.app.app_context():
            admin = Department.query.filter_by(dept_name="行政部").first()
            production = Department.query.filter_by(dept_name="生产部").first()

            self.assertIsNotNone(admin)
            self.assertIsNotNone(production)
            self.assertEqual(admin.dept_no, "D002")
            self.assertEqual(production.dept_no, "D001")


if __name__ == "__main__":
    unittest.main()
