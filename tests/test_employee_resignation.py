import os
import tempfile
import unittest
from datetime import date, timedelta

from flask import Flask

from models import db
from models.department import Department
from models.employee import Employee
from models.user import User, UserEmployeeAssignment
from routes import register_routes
from routes.auth_helpers import issue_slider_verified_token
from tests.csrf_helper import attach_origin


class EmployeeResignationTestBase(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmpdir.cleanup)
        self.app = Flask(__name__)
        self.app.config.update(
            TESTING=True,
            SECRET_KEY="test-secret",
            SQLALCHEMY_DATABASE_URI=f"sqlite:///{self.tmpdir.name}/resignation.db",
            SQLALCHEMY_TRACK_MODIFICATIONS=False,
            JWT_EXPIRES_DELTA=timedelta(hours=12),
            FRONTEND_ORIGIN="http://localhost:5173",
            SESSION_COOKIE_NAME="api_admin_access_token",
            SESSION_COOKIE_SAMESITE="None",
            SESSION_COOKIE_SECURE=False,
            UPLOAD_FOLDER=os.path.join(self.tmpdir.name, "uploads"),
        )
        os.makedirs(self.app.config["UPLOAD_FOLDER"], exist_ok=True)
        db.init_app(self.app)
        register_routes(self.app)

        with self.app.app_context():
            db.create_all()
            admin = User(username="admin", role="admin")
            admin.set_password("admin123")
            dept = Department(dept_no="D001", dept_name="行政部")
            db.session.add_all([admin, dept])
            db.session.flush()

            self.active_emp = Employee(emp_no="E100", name="在职员工", dept_id=dept.id)
            self.resigned_emp = Employee(
                emp_no="E200", name="已离职员工", dept_id=dept.id, resigned_at=date(2026, 8, 31)
            )
            db.session.add_all([self.active_emp, self.resigned_emp])
            db.session.commit()
            self.active_emp_id = self.active_emp.id
            self.resigned_emp_id = self.resigned_emp.id

        self.client = attach_origin(self.app.test_client())

    def tearDown(self) -> None:
        with self.app.app_context():
            db.session.remove()
            db.drop_all()

    def _login(self) -> None:
        with self.app.app_context():
            captcha_token = issue_slider_verified_token()
        self.client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "admin123", "captcha_token": captcha_token},
        )


class TestEmployeeResignationField(EmployeeResignationTestBase):
    def test_serialize_employee_includes_resigned_at(self) -> None:
        self._login()

        response = self.client.get("/api/admin/employees?status=all")

        self.assertEqual(response.status_code, 200)
        rows = {row["emp_no"]: row for row in response.get_json()}
        self.assertIsNone(rows["E100"]["resigned_at"])
        self.assertEqual(rows["E200"]["resigned_at"], "2026-08-31")


class TestResignApi(EmployeeResignationTestBase):
    def _bind_user(self, username: str, emp_id: int, role: str = "readonly") -> int:
        with self.app.app_context():
            user = User(username=username, role=role)
            user.set_password("pw123456")
            db.session.add(user)
            db.session.flush()
            db.session.add(UserEmployeeAssignment(user_id=user.id, emp_id=emp_id))
            db.session.commit()
            return user.id

    def test_resign_by_emp_no_sets_date_and_disables_account(self) -> None:
        self._login()
        user_id = self._bind_user("e100", self.active_emp_id)

        response = self.client.post(
            "/api/admin/employees/resign",
            json={"emp_no": "E100", "resigned_at": "2026-08-15"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["employee"]["resigned_at"], "2026-08-15")
        with self.app.app_context():
            employee = db.session.get(Employee, self.active_emp_id)
            user = db.session.get(User, user_id)
            self.assertEqual(employee.resigned_at, date(2026, 8, 15))
            self.assertTrue(user.is_login_disabled())
            self.assertEqual(user.login_disabled_reason, "employee_resigned")

    def test_resign_defaults_to_today(self) -> None:
        self._login()

        response = self.client.post("/api/admin/employees/resign", json={"emp_no": "E100"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["employee"]["resigned_at"], date.today().isoformat())

    def test_resign_unknown_emp_no_returns_400(self) -> None:
        self._login()

        response = self.client.post("/api/admin/employees/resign", json={"emp_no": "NOPE"})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json(), {"error": "工号不存在"})

    def test_resign_already_resigned_returns_400(self) -> None:
        self._login()

        response = self.client.post("/api/admin/employees/resign", json={"emp_no": "E200"})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json(), {"error": "该员工已离职"})

    def test_resign_invalid_date_returns_400(self) -> None:
        self._login()

        response = self.client.post(
            "/api/admin/employees/resign", json={"emp_no": "E100", "resigned_at": "2026/08/15"}
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json(), {"error": "离职日期格式不正确，应为 YYYY-MM-DD"})

    def test_resign_skips_admin_accounts(self) -> None:
        self._login()
        self._bind_user("boss", self.active_emp_id, role="admin")

        response = self.client.post("/api/admin/employees/resign", json={"emp_no": "E100"})

        self.assertEqual(response.status_code, 200)
        with self.app.app_context():
            user = db.session.query(User).filter_by(username="boss").first()
            self.assertFalse(user.is_login_disabled())

    def test_resign_does_not_disable_manager_viewer_bound_to_employee(self) -> None:
        self._login()
        with self.app.app_context():
            user = User(
                username="manager-viewer",
                role="readonly",
                profile_emp_no="M001",
                profile_name="管理人员",
                page_permissions={"manager_query": True},
            )
            user.set_password("pw123456")
            db.session.add(user)
            db.session.flush()
            db.session.add(UserEmployeeAssignment(user_id=user.id, emp_id=self.active_emp_id))
            db.session.commit()
            user_id = user.id

        response = self.client.post("/api/admin/employees/resign", json={"emp_no": "E100"})

        self.assertEqual(response.status_code, 200)
        with self.app.app_context():
            user = db.session.get(User, user_id)
            self.assertFalse(user.is_login_disabled())

    def test_resign_does_not_overwrite_other_disable_reason(self) -> None:
        self._login()
        user_id = self._bind_user("e100", self.active_emp_id)
        with self.app.app_context():
            user = db.session.get(User, user_id)
            user.login_disabled_until_admin_unlock = True
            user.login_disabled_reason = "too_many_failed_attempts"
            db.session.commit()

        response = self.client.post("/api/admin/employees/resign", json={"emp_no": "E100"})

        self.assertEqual(response.status_code, 200)
        with self.app.app_context():
            user = db.session.get(User, user_id)
            self.assertEqual(user.login_disabled_reason, "too_many_failed_attempts")


