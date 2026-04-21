from . import db


class Department(db.Model):
    __tablename__ = "departments"

    id = db.Column(db.Integer, primary_key=True)
    dept_no = db.Column(db.String(50), unique=True, nullable=False, index=True)
    dept_name = db.Column(db.String(120), nullable=False)

    employees = db.relationship("Employee", back_populates="department")
