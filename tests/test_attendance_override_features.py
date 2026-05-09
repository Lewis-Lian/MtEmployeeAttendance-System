import io
import os
import tempfile
import unittest

import openpyxl
from flask import Flask

from models import db
from models.account_set import AccountSet
from models.department import Department
from models.employee import Employee
from models.user import User
from routes import register_routes


class AttendanceOverrideFeatureTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmpdir.name, "test.db")
        self.upload_dir = os.path.join(self.tmpdir.name, "uploads")

        app = Flask(__name__)
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
        self.assertEqual(headers, ["部门编号", "部门名称", "上级部门编号"])

    def test_departments_export_downloads_importable_rows(self) -> None:
        with self.app.app_context():
            parent = Department.query.filter_by(dept_no="D001").first()
            child = Department(dept_no="D010", dept_name="行政一部", parent_id=parent.id)
            db.session.add(child)
            db.session.commit()

        res = self.client.get("/admin/departments/export")
        self.assertEqual(res.status_code, 200)
        self.assertIn("部门导出.xlsx", res.headers.get("Content-Disposition", ""))

        wb = openpyxl.load_workbook(io.BytesIO(res.data))
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        normalized_rows = [(dept_no, dept_name, parent_dept_no or "") for dept_no, dept_name, parent_dept_no in rows[1:]]
        self.assertEqual(rows[0], ("部门编号", "部门名称", "上级部门编号"))
        self.assertIn(("D001", "行政部", ""), normalized_rows)
        self.assertIn(("D010", "行政一部", "D001"), normalized_rows)


if __name__ == "__main__":
    unittest.main()
