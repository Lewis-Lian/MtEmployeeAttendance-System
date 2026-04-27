from . import db


class EmployeeShiftAssignment(db.Model):
    __tablename__ = "employee_shift_assignments"

    id = db.Column(db.Integer, primary_key=True)
    emp_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False, index=True, unique=True)
    shift_id = db.Column(db.Integer, db.ForeignKey("shifts.id"), nullable=True, index=True)

    employee = db.relationship("Employee", back_populates="shift_assignment")
    shift = db.relationship("Shift", back_populates="employee_assignments")
