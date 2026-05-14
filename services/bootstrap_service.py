from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.exc import NoSuchTableError
from sqlalchemy.engine.reflection import Inspector

from models import db
from models.user import User


def initialize_database() -> None:
    db.create_all()
    ensure_schema_compatibility()


def ensure_default_admin() -> None:
    admin = User.query.filter_by(username="admin").first()
    if admin is None:
        admin = User(username="admin", role="admin")
        admin.set_password("admin123")
        db.session.add(admin)
        db.session.commit()


def ensure_schema_compatibility() -> None:
    inspector = inspect(db.engine)

    department_columns = _get_column_names(inspector, "departments")
    if department_columns is not None:
        if "parent_id" not in department_columns:
            db.session.execute(text("ALTER TABLE departments ADD COLUMN parent_id INTEGER"))
            db.session.execute(text("CREATE INDEX IF NOT EXISTS ix_departments_parent_id ON departments(parent_id)"))
            db.session.commit()
        if "is_locked" not in department_columns:
            db.session.execute(text("ALTER TABLE departments ADD COLUMN is_locked BOOLEAN NOT NULL DEFAULT 0"))
            db.session.commit()

    employee_columns = _get_column_names(inspector, "employees")
    if employee_columns is not None:
        if "is_manager" not in employee_columns:
            db.session.execute(text("ALTER TABLE employees ADD COLUMN is_manager BOOLEAN NOT NULL DEFAULT 0"))
            db.session.commit()
        if "is_nursing" not in employee_columns:
            db.session.execute(text("ALTER TABLE employees ADD COLUMN is_nursing BOOLEAN NOT NULL DEFAULT 0"))
            db.session.commit()
        if "include_in_manager_stats" not in employee_columns:
            db.session.execute(text("ALTER TABLE employees ADD COLUMN include_in_manager_stats BOOLEAN NOT NULL DEFAULT 0"))
            db.session.commit()
        if "employee_stats_attendance_source" not in employee_columns:
            db.session.execute(
                text(
                    "ALTER TABLE employees ADD COLUMN employee_stats_attendance_source "
                    "VARCHAR(20) NOT NULL DEFAULT 'employee'"
                )
            )
            db.session.commit()
        if "manager_stats_attendance_source" not in employee_columns:
            db.session.execute(
                text(
                    "ALTER TABLE employees ADD COLUMN manager_stats_attendance_source "
                    "VARCHAR(20) NOT NULL DEFAULT 'manager'"
                )
            )
            db.session.commit()

    account_set_columns = _get_column_names(inspector, "account_sets")
    if account_set_columns is not None:
        if "factory_rest_days" not in account_set_columns:
            db.session.execute(text("ALTER TABLE account_sets ADD COLUMN factory_rest_days FLOAT NOT NULL DEFAULT 0"))
            db.session.commit()
        if "monthly_benefit_days" not in account_set_columns:
            db.session.execute(text("ALTER TABLE account_sets ADD COLUMN monthly_benefit_days FLOAT NOT NULL DEFAULT 0"))
            db.session.commit()
        if "is_locked" not in account_set_columns:
            db.session.execute(text("ALTER TABLE account_sets ADD COLUMN is_locked BOOLEAN NOT NULL DEFAULT 0"))
            db.session.commit()
        if "locked_at" not in account_set_columns:
            db.session.execute(text("ALTER TABLE account_sets ADD COLUMN locked_at DATETIME"))
            db.session.commit()
        if "locked_by" not in account_set_columns:
            db.session.execute(text("ALTER TABLE account_sets ADD COLUMN locked_by INTEGER"))
            db.session.commit()

    user_columns = _get_column_names(inspector, "users")
    if user_columns is not None and "page_permissions" not in user_columns:
        db.session.execute(text("ALTER TABLE users ADD COLUMN page_permissions JSON"))
        db.session.commit()

    daily_record_columns = _get_column_names(inspector, "daily_records")
    if daily_record_columns is not None:
        if "employee_payload" not in daily_record_columns:
            db.session.execute(text("ALTER TABLE daily_records ADD COLUMN employee_payload JSON"))
            db.session.commit()
        if "manager_payload" not in daily_record_columns:
            db.session.execute(text("ALTER TABLE daily_records ADD COLUMN manager_payload JSON"))
            db.session.commit()

    monthly_report_columns = _get_column_names(inspector, "monthly_reports")
    if monthly_report_columns is not None:
        if "employee_raw_data" not in monthly_report_columns:
            db.session.execute(text("ALTER TABLE monthly_reports ADD COLUMN employee_raw_data JSON"))
            db.session.commit()
        if "manager_raw_data" not in monthly_report_columns:
            db.session.execute(text("ALTER TABLE monthly_reports ADD COLUMN manager_raw_data JSON"))
            db.session.commit()


def _get_column_names(inspector: Inspector, table_name: str) -> set[str] | None:
    try:
        return {column["name"] for column in inspector.get_columns(table_name)}
    except NoSuchTableError:
        return None