class TestReinstateApi(EmployeeResignationTestBase):
    def _bind_user(self, username: str, emp_id: int) -> int:
        with self.app.app_context():
            user = User(username=username, role="readonly")
            user.set_password("pw123456")
            db.session.add(user)
            db.session.flush()
            db.session.add(UserEmployeeAssignment(user_id=user.id, emp_id=emp_id))
            db.session.commit()
            return user.id

    def test_reinstate_clears_date_and_unlocks_account(self) -> None:
        self._login()
        user_id = self._bind_user("e200", self.resigned_emp_id)
        with self.app.app_context():
            user = db.session.get(User, user_id)
            user.login_disabled_until_admin_unlock = True
            user.login_disabled_reason = "employee_resigned"
            db.session.commit()

        response = self.client.post(f"/api/admin/employees/{self.resigned_emp_id}/reinstate")

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.get_json()["employee"]["resigned_at"])
        with self.app.app_context():
            employee = db.session.get(Employee, self.resigned_emp_id)
            user = db.session.get(User, user_id)
            self.assertIsNone(employee.resigned_at)
            self.assertFalse(user.is_login_disabled())
            self.assertIsNone(user.login_disabled_reason)

    def test_reinstate_not_resigned_returns_400(self) -> None:
        self._login()

        response = self.client.post(f"/api/admin/employees/{self.active_emp_id}/reinstate")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json(), {"error": "该员工未离职"})

    def test_reinstate_keeps_manual_disable_reason(self) -> None:
        self._login()
        user_id = self._bind_user("e200", self.resigned_emp_id)
        with self.app.app_context():
            user = db.session.get(User, user_id)
            user.login_disabled_until_admin_unlock = True
            user.login_disabled_reason = "too_many_failed_attempts"
            db.session.commit()

        response = self.client.post(f"/api/admin/employees/{self.resigned_emp_id}/reinstate")

        self.assertEqual(response.status_code, 200)
        with self.app.app_context():
            user = db.session.get(User, user_id)
            self.assertTrue(user.is_login_disabled())
            self.assertEqual(user.login_disabled_reason, "too_many_failed_attempts")


class TestResignationQueryFilter(EmployeeResignationTestBase):
    def test_query_bootstrap_excludes_resigned(self) -> None:
        self._login()

        response = self.client.get("/api/query/bootstrap")

        self.assertEqual(response.status_code, 200)
        emp_nos = {row["emp_no"] for row in response.get_json()["employees"]}
        self.assertIn("E100", emp_nos)
        self.assertNotIn("E200", emp_nos)

    def test_employees_list_defaults_to_active(self) -> None:
        self._login()

        response = self.client.get("/api/admin/employees")

        emp_nos = {row["emp_no"] for row in response.get_json()}
        self.assertEqual(emp_nos, {"E100"})

    def test_employees_list_resigned_only(self) -> None:
        self._login()

        response = self.client.get("/api/admin/employees?status=resigned")

        emp_nos = {row["emp_no"] for row in response.get_json()}
        self.assertEqual(emp_nos, {"E200"})

    def test_employees_list_all(self) -> None:
        self._login()

        response = self.client.get("/api/admin/employees?status=all")

        emp_nos = {row["emp_no"] for row in response.get_json()}
        self.assertEqual(emp_nos, {"E100", "E200"})

    def test_manager_attendance_excludes_resigned(self) -> None:
        self._login()
        with self.app.app_context():
            active = db.session.get(Employee, self.active_emp_id)
            resigned = db.session.get(Employee, self.resigned_emp_id)
            active.is_manager = True
            resigned.is_manager = True
            db.session.commit()

        response = self.client.get("/api/query/manager-attendance?month=2026-08")

        self.assertEqual(response.status_code, 200)
        text = str(response.get_json())
        self.assertIn("在职员工", text)
        self.assertNotIn("已离职员工", text)

    def _login_readonly(self, username: str, password: str) -> None:
        with self.app.app_context():
            captcha_token = issue_slider_verified_token()
        self.client.post(
            "/api/auth/login",
            json={"username": username, "password": password, "captcha_token": captcha_token},
        )

    def test_directly_bound_resigned_employee_not_queryable(self) -> None:
        # 离职员工留有历史考勤数据，直接绑定的账号在查询中心也不得查到
        with self.app.app_context():
            from models.daily_record import DailyRecord

            db.session.add(
                DailyRecord(emp_id=self.resigned_emp_id, record_date=date(2026, 8, 20), actual_hours=8)
            )
            user = User(username="viewer", role="readonly", page_permissions={"punch_records": True})
            user.set_password("pw123456")
            db.session.add(user)
            db.session.flush()
            db.session.add(UserEmployeeAssignment(user_id=user.id, emp_id=self.resigned_emp_id))
            db.session.commit()

        self._login_readonly("viewer", "pw123456")

        response = self.client.get("/api/query/punch-records?month=2026-08")

        self.assertEqual(response.status_code, 200)
        self.assertNotIn("已离职员工", str(response.get_json()))


