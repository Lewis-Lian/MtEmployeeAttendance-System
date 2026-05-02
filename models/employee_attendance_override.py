from datetime import datetime

from . import db


class EmployeeAttendanceOverride(db.Model):
    __tablename__ = "employee_attendance_overrides"

    id = db.Column(db.Integer, primary_key=True)
    emp_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False, index=True)
    month = db.Column(db.String(7), nullable=False, index=True)
    attendance_days = db.Column(db.Float, nullable=True)
    work_hours = db.Column(db.Float, nullable=True)
    half_days = db.Column(db.Integer, nullable=True)
    late_early_minutes = db.Column(db.Integer, nullable=True)
    remark = db.Column(db.Text, nullable=True)
    updated_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    employee = db.relationship("Employee")
    updated_by_user = db.relationship("User")

    __table_args__ = (
        db.UniqueConstraint("emp_id", "month", name="uq_employee_attendance_override"),
    )
