import importlib
import os
import tempfile
import unittest
from unittest import mock

from sqlalchemy import inspect, text
from sqlalchemy.exc import NoSuchTableError

from models import db
from models.user import User


class AppBootstrapTests(unittest.TestCase):
    def _load_app_module(self):
        config_module = importlib.import_module("config")
        importlib.reload(config_module)

        app_module = importlib.import_module("app")
        return importlib.reload(app_module)

    def _load_manage_module(self):
        self._load_app_module()

        manage_module = importlib.import_module("manage")
        return importlib.reload(manage_module)

    def test_create_app_does_not_seed_default_admin_implicitly(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            with mock.patch.dict(
                os.environ,
                {
                    "APP_ENV": "test",
                    "DATABASE_URL": f"sqlite:///{os.path.join(tmpdir, 'bootstrap.db')}",
                    "SECRET_KEY": "test-secret",
                    "UPLOAD_FOLDER": os.path.join(tmpdir, "uploads"),
                },
                clear=False,
            ):
                app_module = self._load_app_module()
                app = app_module.create_app()

                with app.app_context():
                    db.create_all()
                    self.assertIsNone(User.query.filter_by(username="admin").first())

    def test_health_endpoint_reports_ok_status(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            with mock.patch.dict(
                os.environ,
                {
                    "APP_ENV": "test",
                    "DATABASE_URL": f"sqlite:///{os.path.join(tmpdir, 'health.db')}",
                    "SECRET_KEY": "test-secret",
                    "UPLOAD_FOLDER": os.path.join(tmpdir, "uploads"),
                },
                clear=False,
            ):
                app = self._load_app_module().create_app()
                response = app.test_client().get("/health")

                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.get_json(), {"status": "ok"})

    def test_production_config_requires_secret_key(self) -> None:
        with mock.patch.dict(
            os.environ,
            {
                "APP_ENV": "production",
                "DATABASE_URL": "sqlite://",
                "UPLOAD_FOLDER": tempfile.gettempdir(),
            },
            clear=False,
        ):
            os.environ.pop("SECRET_KEY", None)

            with self.assertRaisesRegex(RuntimeError, "SECRET_KEY"):
                self._load_app_module().create_app()

    def test_init_admin_command_creates_admin_explicitly(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            with mock.patch.dict(
                os.environ,
                {
                    "APP_ENV": "test",
                    "DATABASE_URL": f"sqlite:///{os.path.join(tmpdir, 'cli-bootstrap.db')}",
                    "SECRET_KEY": "test-secret",
                    "UPLOAD_FOLDER": os.path.join(tmpdir, "uploads"),
                },
                clear=False,
            ):
                manage_module = self._load_manage_module()

                with manage_module.app.app_context():
                    db.create_all()
                    self.assertIsNone(User.query.filter_by(username="admin").first())

                result = manage_module.app.test_cli_runner().invoke(args=["init-admin"])

                self.assertEqual(result.exit_code, 0, result.output)

                with manage_module.app.app_context():
                    admin = User.query.filter_by(username="admin").first()

                    self.assertIsNotNone(admin)
                    self.assertEqual(admin.role, "admin")
                    self.assertTrue(admin.check_password("admin123"))

    def test_ensure_default_admin_leaves_existing_admin_unchanged(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            with mock.patch.dict(
                os.environ,
                {
                    "APP_ENV": "test",
                    "DATABASE_URL": f"sqlite:///{os.path.join(tmpdir, 'existing-admin.db')}",
                    "SECRET_KEY": "test-secret",
                    "UPLOAD_FOLDER": os.path.join(tmpdir, "uploads"),
                },
                clear=False,
            ):
                app_module = self._load_app_module()
                bootstrap_service = importlib.reload(importlib.import_module("services.bootstrap_service"))
                app = app_module.create_app()

                with app.app_context():
                    db.create_all()
                    admin = User(username="admin", role="admin")
                    admin.password_hash = "scrypt:legacyhash"
                    db.session.add(admin)
                    db.session.commit()

                    bootstrap_service.ensure_default_admin()

                    unchanged_admin = User.query.filter_by(username="admin").first()

                    self.assertIsNotNone(unchanged_admin)
                    self.assertEqual(unchanged_admin.password_hash, "scrypt:legacyhash")

    def test_get_column_names_raises_unexpected_reflection_errors(self) -> None:
        bootstrap_service = importlib.reload(importlib.import_module("services.bootstrap_service"))
        inspector = mock.Mock()
        inspector.get_columns.side_effect = RuntimeError("boom")

        with self.assertRaisesRegex(RuntimeError, "boom"):
            bootstrap_service._get_column_names(inspector, "users")

    def test_get_column_names_tolerates_missing_tables(self) -> None:
        bootstrap_service = importlib.reload(importlib.import_module("services.bootstrap_service"))
        inspector = mock.Mock()
        inspector.get_columns.side_effect = NoSuchTableError("users")

        self.assertIsNone(bootstrap_service._get_column_names(inspector, "users"))

    def test_compatibility_app_export_is_lazy(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            with mock.patch.dict(
                os.environ,
                {
                    "APP_ENV": "test",
                    "DATABASE_URL": f"sqlite:///{os.path.join(tmpdir, 'compat.db')}",
                    "SECRET_KEY": "test-secret",
                    "UPLOAD_FOLDER": os.path.join(tmpdir, "uploads"),
                },
                clear=False,
            ):
                app_module = self._load_app_module()

                self.assertIsNone(app_module._compat_app)

                compat_app = app_module.app

                self.assertEqual(compat_app.name, "app")
                self.assertIs(app_module._compat_app, compat_app)

    def test_schema_compatibility_adds_user_profile_columns(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            with mock.patch.dict(
                os.environ,
                {
                    "APP_ENV": "test",
                    "DATABASE_URL": f"sqlite:///{os.path.join(tmpdir, 'compat-users.db')}",
                    "SECRET_KEY": "test-secret",
                    "UPLOAD_FOLDER": os.path.join(tmpdir, "uploads"),
                },
                clear=False,
            ):
                app_module = self._load_app_module()
                bootstrap_service = importlib.reload(importlib.import_module("services.bootstrap_service"))
                app = app_module.create_app()

                with app.app_context():
                    db.drop_all()
                    db.session.execute(
                        text(
                            "CREATE TABLE users ("
                            "id INTEGER NOT NULL PRIMARY KEY, "
                            "username VARCHAR(80) NOT NULL, "
                            "password_hash VARCHAR(255) NOT NULL, "
                            "role VARCHAR(20) NOT NULL, "
                            "page_permissions JSON, "
                            "created_at DATETIME NOT NULL)"
                        )
                    )
                    db.session.commit()

                    bootstrap_service.ensure_schema_compatibility()

                    columns = {column["name"] for column in inspect(db.engine).get_columns("users")}
                    self.assertIn("profile_emp_no", columns)
                    self.assertIn("profile_name", columns)
                    self.assertIn("profile_dept_id", columns)
