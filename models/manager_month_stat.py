from . import db


class ManagerMonthStat(db.Model):
    __tablename__ = "manager_month_stats"

    id = db.Column(db.Integer, primary_key=True)
    emp_id = db.Column(db.Integer, db.ForeignKey("employees.id"), nullable=False, index=True)
    year = db.Column(db.Integer, nullable=False, index=True)
    stat_type = db.Column(db.String(20), nullable=False, index=True)
    prev_dec = db.Column(db.Float, default=0)
    m1 = db.Column(db.Float, default=0)
    m2 = db.Column(db.Float, default=0)
    m3 = db.Column(db.Float, default=0)
    m4 = db.Column(db.Float, default=0)
    m5 = db.Column(db.Float, default=0)
    m6 = db.Column(db.Float, default=0)
    m7 = db.Column(db.Float, default=0)
    m8 = db.Column(db.Float, default=0)
    m9 = db.Column(db.Float, default=0)
    m10 = db.Column(db.Float, default=0)
    m11 = db.Column(db.Float, default=0)
    m12 = db.Column(db.Float, default=0)
    remaining = db.Column(db.Float, default=0)
    remark = db.Column(db.Text, nullable=True)

    employee = db.relationship("Employee", back_populates="manager_month_stats")

    __table_args__ = (db.UniqueConstraint("emp_id", "year", "stat_type", name="uq_manager_month_stat"),)
