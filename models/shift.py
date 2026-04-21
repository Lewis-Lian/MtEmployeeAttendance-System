from . import db


class Shift(db.Model):
    __tablename__ = "shifts"

    id = db.Column(db.Integer, primary_key=True)
    shift_no = db.Column(db.String(50), unique=True, nullable=False, index=True)
    shift_name = db.Column(db.String(100), nullable=False)
    time_slots = db.Column(db.JSON, nullable=False, default=list)
    is_cross_day = db.Column(db.Boolean, default=False, nullable=False)

    daily_records = db.relationship("DailyRecord", back_populates="shift")
