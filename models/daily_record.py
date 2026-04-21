from . import db


class DailyRecord(db.Model):
    __tablename__ = "daily_records"

    id = db.Column(db.Integer, primary_key=True)
    emp_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False, index=True)
    record_date = db.Column(db.Date, nullable=False, index=True)
    shift_id = db.Column(db.Integer, db.ForeignKey("shifts.id"), nullable=True)
    expected_hours = db.Column(db.Float, default=0)
    actual_hours = db.Column(db.Float, default=0)
    absent_hours = db.Column(db.Float, default=0)
    check_in_times = db.Column(db.JSON, default=list)
    check_out_times = db.Column(db.JSON, default=list)
    leave_hours = db.Column(db.Float, default=0)
    leave_type = db.Column(db.String(50), nullable=True)
    overtime_hours = db.Column(db.Float, default=0)
    overtime_type = db.Column(db.String(50), nullable=True)
    late_minutes = db.Column(db.Integer, default=0)
    early_leave_minutes = db.Column(db.Integer, default=0)
    exception_reason = db.Column(db.Text, nullable=True)
    raw_data = db.Column(db.JSON, default=dict)

    employee = db.relationship("Employee", back_populates="daily_records")
    shift = db.relationship("Shift", back_populates="daily_records")

    __table_args__ = (db.UniqueConstraint("emp_id", "record_date", name="uq_emp_record_date"),)