class TestResignationAccountLinkage(EmployeeResignationTestBase):
    def _create_user_bound_to(self, username: str, emp_ids: list[int]) -> int:
        with self.app.app_context():
            user = User(username=username, role="readonly")
            user.set_password("pw123456")
            db.session.add(user)
            db.session.flush()
            for emp_id in emp_ids:
                db.session.add(UserEmployeeAssignment(user_id=user.id, emp_id=emp_id))
            db.session.commit()
            return user.id

    def test_unlock_rejected_for_resignation_disabled_account(self) -> None:
        self._login()
        user_id = self._create_user_bound_to("e200", [self.resigned_emp_id])
        with self.app.app_context():
            user = db.session.get(User, user_id)
            user.login_disabled_until_admin_unlock = True
            user.login_disabled_reason = "employee_resigned"
            db.session.commit()

        response = self.client.post(f"/api/admin/disabled-users/{user_id}/unlock")

        self.assertEqual(response.status_code, 400)
        with self.app.app_context():
            user = db.session.get(User, user_id)
            self.assertTrue(user.is_login_disabled())

    def test_unlock_allowed_for_other_disable_reasons(self) -> None:
        self._login()
        user_id = self._create_user_bound_to("e200", [self.resigned_emp_id])
        with self.app.app_context():
            user = db.session.get(User, user_id)
            user.login_disabled_until_admin_unlock = True
            user.login_disabled_reason = "too_many_failed_attempts"
            db.session.commit()

        response = self.client.post(f"/api/admin/disabled-users/{user_id}/unlock")

        self.assertEqual(response.status_code, 200)
        with self.app.app_context():
            user = db.session.get(User, user_id)
            self.assertFalse(user.is_login_disabled())

    def test_manager_batch_creation_skips_resigned(self) -> None:
        self._login()
        with self.app.app_context():
            active = db.session.get(Employee, self.active_emp_id)
            resigned = db.session.get(Employee, self.resigned_emp_id)
            active.is_manager = True
            resigned.is_manager = True
            db.session.commit()

        response = self.client.post(
            "/api/admin/users/manager-batch", json={"password": "pw123456"}
        )

        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        created_usernames = {user["username"] for user in body["created_users"]}
        self.assertIn("E100", created_usernames)
        self.assertNotIn("E200", created_usernames)

    def test_reinstate_unlocks_only_when_no_other_resigned_binding(self) -> None:
        self._login()
        with self.app.app_context():
            third_emp = Employee(emp_no="E300", name="第三人")
            db.session.add(third_emp)
            db.session.commit()
            third_emp_id = third_emp.id

        user_id = self._create_user_bound_to("shared", [self.resigned_emp_id, third_emp_id])

        with self.app.app_context():
            third = db.session.get(Employee, third_emp_id)
            third.resigned_at = date(2026, 9, 1)
            # 两名绑定员工先后离职，账号因离职被禁用
            user = db.session.get(User, user_id)
            user.login_disabled_until_admin_unlock = True
            user.login_disabled_reason = "employee_resigned"
            db.session.commit()

        # 恢复第一名员工：账号仍绑定另一名离职员工，不应解禁
        first = self.client.post(f"/api/admin/employees/{self.resigned_emp_id}/reinstate")
        self.assertEqual(first.status_code, 200)
        with self.app.app_context():
            user = db.session.get(User, user_id)
            self.assertTrue(user.is_login_disabled())

        # 恢复第二名员工后，账号才解禁
        second = self.client.post(f"/api/admin/employees/{third_emp_id}/reinstate")
        self.assertEqual(second.status_code, 200)
        with self.app.app_context():
            user = db.session.get(User, user_id)
            self.assertFalse(user.is_login_disabled())
