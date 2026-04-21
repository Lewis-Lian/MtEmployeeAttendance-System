from . import db


class LeaveRecord(db.Model):
    __tablename__ = "leave_records"

    id = db.Column(db.Integer, primary_key=True)
    emp_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False, index=True)
    leave_no = db.Column(db.String(100), unique=True, nullable=False, index=True)
    apply_date = db.Column(db.Date, nullable=True)
    leave_type = db.Column(db.String(50), nullable=False)
    start_time = db.Column(db.DateTime, nullable=False)
    end_time = db.Column(db.DateTime, nullable=False)
    duration = db.Column(db.Float, default=0)
    reason = db.Column(db.Text, nullable=True)
    approval_status = db.Column(db.String(50), nullable=True)
    approval_comment = db.Column(db.Text, nullable=True)

    employee = db.relationship("Employee", back_populates="leave_records")
