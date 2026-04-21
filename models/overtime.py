from . import db


class OvertimeRecord(db.Model):
    __tablename__ = "overtime_records"

    id = db.Column(db.Integer, primary_key=True)
    emp_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False, index=True)
    overtime_no = db.Column(db.String(100), unique=True, nullable=False, index=True)
    start_time = db.Column(db.DateTime, nullable=False)
    end_time = db.Column(db.DateTime, nullable=False)
    is_weekend = db.Column(db.Boolean, default=False)
    is_holiday = db.Column(db.Boolean, default=False)
    salary_option = db.Column(db.String(100), nullable=True)
    effective_hours = db.Column(db.Float, default=0)
    reason = db.Column(db.Text, nullable=True)
    approval_status = db.Column(db.String(50), nullable=True)
    approval_comment = db.Column(db.Text, nullable=True)

    employee = db.relationship("Employee", back_populates="overtime_records")
