# Production Readiness Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the attendance system so production startup is explicit and concurrency-safe, high-risk admin/import/reporting code is easier to evolve, and the Windows-first deployment path is ready for later Linux migration.

**Architecture:** Keep the Flask app factory as the single runtime entry point, move schema/bootstrap side effects into explicit operational commands, selectively split oversized admin responsibilities into smaller route modules plus helpers, and reshape import/summary services around clearer boundaries and batched work. Preserve current product behavior unless a change is required for production safety or correctness.

**Tech Stack:** Flask, Flask-SQLAlchemy, Flask-Migrate, Waitress, SQLite/current DB backend, Python `unittest`, `openpyxl`, `xlrd`

---

## File Structure

### Files to Create

- `manage.py` - operational CLI entry point for explicit initialization and verification commands
- `wsgi.py` - production WSGI entry point shared by Windows and future Linux deployments
- `routes/admin_accounts.py` - account and permission management routes extracted from the current admin module
- `routes/admin_attendance_overrides.py` - employee/manager attendance override routes extracted from the current admin module
- `routes/admin_imports.py` - import/export-heavy admin routes extracted from the current admin module
- `services/bootstrap_service.py` - explicit app/bootstrap routines such as admin initialization
- `services/import_pipeline.py` - file identification, normalization, and parsed-result orchestration helpers
- `services/attendance_summary_service.py` - batched summary helpers for monthly/yearly report queries
- `tests/test_app_bootstrap.py` - app factory, config validation, and bootstrap command tests
- `tests/test_import_pipeline.py` - import pipeline boundary and cleanup tests
- `tests/test_attendance_summary_service.py` - batched summary behavior tests

### Files to Modify

- `app.py` - remove runtime schema/bootstrap side effects and keep a clean factory + dev-only launcher
- `config.py` - split dev-safe defaults from production validation rules
- `routes/__init__.py` - register the decomposed admin route modules
- `routes/admin.py` - retain shared admin helpers or shrink to a compatibility shell
- `services/import_service.py` - delegate normalization/routing responsibilities into the new pipeline helpers
- `services/attendance_service.py` - delegate summary-heavy logic into batched helpers
- `README.md` - replace production startup instructions so they use explicit init + WSGI serving
- `requirements.txt` - keep runtime dependencies aligned if new production-safe tooling is needed

### Existing Files to Check During Execution

- `scripts/windows/bootstrap_windows.ps1`
- `scripts/windows/install_service.ps1`
- `scripts/windows/run_service_manager.bat`
- `tests/test_attendance_override_features.py`
- `tests/test_manager_attendance_service.py`

## Task 1: Clean App Bootstrap And Production Configuration

**Files:**
- Create: `manage.py`
- Create: `wsgi.py`
- Create: `tests/test_app_bootstrap.py`
- Modify: `app.py`
- Modify: `config.py`

- [ ] **Step 1: Write the failing bootstrap/config tests**

```python
import os
import tempfile
import unittest

from app import create_app


class AppBootstrapTests(unittest.TestCase):
    def test_create_app_does_not_seed_default_admin_implicitly(self) -> None:
        tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(tmpdir.cleanup)
        os.environ["DATABASE_URL"] = f"sqlite:///{tmpdir.name}/bootstrap.db"
        os.environ["SECRET_KEY"] = "test-secret"
        os.environ["APP_ENV"] = "test"

        app = create_app()

        with app.app_context():
            from models.user import User

            self.assertIsNone(User.query.filter_by(username="admin").first())

    def test_production_config_requires_secret_key(self) -> None:
        previous = os.environ.pop("SECRET_KEY", None)
        self.addCleanup(lambda: os.environ.__setitem__("SECRET_KEY", previous) if previous else None)
        os.environ["APP_ENV"] = "production"
        os.environ["DATABASE_URL"] = "sqlite://"

        with self.assertRaisesRegex(RuntimeError, "SECRET_KEY"):
            create_app()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest tests.test_app_bootstrap -v`
