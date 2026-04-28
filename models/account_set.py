from datetime import datetime

from . import db


class AccountSet(db.Model):
    __tablename__ = "account_sets"

    id = db.Column(db.Integer, primary_key=True)
    month = db.Column(db.String(7), unique=True, nullable=False, index=True)  # YYYY-MM
    name = db.Column(db.String(100), nullable=False)
    is_active = db.Column(db.Boolean, default=False, nullable=False)
    factory_rest_days = db.Column(db.Float, default=0, nullable=False)
    monthly_benefit_days = db.Column(db.Float, default=0, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    imports = db.relationship("AccountSetImport", back_populates="account_set", cascade="all, delete-orphan")


class AccountSetImport(db.Model):
    __tablename__ = "account_set_imports"

    id = db.Column(db.Integer, primary_key=True)
    account_set_id = db.Column(db.Integer, db.ForeignKey("account_sets.id"), nullable=False, index=True)
    source_filename = db.Column(db.String(255), nullable=False)
    stored_path = db.Column(db.String(500), nullable=False)
    file_type = db.Column(db.String(50), nullable=True)
    status = db.Column(db.String(20), nullable=False, default="error")  # ok/error
    imported_count = db.Column(db.Integer, nullable=False, default=0)
    error_message = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    account_set = db.relationship("AccountSet", back_populates="imports")
