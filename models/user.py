from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from . import db


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="readonly")
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