Expected: FAIL because `create_app()` still seeds the admin user and production config does not yet fail fast.

- [ ] **Step 3: Write the minimal bootstrap/config implementation**

```python
# config.py
import os
from datetime import timedelta


class Config:
    APP_ENV = os.getenv("APP_ENV", "development")
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", "sqlite:///attendance.db")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SECRET_KEY = os.getenv("SECRET_KEY")
    JWT_EXPIRES_HOURS = int(os.getenv("JWT_EXPIRES_HOURS", "12"))
    JWT_EXPIRES_DELTA = timedelta(hours=JWT_EXPIRES_HOURS)
    UPLOAD_FOLDER = os.getenv(
        "UPLOAD_FOLDER",
        os.path.join(os.path.dirname(__file__), "static", "uploads"),
    )

    @classmethod
    def validate(cls) -> None:
        if cls.APP_ENV == "production" and not cls.SECRET_KEY:
            raise RuntimeError("SECRET_KEY must be set in production")
```

```python
# app.py
from dotenv import load_dotenv
from flask import Flask
from flask_migrate import Migrate

from config import Config
from models import db
from routes import register_routes

load_dotenv()


def create_app() -> Flask:
    app = Flask(__name__)
    app.config.from_object(Config)
    Config.validate()
    db.init_app(app)
    Migrate(app, db)
    register_routes(app)
    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
```

```python
# wsgi.py
from app import create_app

app = create_app()
```

- [ ] **Step 4: Add explicit operational entry points**

```python
# manage.py
from app import create_app
from services.bootstrap_service import initialize_database, ensure_default_admin

app = create_app()


@app.cli.command("init-db")
def init_db_command() -> None:
    initialize_database()


@app.cli.command("init-admin")
def init_admin_command() -> None:
    ensure_default_admin()
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m unittest tests.test_app_bootstrap -v`
Expected: PASS

- [ ] **Step 6: Smoke-check the shared entry point**

Run: `python -c "from wsgi import app; print(app.name)"`
Expected: prints `app` or the Flask import name without raising an exception.

- [ ] **Step 7: Commit**

```bash
git add app.py config.py manage.py wsgi.py tests/test_app_bootstrap.py
git commit -m "refactor: isolate app bootstrap from production setup"
```

## Task 2: Move Schema And Bootstrap Side Effects Into Explicit Services

**Files:**
- Create: `services/bootstrap_service.py`
- Modify: `app.py`
- Modify: `manage.py`
- Modify: `README.md`
- Test: `tests/test_app_bootstrap.py`

- [ ] **Step 1: Extend tests to cover explicit init behavior**

```python
from click.testing import CliRunner


class BootstrapCommandTests(unittest.TestCase):
    def test_init_admin_command_creates_admin_explicitly(self) -> None:
        from manage import app

        runner = CliRunner()
        result = runner.invoke(args=["init-admin"])
        self.assertEqual(result.exit_code, 0)

        with app.app_context():
            from models.user import User

            self.assertIsNotNone(User.query.filter_by(username="admin").first())
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest tests.test_app_bootstrap.BootstrapCommandTests -v`
Expected: FAIL because explicit bootstrap services/commands are not fully implemented yet.

- [ ] **Step 3: Implement explicit bootstrap service**

```python
# services/bootstrap_service.py
from sqlalchemy import inspect, text

from models import db
from models.user import User


def initialize_database() -> None:
    db.create_all()
    ensure_schema_compatibility()


def ensure_default_admin() -> None:
    admin = User.query.filter_by(username="admin").first()
    if admin:
        return
    admin = User(username="admin", role="admin")
    admin.set_password("admin123")
    db.session.add(admin)
    db.session.commit()


def ensure_schema_compatibility() -> None:
    inspector = inspect(db.engine)
    columns = {c["name"] for c in inspector.get_columns("departments")}
    if "parent_id" not in columns:
        db.session.execute(text("ALTER TABLE departments ADD COLUMN parent_id INTEGER"))
    db.session.commit()
```

