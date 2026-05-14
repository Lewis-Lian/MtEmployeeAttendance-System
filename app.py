from __future__ import annotations

import os

from dotenv import load_dotenv
from flask import Flask, jsonify
from flask_migrate import Migrate

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
from models.manager_attendance_override import ManagerAttendanceOverride
from models.employee_shift import EmployeeShiftAssignment
from models.employee_attendance_override import EmployeeAttendanceOverride
from models.attendance_override_history import AttendanceOverrideHistory
from models.account_set import AccountSet, AccountSetImport
from routes import register_routes

_compat_app: Flask | None = None


def create_app() -> Flask:
    load_dotenv()

    from config import Config

    app = Flask(__name__)
    app.config.from_object(Config)
    Config.validate()

    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

    db.init_app(app)
    Migrate(app, db)
    register_routes(app)

    @app.get("/health")
    def health_check():
        return jsonify({"status": "ok"})

    return app


def _get_compat_app() -> Flask:
    global _compat_app
    if _compat_app is None:
        _compat_app = create_app()
    return _compat_app


def __getattr__(name: str):
    if name == "app":
        return _get_compat_app()
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


if __name__ == "__main__":
    app = create_app()
    app.run(host="0.0.0.0", port=5000, debug=True)
