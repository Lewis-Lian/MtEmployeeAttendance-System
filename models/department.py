from . import db


class Department(db.Model):
    __tablename__ = "departments"

    id = db.Column(db.Integer, primary_key=True)
    dept_no = db.Column(db.String(50), unique=True, nullable=False, index=True)
    dept_name = db.Column(db.String(120), nullable=False)
    parent_id = db.Column(db.Integer, db.ForeignKey("departments.id"), nullable=True, index=True)
    is_locked = db.Column(db.Boolean, default=False, nullable=False)

    employees = db.relationship("Employee", back_populates="department")
    user_assignments = db.relationship("UserDepartmentAssignment", back_populates="department")
    parent = db.relationship("Department", remote_side=[id], back_populates="children")
    children = db.relationship("Department", back_populates="parent")