- [ ] **Step 4: Wire commands and update docs**

```markdown
# README.md production section excerpt
1. Run database/bootstrap commands explicitly:
   - `flask --app manage.py init-db`
   - `flask --app manage.py init-admin`
2. Start the service with:
   - `python -m waitress --host=0.0.0.0 --port=5000 wsgi:app`
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m unittest tests.test_app_bootstrap -v`
Expected: PASS

- [ ] **Step 6: Verify CLI commands are discoverable**

Run: `flask --app manage.py --help`
Expected: output includes `init-db` and `init-admin`.

- [ ] **Step 7: Commit**

```bash
git add services/bootstrap_service.py manage.py README.md tests/test_app_bootstrap.py
git commit -m "feat: add explicit bootstrap and init commands"
```

## Task 3: Decompose Admin Routes Without Breaking The Blueprint Contract

**Files:**
- Create: `routes/admin_accounts.py`
- Create: `routes/admin_attendance_overrides.py`
- Create: `routes/admin_imports.py`
- Modify: `routes/__init__.py`
- Modify: `routes/admin.py`
- Test: `tests/test_attendance_override_features.py`

- [ ] **Step 1: Write a regression test that proves the blueprint contract stays intact**

```python
class AdminRouteRegistrationTests(unittest.TestCase):
    def test_employee_override_endpoint_still_exists(self) -> None:
        response = self.client.get(
            f"/admin/employee-attendance-overrides/history?month=2026-05"
        )
        self.assertEqual(response.status_code, 200)
```

- [ ] **Step 2: Run the targeted test to verify the current behavior**

Run: `python -m unittest tests.test_attendance_override_features.AttendanceOverrideFeatureTests.test_employee_history_lists_all_overrides_in_month -v`
Expected: PASS before the refactor, establishing the baseline route behavior.

- [ ] **Step 3: Extract attendance override routes first**

```python
# routes/admin_attendance_overrides.py
from flask import Blueprint

admin_attendance_overrides_bp = Blueprint("admin_attendance_overrides", __name__)


def register_admin_attendance_override_routes(admin_bp: Blueprint) -> None:
    @admin_bp.get("/employee-attendance-overrides/history")
    def employee_override_history():
        ...

    @admin_bp.put("/employee-attendance-overrides/record")
    def save_employee_override():
        ...
```

- [ ] **Step 4: Extract import-heavy routes second**

```python
# routes/admin_imports.py
from flask import Blueprint


def register_admin_import_routes(admin_bp: Blueprint) -> None:
    @admin_bp.post("/import")
    def import_files():
        ...

    @admin_bp.get("/departments/template")
    def departments_template():
        ...
```

- [ ] **Step 5: Register extracted route groups from the existing admin blueprint**

```python
# routes/admin.py
from .admin_accounts import register_admin_account_routes
from .admin_attendance_overrides import register_admin_attendance_override_routes
from .admin_imports import register_admin_import_routes

admin_bp = Blueprint("admin", __name__, url_prefix="/admin")

register_admin_account_routes(admin_bp)
register_admin_attendance_override_routes(admin_bp)
register_admin_import_routes(admin_bp)
```

- [ ] **Step 6: Run the focused regression tests**

Run: `python -m unittest tests.test_attendance_override_features -v`
Expected: PASS, with attendance-override and departments template routes still behaving the same from the caller perspective.

- [ ] **Step 7: Commit**

```bash
git add routes/__init__.py routes/admin.py routes/admin_accounts.py routes/admin_attendance_overrides.py routes/admin_imports.py tests/test_attendance_override_features.py
git commit -m "refactor: split high-risk admin routes by responsibility"
```

## Task 4: Split Import Normalization From Persistence

**Files:**
- Create: `services/import_pipeline.py`
- Create: `tests/test_import_pipeline.py`
- Modify: `services/import_service.py`
- Test: `tests/test_attendance_override_features.py`

- [ ] **Step 1: Write failing tests for file normalization and cleanup boundaries**

