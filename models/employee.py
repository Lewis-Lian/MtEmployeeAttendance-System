from datetime import datetime
from . import db


class Employee(db.Model):
    __tablename__ = "employees"

    id = db.Column(db.Integer, primary_key=True)
    emp_no = db.Column(db.String(50), unique=True, nullable=False, index=True)
    name = db.Column(db.String(100), nullable=False)
    dept_id = db.Column(db.Integer, db.ForeignKey("departments.id"), nullable=True, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    department = db.relationship("Department", back_populates="employees")
    daily_records = db.relationship("DailyRecord", back_populates="employee", cascade="all, delete-orphan")
    monthly_reports = db.relationship("MonthlyReport", back_populates="employee", cascade="all, delete-orphan")
    overtime_records = db.relationship("OvertimeRecord", back_populates="employee", cascade="all, delete-orphan")
    leave_records = db.relationship("LeaveRecord", back_populates="employee", cascade="all, delete-orphan")
    annual_leave = db.relationship("AnnualLeave", back_populates="employee", cascade="all, delete-orphan")
    user_assignments = db.relationship(
        "UserEmployeeAssignment", back_populates="employee", cascade="all, delete-orphan"
    )
