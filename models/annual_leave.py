from . import db


class AnnualLeave(db.Model):
    __tablename__ = "annual_leave"

    id = db.Column(db.Integer, primary_key=True)
    emp_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False, index=True)
    year = db.Column(db.Integer, nullable=False, index=True)
    total_days = db.Column(db.Float, default=0)
    used_days = db.Column(db.Float, default=0)
    remaining_days = db.Column(db.Float, default=0)

    employee = db.relationship("Employee", back_populates="annual_leave")

    __table_args__ = (db.UniqueConstraint("emp_id", "year", name="uq_emp_leave_year"),)
