from datetime import datetime

from . import db


class ManagerAttendanceOverride(db.Model):
    __tablename__ = "manager_attendance_overrides"

    id = db.Column(db.Integer, primary_key=True)
    emp_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False, index=True)
    month = db.Column(db.String(7), nullable=False, index=True)
    attendance_days = db.Column(db.Float, nullable=True)
    injury_days = db.Column(db.Float, nullable=True)
    business_trip_days = db.Column(db.Float, nullable=True)
    marriage_days = db.Column(db.Float, nullable=True)
    funeral_days = db.Column(db.Float, nullable=True)
    late_early_minutes = db.Column(db.Integer, nullable=True)
    remark = db.Column(db.Text, nullable=True)
    updated_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    employee = db.relationship("Employee", back_populates="manager_attendance_overrides")
    updated_by_user = db.relationship("User")

    __table_args__ = (
        db.UniqueConstraint("emp_id", "month", name="uq_manager_attendance_override"),
    )
