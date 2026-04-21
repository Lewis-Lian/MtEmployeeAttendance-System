from __future__ import annotations

import os

from dotenv import load_dotenv
from flask import Flask
from flask_migrate import Migrate

from config import Config
from models import db
from models.user import User, UserEmployeeAssignment
from models.department import Department
from models.employee import Employee
from models.shift import Shift
from models.daily_record import DailyRecord
from models.monthly_report import MonthlyReport
from models.overtime import OvertimeRecord
from models.leave import LeaveRecord
from models.annual_leave import AnnualLeave
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
        _ensure_default_admin()

    return app


def _ensure_default_admin() -> None:
    admin = User.query.filter_by(username="admin").first()
    if not admin:
        admin = User(username="admin", role="admin")
        admin.set_password("admin123")
        db.session.add(admin)
        db.session.commit()


app = create_app()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
