from __future__ import annotations

import os
import hashlib

from dotenv import load_dotenv
from flask import Flask
from flask_migrate import Migrate
from sqlalchemy import inspect, text

from config import Config
from models import db
from models.user import User, UserEmployeeAssignment, UserDepartmentAssignment
from models.department import Department
from models.employee import Employee
from models.shift import Shift
from models.daily_record import DailyRecord
from models.monthly_report import MonthlyReport
from models.overtime import OvertimeRecord
from models.leave import LeaveRecord
from models.annual_leave import AnnualLeave
from models.manager_month_stat import ManagerMonthStat
from models.employee_shift import EmployeeShiftAssignment
from models.account_set import AccountSet, AccountSetImport
from routes import register_routes


load_dotenv()


def create_app() -> Flask:
    app = Flask(__name__)
    app.config.from_object(Config)

    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

    db.init_app(app)
    Migrate(app, db)
    register_routes(app)

    with app.app_context():
        db.create_all()
        _ensure_schema_compatibility()
        _ensure_default_admin()

    return app


def _ensure_default_admin() -> None:
    admin = User.query.filter_by(username="admin").first()
    if not admin:
        admin = User(username="admin", role="admin")
        admin.set_password("admin123")
        db.session.add(admin)
        db.session.commit()
    elif admin.password_hash.startswith("scrypt:") and not hasattr(hashlib, "scrypt"):
        admin.set_password("admin123")
        db.session.commit()


def _ensure_schema_compatibility() -> None:
    inspector = inspect(db.engine)
    try:
        columns = {c["name"] for c in inspector.get_columns("departments")}
    except Exception:
        return
    if "parent_id" not in columns:
        db.session.execute(text("ALTER TABLE departments ADD COLUMN parent_id INTEGER"))
        db.session.execute(text("CREATE INDEX IF NOT EXISTS ix_departments_parent_id ON departments(parent_id)"))
        db.session.commit()
    if "is_locked" not in columns:
        db.session.execute(text("ALTER TABLE departments ADD COLUMN is_locked BOOLEAN NOT NULL DEFAULT 0"))
        db.session.commit()

    employee_columns = {c["name"] for c in inspector.get_columns("employees")}
    if "is_manager" not in employee_columns:
        db.session.execute(text("ALTER TABLE employees ADD COLUMN is_manager BOOLEAN NOT NULL DEFAULT 0"))
        db.session.commit()
    if "is_nursing" not in employee_columns:
        db.session.execute(text("ALTER TABLE employees ADD COLUMN is_nursing BOOLEAN NOT NULL DEFAULT 0"))
        db.session.commit()

    account_set_columns = {c["name"] for c in inspector.get_columns("account_sets")}
    if "factory_rest_days" not in account_set_columns:
        db.session.execute(text("ALTER TABLE account_sets ADD COLUMN factory_rest_days FLOAT NOT NULL DEFAULT 0"))
        db.session.commit()
    if "monthly_benefit_days" not in account_set_columns:
        db.session.execute(text("ALTER TABLE account_sets ADD COLUMN monthly_benefit_days FLOAT NOT NULL DEFAULT 0"))
        db.session.commit()


app = create_app()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