```python
import tempfile
import unittest
from unittest import mock

from services.import_pipeline import normalize_import_rows


class ImportPipelineTests(unittest.TestCase):
    def test_xls_fallback_uses_conversion_when_primary_reader_returns_no_rows(self) -> None:
        with mock.patch("services.import_pipeline.ExcelParser.read_rows", return_value=[]):
            with mock.patch("services.import_pipeline.convert_xls_to_xlsx", return_value=("tmp.xlsx", "tmpdir")):
                rows, cleanup_dir = normalize_import_rows("sample.xls")
        self.assertEqual(rows, [])
        self.assertEqual(cleanup_dir, "tmpdir")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest tests.test_import_pipeline -v`
Expected: FAIL because the new pipeline module does not exist yet.

- [ ] **Step 3: Create the normalization helper module**

```python
# services/import_pipeline.py
from typing import Any

from utils.excel_parser import ExcelParser


def normalize_import_rows(file_path: str) -> tuple[list[list[Any]], str | None]:
    rows = ExcelParser.read_rows(file_path)
    cleanup_dir = None
    if rows or not file_path.lower().endswith(".xls"):
        return rows, cleanup_dir
    converted_path, cleanup_dir = convert_xls_to_xlsx(file_path)
    if not converted_path:
        return [], None
    return ExcelParser.read_rows(converted_path), cleanup_dir
```

- [ ] **Step 4: Delegate import service orchestration to the pipeline module**

```python
# services/import_service.py excerpt
from services.import_pipeline import normalize_import_rows


rows, cleanup_dir = normalize_import_rows(file_path)
if not rows:
    return {"status": "error", "message": "Empty file or unsupported xls structure"}
```

- [ ] **Step 5: Run focused import and override tests**

Run: `python -m unittest tests.test_import_pipeline tests.test_attendance_override_features.AttendanceOverrideFeatureTests.test_employee_import_only_overrides_provided_values -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add services/import_pipeline.py services/import_service.py tests/test_import_pipeline.py tests/test_attendance_override_features.py
git commit -m "refactor: separate import normalization from persistence"
```

## Task 5: Batch Attendance Summary Work And Reduce Repeated Queries

**Files:**
- Create: `services/attendance_summary_service.py`
- Create: `tests/test_attendance_summary_service.py`
- Modify: `services/attendance_service.py`
- Test: `tests/test_manager_attendance_service.py`

- [ ] **Step 1: Write failing tests for batched summary retrieval**

```python
import unittest
from unittest import mock

from services.attendance_summary_service import monthly_summary_batch


class AttendanceSummaryBatchTests(unittest.TestCase):
    def test_monthly_summary_batch_uses_single_view_lookup_for_multiple_employees(self) -> None:
        employees = [mock.Mock(id=1), mock.Mock(id=2)]
        with mock.patch("services.attendance_summary_service.attendance_views_by_employee", return_value={1: [], 2: []}) as mocked:
            monthly_summary_batch("2026-05", employees)
        mocked.assert_called_once()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest tests.test_attendance_summary_service -v`
Expected: FAIL because the batched summary module does not exist yet.

- [ ] **Step 3: Implement the batched summary helper**

```python
# services/attendance_summary_service.py
from services.attendance_source_service import EMPLOYEE_STATS_CONTEXT, attendance_views_by_employee


def monthly_summary_batch(month: str, employees: list) -> dict[int, dict]:
    rows_by_employee = attendance_views_by_employee(month, employees, EMPLOYEE_STATS_CONTEXT)
    summaries = {}
    for employee in employees:
        rows = rows_by_employee.get(employee.id, [])
        summaries[employee.id] = {
            "expected_hours": sum(float(row.expected_hours or 0) for row in rows),
            "actual_hours": sum(float(row.actual_hours or 0) for row in rows),
            "absent_hours": sum(float(row.absent_hours or 0) for row in rows),
            "leave_hours": sum(float(row.leave_hours or 0) for row in rows),
            "overtime_hours": sum(float(row.overtime_hours or 0) for row in rows),
            "late_minutes": sum(int(row.late_minutes or 0) for row in rows),
            "early_leave_minutes": sum(int(row.early_leave_minutes or 0) for row in rows),
        }
    return summaries
```

