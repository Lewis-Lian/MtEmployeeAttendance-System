import importlib
import os
import tempfile
import unittest
from unittest import mock

from models import db
from models.user import User


class AppBootstrapTests(unittest.TestCase):
    def _load_app_module(self):
        config_module = importlib.import_module("config")
        importlib.reload(config_module)

        app_module = importlib.import_module("app")
        return importlib.reload(app_module)

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
