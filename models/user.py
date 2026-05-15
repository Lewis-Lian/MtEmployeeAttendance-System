from datetime import datetime
from typing import Optional, Sequence
from werkzeug.security import generate_password_hash, check_password_hash
from . import db


PAGE_PERMISSION_LABELS = {
    "query_home": "首页",
    "manager_query": "管理人员考勤数据查询",
    "manager_overtime_query": "查询加班",
    "manager_annual_leave_query": "查询年休",
    "manager_department_hours_query": "管理人员部门工时查询",
    "employee_dashboard": "员工考勤数据查询",
    "abnormal_query": "员工异常查询",
    "punch_records": "员工打卡数据查询",
    "department_hours_query": "员工部门工时查询",
    "summary_download": "汇总下载",
}

HOME_PAGE_PERMISSION_KEYS = ("query_home",)

MANAGER_PAGE_PERMISSION_KEYS = (
    "manager_query",
    "manager_overtime_query",
    "manager_annual_leave_query",
    "manager_department_hours_query",
)

EMPLOYEE_PAGE_PERMISSION_KEYS = (
    "employee_dashboard",
    "abnormal_query",
    "punch_records",
    "department_hours_query",
    "summary_download",
)

ALL_PAGE_PERMISSION_KEYS = (
    *HOME_PAGE_PERMISSION_KEYS,
    *MANAGER_PAGE_PERMISSION_KEYS,
    *EMPLOYEE_PAGE_PERMISSION_KEYS,
)


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    profile_emp_no = db.Column(db.String(80), nullable=True)
    profile_name = db.Column(db.String(80), nullable=True)
    profile_dept_id = db.Column(db.Integer, nullable=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="readonly")
    page_permissions = db.Column(db.JSON, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    employee_assignments = db.relationship(
        "UserEmployeeAssignment", back_populates="user", cascade="all, delete-orphan"
    )
    department_assignments = db.relationship(
        "UserDepartmentAssignment", back_populates="user", cascade="all, delete-orphan"
    )

    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password, method="pbkdf2:sha256")

    def check_password(self, password: str) -> bool:
        try:
            return check_password_hash(self.password_hash, password)
        except AttributeError:
            return False

    def effective_page_permissions(self) -> dict[str, bool]:
        if self.role == "admin":
            return {key: True for key in ALL_PAGE_PERMISSION_KEYS}

        raw = self.page_permissions if isinstance(self.page_permissions, dict) else None
        if raw is None:
            return {key: True for key in ALL_PAGE_PERMISSION_KEYS}

        result = {}
        for key in ALL_PAGE_PERMISSION_KEYS:
            if key in raw:
                result[key] = bool(raw[key])
            elif key in HOME_PAGE_PERMISSION_KEYS:
                result[key] = True
            else:
                result[key] = False
        return result

    def can_access_page(self, page_key: str) -> bool:
        if self.role == "admin":
            return True
        return bool(self.effective_page_permissions().get(page_key, False))

    def has_any_page_access(self, page_keys: Optional[Sequence[str]] = None) -> bool:
        keys = tuple(page_keys or ALL_PAGE_PERMISSION_KEYS)
        if self.role == "admin":
            return True
        permissions = self.effective_page_permissions()
        return any(permissions.get(key, False) for key in keys)


class UserEmployeeAssignment(db.Model):
    __tablename__ = "user_employee_assignments"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    emp_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False, index=True)

    user = db.relationship("User", back_populates="employee_assignments")
    employee = db.relationship("Employee", back_populates="user_assignments")

    __table_args__ = (
        db.UniqueConstraint("user_id", "emp_id", name="uq_user_employee_assignment"),
    )


class UserDepartmentAssignment(db.Model):
    __tablename__ = "user_department_assignments"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    dept_id = db.Column(db.Integer, db.ForeignKey("departments.id"), nullable=False, index=True)

    user = db.relationship("User", back_populates="department_assignments")
    department = db.relationship("Department", back_populates="user_assignments")

    __table_args__ = (
        db.UniqueConstraint("user_id", "dept_id", name="uq_user_department_assignment"),
    )