- [ ] **Step 4: Delegate single-employee calls to the batched helper**

```python
# services/attendance_service.py excerpt
from services.attendance_summary_service import monthly_summary_batch


employee = Employee.query.get(emp_id)
if not employee:
    ...
summary = monthly_summary_batch(month, [employee]).get(employee.id, {})
```

- [ ] **Step 5: Run the summary and manager-attendance tests**

Run: `python -m unittest tests.test_attendance_summary_service tests.test_manager_attendance_service -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add services/attendance_summary_service.py services/attendance_service.py tests/test_attendance_summary_service.py tests/test_manager_attendance_service.py
git commit -m "perf: batch attendance summary lookups"
```

## Task 6: Add Production Diagnostics And Windows-First Runbook Updates

**Files:**
- Modify: `app.py`
- Modify: `README.md`
- Modify: `scripts/windows/bootstrap_windows.ps1`
- Modify: `scripts/windows/install_service.ps1`
- Test: `tests/test_app_bootstrap.py`

- [ ] **Step 1: Add a failing health-check test**

```python
class HealthcheckTests(unittest.TestCase):
    def test_health_endpoint_returns_ok(self) -> None:
        app = create_app()
        client = app.test_client()
        response = client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["status"], "ok")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest tests.test_app_bootstrap.HealthcheckTests -v`
Expected: FAIL because `/health` does not exist yet.

- [ ] **Step 3: Implement the minimal diagnostic endpoint and document the runbook**

```python
# app.py excerpt
from flask import jsonify


def create_app() -> Flask:
    app = Flask(__name__)
    ...

    @app.get("/health")
    def healthcheck():
        return jsonify({"status": "ok"})

    return app
```

```powershell
# scripts/windows/install_service.ps1 excerpt
$PythonExe = Join-Path $ProjectRoot ".venv-win-prod\Scripts\python.exe"
$AppTarget = "wsgi:app"
$AppArgs = "-m waitress --host=0.0.0.0 --port=$Port $AppTarget"
```

```markdown
# README.md deployment excerpt
- Verify app health: `curl http://127.0.0.1:5000/health`
- Start production server: `.\.venv-win-prod\Scripts\python.exe -m waitress --host=0.0.0.0 --port=5000 wsgi:app`
```

- [ ] **Step 4: Run validation tests and command smoke checks**

Run: `python -m unittest tests.test_app_bootstrap -v`
Expected: PASS

Run: `python -m unittest discover -s tests -v`
Expected: PASS, or only known pre-existing unrelated failures if identified before this task begins.

- [ ] **Step 5: Commit**

```bash
git add app.py README.md scripts/windows/bootstrap_windows.ps1 scripts/windows/install_service.ps1 tests/test_app_bootstrap.py
git commit -m "docs: align production runbook with shared wsgi entrypoint"
```

## Self-Review

### Spec Coverage

- Production-safe bootstrap/config is covered by Task 1.
- Explicit schema/bootstrap operations are covered by Task 2.
- Admin route decomposition is covered by Task 3.
- Import pipeline reshaping is covered by Task 4.
- Summary/query hotspot optimization is covered by Task 5.
- Diagnostics, Windows runbook updates, and verification are covered by Task 6.

No spec requirement is currently uncovered.

### Placeholder Scan

- The plan contains no `TBD`, `TODO`, or "implement later" placeholders.
- Each task has specific files, commands, and expected verification results.
- Code-bearing steps include concrete example code instead of narrative-only instructions.

### Type Consistency

- `create_app`, `init-db`, `init-admin`, `monthly_summary_batch`, and `normalize_import_rows` are used consistently across tasks.
- Route decomposition preserves the existing `admin_bp` blueprint contract instead of introducing parallel URL prefixes.

