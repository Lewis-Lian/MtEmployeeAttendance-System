from datetime import datetime

from . import db


class AttendanceOverrideHistory(db.Model):
    __tablename__ = "attendance_override_histories"

    id = db.Column(db.Integer, primary_key=True)
    override_type = db.Column(db.String(20), nullable=False, index=True)
    emp_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False, index=True)
    month = db.Column(db.String(7), nullable=False, index=True)
    action_type = db.Column(db.String(20), nullable=False, index=True)
    changed_fields_json = db.Column(db.JSON, nullable=False, default=list)
    before_values_json = db.Column(db.JSON, nullable=False, default=dict)
    after_values_json = db.Column(db.JSON, nullable=False, default=dict)
    remark = db.Column(db.Text, nullable=True)
    source_file_name = db.Column(db.String(255), nullable=True)
    operator_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)

    employee = db.relationship("Employee")
    operator_user = db.relationship("User")
