# Product Shell And Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build phase 1 of the full-page UI redesign: a productized module shell, permission-aware module navigation, module home pages, and shared design-system styles.

**Architecture:** Keep existing business URLs and page JavaScript intact. Add a small navigation configuration helper, a lightweight module-home blueprint, Jinja partials for shell navigation, and CSS for module navigation/home components. Tests lock structure and permission filtering before implementation.

**Tech Stack:** Flask, Jinja2, Bootstrap 5, vanilla JavaScript, CSS, `unittest`/`pytest`.

---

## File Structure

- Create `utils/app_navigation.py`: single source of truth for product modules, page entries, permission filtering, and current-module detection.
- Create `routes/module.py`: lightweight `/module/<slug>` product entry routes.
- Modify `routes/__init__.py`: register module blueprint and inject `app_nav` into templates.
- Create `templates/partials/app_nav.html`: render desktop top module nav, module sidebar, and mobile bottom module nav.
- Create `templates/module_home.html`: shared module home template.
- Modify `templates/base.html`: replace old fixed sidebar groups with partial-driven module shell.
- Modify `static/css/style.css`: add module shell, module home, entry card, status card, and bottom nav styles.
- Modify `static/js/ui_phase3.js`: keep sidebar state behavior compatible with the new nav structure.
- Modify `tests/test_attendance_override_features.py`: add product shell, module home, and permission filtering smoke tests.

Do not modify attendance calculation services, import parsing, database models, existing business endpoint responses, or page-specific JavaScript behavior.

---

### Task 1: Add product navigation model and permission tests

**Files:**
- Create: `utils/app_navigation.py`
- Modify: `tests/test_attendance_override_features.py`
- Test: `tests/test_attendance_override_features.py`

- [ ] **Step 1: Add navigation helper tests**

Add this import near the existing imports in `tests/test_attendance_override_features.py`:

```python
from utils.app_navigation import module_by_slug, nav_context, visible_modules
```

Add these tests after `test_representative_pages_render_workflow_classes`:

```python
    def test_product_navigation_groups_pages_into_modules(self) -> None:
        admin_user = SimpleNamespace(
            username="admin",
            role="admin",
            has_any_page_access=lambda _keys: True,
            can_access_page=lambda _key: True,
        )

        modules = visible_modules(admin_user)
        slugs = [module["slug"] for module in modules]
        self.assertEqual(slugs, ["query", "account", "master-data", "corrections", "settings"])

        query = module_by_slug("query")
        self.assertIsNotNone(query)
        self.assertEqual(query["label"], "查询中心")
        self.assertIn("/employee/dashboard", [entry["href"] for entry in query["entries"]])

        context = nav_context(admin_user, "/admin/departments/manage")
        self.assertEqual(context["current_module"]["slug"], "master-data")
        self.assertIn("/admin/departments/manage", [entry["href"] for entry in context["current_entries"]])

    def test_product_navigation_filters_readonly_permissions(self) -> None:
        readonly_user = SimpleNamespace(
            username="reader",
            role="readonly",
            has_any_page_access=lambda keys: "employee_dashboard" in keys,
            can_access_page=lambda key: key == "employee_dashboard",
        )

        modules = visible_modules(readonly_user)
        self.assertEqual([module["slug"] for module in modules], ["query"])

        context = nav_context(readonly_user, "/employee/dashboard")
        self.assertEqual(context["current_module"]["slug"], "query")
        self.assertEqual([entry["href"] for entry in context["current_entries"]], ["/employee/dashboard"])
```

- [ ] **Step 2: Run the navigation helper tests and verify they fail**

Run:

```bash
python3 -m pytest tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_product_navigation_groups_pages_into_modules tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_product_navigation_filters_readonly_permissions -v
```

Expected:

```text
ERROR ... ModuleNotFoundError: No module named 'utils.app_navigation'
```

- [ ] **Step 3: Create the navigation helper**

Create `utils/app_navigation.py` with this content:

```python
from __future__ import annotations

from copy import deepcopy
from typing import Any


MODULES: list[dict[str, Any]] = [
    {
        "slug": "query",
        "label": "查询中心",
        "short_label": "查询",
        "description": "集中查看员工、管理人员、打卡、异常与汇总下载。",
        "entries": [
            {
                "key": "employee_dashboard",
                "label": "考勤数据查询",
                "href": "/employee/dashboard",
                "permission_key": "employee_dashboard",
                "description": "按账套与员工范围查询最终考勤汇总。",
            },
            {
                "key": "abnormal_query",
                "label": "员工异常查询",
                "href": "/employee/abnormal-query",
                "permission_key": "abnormal_query",
                "description": "查看员工异常考勤与需要关注的数据。",
            },
            {
                "key": "punch_records",
                "label": "打卡数据查询",
                "href": "/employee/punch-records",
                "permission_key": "punch_records",
                "description": "查询原始打卡记录和明细。",
            },
            {
                "key": "department_hours_query",
                "label": "员工部门工时",
                "href": "/employee/department-hours-query",
                "permission_key": "department_hours_query",
                "description": "按部门查看员工工时汇总。",
            },
            {
                "key": "summary_download",
                "label": "汇总下载",
                "href": "/employee/summary-download",
                "permission_key": "summary_download",
                "description": "下载月度考勤汇总文件。",
            },
            {
                "key": "manager_query",
                "label": "管理人员查询",
                "href": "/employee/manager-query",
                "permission_key": "manager_query",
                "description": "查询管理人员月度考勤结果。",
            },
            {
                "key": "manager_overtime_query",
                "label": "管理人员加班查询",
                "href": "/employee/manager-overtime-query",
                "permission_key": "manager_overtime_query",
                "description": "查询管理人员加班记录。",
            },
            {
                "key": "manager_annual_leave_query",
                "label": "管理人员年休查询",
                "href": "/employee/manager-annual-leave-query",
                "permission_key": "manager_annual_leave_query",
                "description": "查询管理人员年休记录。",
            },
            {
                "key": "manager_department_hours_query",
                "label": "管理人员部门工时",
                "href": "/employee/manager-department-hours-query",
                "permission_key": "manager_department_hours_query",
                "description": "按部门查询管理人员工时。",
            },
        ],
    },
    {
        "slug": "account",
        "label": "账套中心",
        "short_label": "账套",
        "description": "维护月度账套、上传原始表并执行计算入库。",
        "entries": [
            {
                "key": "account_dashboard",
                "label": "账套管理",
                "href": "/admin/dashboard",
                "admin_only": True,
                "description": "创建账套、保存参数、上传原始表和查看导入记录。",
            },
        ],
    },
    {
        "slug": "master-data",
        "label": "主数据",
        "short_label": "主数据",
        "description": "维护员工、部门、班次等基础数据。",
        "entries": [
            {
                "key": "employees",
                "label": "员工管理",
                "href": "/admin/employees/manage",
                "admin_only": True,
                "description": "维护员工基础信息、归属部门、班次和统计口径。",
            },
            {
                "key": "departments",
                "label": "部门管理",
                "href": "/admin/departments/manage",
                "admin_only": True,
                "description": "维护部门层级、导入导出组织主数据。",
            },
            {
                "key": "shifts",
                "label": "班次管理",
                "href": "/admin/shifts/manage",
                "admin_only": True,
                "description": "维护班次和工作时段规则。",
            },
        ],
    },
    {
        "slug": "corrections",
        "label": "修正中心",
        "short_label": "修正",
        "description": "处理考勤修正、加班、年休等需要审慎操作的数据。",
        "entries": [
            {
                "key": "employee_attendance_overrides",
                "label": "员工考勤修正",
                "href": "/admin/employee-attendance-overrides",
                "admin_only": True,
                "description": "按员工和月份修正考勤结果并查看历史。",
            },
            {
                "key": "manager_attendance_overrides",
                "label": "管理人员考勤修正",
                "href": "/admin/manager-attendance-overrides",
                "admin_only": True,
                "description": "修正管理人员考勤统计结果。",
            },
            {
                "key": "manager_overtime",
                "label": "管理人员加班",
                "href": "/admin/manager-overtime",
                "admin_only": True,
                "description": "维护管理人员加班信息。",
            },
            {
                "key": "manager_annual_leave",
                "label": "管理人员年休",
                "href": "/admin/manager-annual-leave",
                "admin_only": True,
                "description": "维护管理人员年休信息。",
            },
        ],
    },
    {
        "slug": "settings",
        "label": "系统设置",
        "short_label": "设置",
        "description": "管理账号、角色和页面访问范围。",
        "entries": [
            {
                "key": "accounts",
                "label": "账号管理",
                "href": "/admin/accounts",
                "admin_only": True,
                "description": "维护管理员和只读账号权限。",
            },
        ],
    },
]


def _is_admin(user: Any) -> bool:
    return bool(user and getattr(user, "role", None) == "admin")


def can_access_entry(user: Any, entry: dict[str, Any]) -> bool:
    if not user:
        return False
    if _is_admin(user):
        return True
    if entry.get("admin_only"):
        return False
    permission_key = entry.get("permission_key")
    if permission_key:
        can_access_page = getattr(user, "can_access_page", None)
        return bool(can_access_page and can_access_page(permission_key))
    return False


def visible_entries(user: Any, module: dict[str, Any]) -> list[dict[str, Any]]:
    return [deepcopy(entry) for entry in module.get("entries", []) if can_access_entry(user, entry)]


def visible_modules(user: Any) -> list[dict[str, Any]]:
    modules: list[dict[str, Any]] = []
    for module in MODULES:
        entries = visible_entries(user, module)
        if not entries:
            continue
        copy_module = deepcopy(module)
        copy_module["entries"] = entries
        copy_module["home_href"] = f"/module/{copy_module['slug']}"
        modules.append(copy_module)
    return modules


def module_by_slug(slug: str) -> dict[str, Any] | None:
    for module in MODULES:
        if module["slug"] == slug:
            copy_module = deepcopy(module)
            copy_module["home_href"] = f"/module/{copy_module['slug']}"
            return copy_module
    return None


def module_for_path(path: str) -> dict[str, Any] | None:
    if path.startswith("/module/"):
        slug = path.strip("/").split("/", 1)[1]
        return module_by_slug(slug)
    matches: list[tuple[int, dict[str, Any]]] = []
    for module in MODULES:
        for entry in module["entries"]:
            href = entry["href"]
            if path == href or path.startswith(f"{href}/"):
                matches.append((len(href), module))
    if not matches:
        return None
    return module_by_slug(max(matches, key=lambda item: item[0])[1]["slug"])


def nav_context(user: Any, path: str) -> dict[str, Any]:
    modules = visible_modules(user)
    current_module = module_for_path(path)
    if current_module:
        current_module = next((module for module in modules if module["slug"] == current_module["slug"]), None)
    if current_module is None and modules:
        current_module = modules[0]
    current_entries = visible_entries(user, current_module) if current_module else []
    return {
        "modules": modules,
        "current_module": current_module,
        "current_entries": current_entries,
    }
```

- [ ] **Step 4: Run the navigation helper tests and verify they pass**

Run:

```bash
python3 -m pytest tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_product_navigation_groups_pages_into_modules tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_product_navigation_filters_readonly_permissions -v
```

Expected:

```text
PASSED
```

- [ ] **Step 5: Commit navigation model**

```bash
git add utils/app_navigation.py tests/test_attendance_override_features.py
git commit -m "feat: add product navigation model"
```

---

### Task 2: Add module home routes and shared module home template

**Files:**
- Create: `routes/module.py`
- Create: `templates/module_home.html`
- Modify: `routes/__init__.py`
- Modify: `tests/test_attendance_override_features.py`
- Test: `tests/test_attendance_override_features.py`

- [ ] **Step 1: Add module home route tests**

Add these tests after the navigation helper tests in `tests/test_attendance_override_features.py`:

```python
    def test_module_home_routes_render_accessible_entries(self) -> None:
        res = self.client.get("/module/query")
        self.assertEqual(res.status_code, 200)
        html = res.get_data(as_text=True)
        self.assertIn("module-home", html)
        self.assertIn("查询中心", html)
        self.assertIn("/employee/dashboard", html)

        account_res = self.client.get("/module/account")
        self.assertEqual(account_res.status_code, 200)
        self.assertIn("/admin/dashboard", account_res.get_data(as_text=True))

    def test_module_home_rejects_inaccessible_module(self) -> None:
        with self.app.app_context():
            reader = User(username="reader", role="readonly", page_permissions={"employee_dashboard": True})
            reader.set_password("reader123")
            db.session.add(reader)
            db.session.commit()

        reader_client = self.app.test_client()
        reader_client.post("/login", data={"username": "reader", "password": "reader123"})

        allowed = reader_client.get("/module/query")
        self.assertEqual(allowed.status_code, 200)
        allowed_html = allowed.get_data(as_text=True)
        self.assertIn("/employee/dashboard", allowed_html)
        self.assertNotIn("/employee/abnormal-query", allowed_html)

        denied = reader_client.get("/module/account")
        self.assertEqual(denied.status_code, 403)
```

- [ ] **Step 2: Run module home route tests and verify they fail**

Run:

```bash
python3 -m pytest tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_module_home_routes_render_accessible_entries tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_module_home_rejects_inaccessible_module -v
```

Expected:

```text
FAILED ... 404 != 200
```

- [ ] **Step 3: Create module blueprint**

Create `routes/module.py` with this content:

```python
from __future__ import annotations

from flask import Blueprint, abort, g, render_template

from routes.auth import login_required
from utils.app_navigation import module_by_slug, visible_entries


module_bp = Blueprint("module", __name__, url_prefix="/module")


@module_bp.route("/<slug>")
@login_required
def module_home(slug: str):
    module = module_by_slug(slug)
    if not module:
        abort(404)

    entries = visible_entries(g.current_user, module)
    if not entries:
        abort(403)

    module["entries"] = entries
    module["home_href"] = f"/module/{module['slug']}"
    return render_template("module_home.html", module=module, entries=entries)
```

- [ ] **Step 4: Register module blueprint and nav context**

Update `routes/__init__.py` to:

```python
from flask import g, request

from .auth import auth_bp
from .employee import employee_bp
from .admin import admin_bp
from .module import module_bp
from utils.app_navigation import nav_context


def register_routes(app):
    app.register_blueprint(auth_bp)
    app.register_blueprint(employee_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(module_bp)

    @app.context_processor
    def inject_app_navigation():
        return {"app_nav": nav_context(getattr(g, "current_user", None), request.path)}
```

- [ ] **Step 5: Create shared module home template**

Create `templates/module_home.html` with this content:

```html
{% extends 'base.html' %}
{% block title %}{{ module.label }}{% endblock %}
{% block page_intro %}{{ module.description }}{% endblock %}
{% block content %}
<section class="module-home" data-module="{{ module.slug }}">
  <div class="module-hero">
    <div>
      <div class="module-kicker">Product Module</div>
      <h1 class="module-title">{{ module.label }}</h1>
      <p class="module-description">{{ module.description }}</p>
    </div>
    <div class="module-summary-grid">
      <div class="module-summary-card">
        <span class="module-summary-label">可用入口</span>
        <strong>{{ entries|length }}</strong>
      </div>
      <div class="module-summary-card">
        <span class="module-summary-label">当前模块</span>
        <strong>{{ module.short_label }}</strong>
      </div>
    </div>
  </div>

  <div class="module-section-header">
    <div>
      <h2>功能入口</h2>
      <p>选择一个入口进入具体业务页面。</p>
    </div>
  </div>

  <div class="module-entry-grid">
    {% for entry in entries %}
    <a class="module-entry-card" href="{{ entry.href }}">
      <span class="module-entry-index">{{ "%02d"|format(loop.index) }}</span>
      <span class="module-entry-title">{{ entry.label }}</span>
      <span class="module-entry-desc">{{ entry.description }}</span>
    </a>
    {% endfor %}
  </div>
</section>
{% endblock %}
```

- [ ] **Step 6: Run module home tests and verify they pass**

Run:

```bash
python3 -m pytest tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_module_home_routes_render_accessible_entries tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_module_home_rejects_inaccessible_module -v
```

Expected:

```text
PASSED
```

- [ ] **Step 7: Commit module home routes**

```bash
git add routes/module.py routes/__init__.py templates/module_home.html tests/test_attendance_override_features.py
git commit -m "feat: add product module home routes"
```

---

### Task 3: Replace legacy sidebar groups with module navigation shell

**Files:**
- Create: `templates/partials/app_nav.html`
- Modify: `templates/base.html`
- Modify: `tests/test_attendance_override_features.py`
- Test: `tests/test_attendance_override_features.py`

- [ ] **Step 1: Add shell structure tests**

Replace the body of `test_authenticated_shell_renders_enterprise_navigation` with:

```python
    def test_authenticated_shell_renders_enterprise_navigation(self) -> None:
        project_root = os.path.dirname(os.path.dirname(__file__))
        app = Flask(
            "enterprise_shell_render_test",
            template_folder=os.path.join(project_root, "templates"),
            static_folder=os.path.join(project_root, "static"),
        )
        register_routes(app)

        admin_user = SimpleNamespace(
            username="admin",
            role="admin",
            has_any_page_access=lambda _keys: True,
            can_access_page=lambda _key: True,
        )
        with app.test_request_context("/admin/dashboard"):
            g.current_user = admin_user
            html = render_template("admin/dashboard.html")

        self.assertIn("企业考勤处理中心", html)
        self.assertIn("app-top-modules", html)
        self.assertIn("app-module-sidebar", html)
        self.assertIn("module-bottom-nav", html)
        self.assertIn("/module/query", html)
        self.assertIn("/module/account", html)
        self.assertIn("查询中心", html)
        self.assertIn("账套中心", html)
        self.assertIn("主数据", html)
        self.assertIn("修正中心", html)
        self.assertIn("系统设置", html)
```

Add this test after `test_authenticated_shell_renders_enterprise_navigation`:

```python
    def test_authenticated_shell_hides_restricted_modules_for_readonly_user(self) -> None:
        project_root = os.path.dirname(os.path.dirname(__file__))
        app = Flask(
            "enterprise_shell_readonly_render_test",
            template_folder=os.path.join(project_root, "templates"),
            static_folder=os.path.join(project_root, "static"),
        )
        register_routes(app)

        readonly_user = SimpleNamespace(
            username="reader",
            role="readonly",
            has_any_page_access=lambda keys: "employee_dashboard" in keys,
            can_access_page=lambda key: key == "employee_dashboard",
        )
        with app.test_request_context("/employee/dashboard"):
            g.current_user = readonly_user
            html = render_template("dashboard.html", employees=[])

        self.assertIn("/module/query", html)
        self.assertIn("/employee/dashboard", html)
        self.assertNotIn("/module/account", html)
        self.assertNotIn("/admin/dashboard", html)
        self.assertNotIn("/module/master-data", html)
        self.assertNotIn("/module/corrections", html)
        self.assertNotIn("/module/settings", html)
```

- [ ] **Step 2: Run shell structure tests and verify they fail**

Run:

```bash
python3 -m pytest tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_authenticated_shell_renders_enterprise_navigation tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_authenticated_shell_hides_restricted_modules_for_readonly_user -v
```

Expected:

```text
FAILED ... AssertionError: 'app-top-modules' not found
```

- [ ] **Step 3: Create navigation partial**

Create `templates/partials/app_nav.html` with this content:

```html
<nav class="app-top-modules" aria-label="产品模块">
  {% for module in app_nav.modules %}
  <a
    class="app-top-module {% if app_nav.current_module and app_nav.current_module.slug == module.slug %}is-active{% endif %}"
    href="{{ module.home_href }}"
  >
    <span class="app-top-module-label">{{ module.label }}</span>
  </a>
  {% endfor %}
</nav>

<nav class="app-module-sidebar" aria-label="模块页面">
  {% if app_nav.current_module %}
  <div class="app-module-heading">
    <span class="app-sidebar-title">{{ app_nav.current_module.label }}</span>
    <span class="app-module-subtitle">{{ app_nav.current_module.description }}</span>
  </div>
  {% endif %}
  <div class="app-sidebar-nav">
    {% for entry in app_nav.current_entries %}
    <a
      class="app-side-link {% if request.path == entry.href or request.path.startswith(entry.href ~ '/') %}is-active{% endif %}"
      href="{{ entry.href }}"
      title="{{ entry.label }}"
    >
      <span class="app-side-icon icon-{{ entry.key|replace('_', '-') }}" aria-hidden="true"></span>
      <span class="app-side-label">{{ entry.label }}</span>
    </a>
    {% endfor %}
  </div>
</nav>

<nav class="module-bottom-nav" aria-label="移动端模块导航">
  {% for module in app_nav.modules %}
  <a
    class="module-bottom-link {% if app_nav.current_module and app_nav.current_module.slug == module.slug %}is-active{% endif %}"
    href="{{ module.home_href }}"
  >
    <span class="module-bottom-dot" aria-hidden="true"></span>
    <span>{{ module.short_label }}</span>
  </a>
  {% endfor %}
</nav>
```

- [ ] **Step 4: Replace old sidebar groups in base template**

In `templates/base.html`, remove the old blocks that define:

```html
{% set can_view_manager_group = ... %}
{% set can_view_employee_group = ... %}
...
{% if g.current_user and g.current_user.role == "admin" %}
...
{% endif %}
```

Replace that entire old grouped navigation area with:

```html
    {% include "partials/app_nav.html" %}
```

Keep the existing `.app-sidebar-brand`, `.app-sidebar-footer`, top nav, dialogs, scripts, and content blocks.

- [ ] **Step 5: Run shell structure tests and verify they pass**

Run:

```bash
python3 -m pytest tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_authenticated_shell_renders_enterprise_navigation tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_authenticated_shell_hides_restricted_modules_for_readonly_user -v
```

Expected:

```text
PASSED
```

- [ ] **Step 6: Run full focused tests**

Run:

```bash
python3 -m pytest tests/test_attendance_override_features.py -v
```

Expected:

```text
PASSED
```

- [ ] **Step 7: Commit module shell templates**

```bash
git add templates/base.html templates/partials/app_nav.html tests/test_attendance_override_features.py
git commit -m "feat: render product module shell"
```

---

### Task 4: Add module shell and module home styles

**Files:**
- Modify: `static/css/style.css`
- Modify: `static/js/ui_phase3.js`
- Test: `tests/test_attendance_override_features.py`

- [ ] **Step 1: Add CSS structure smoke assertions**

Add these assertions to `test_authenticated_shell_renders_enterprise_navigation`:

```python
        self.assertIn("app-top-module", html)
        self.assertIn("module-bottom-link", html)
```

Add these assertions to `test_module_home_routes_render_accessible_entries`:

```python
        self.assertIn("module-entry-grid", html)
        self.assertIn("module-summary-grid", html)
```

- [ ] **Step 2: Run updated tests and verify they pass before CSS**

Run:

```bash
python3 -m pytest tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_authenticated_shell_renders_enterprise_navigation tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_module_home_routes_render_accessible_entries -v
```

Expected:

```text
PASSED
```

- [ ] **Step 3: Add module navigation and home CSS**

Append this CSS near the existing shell and page utility styles in `static/css/style.css`:

```css
.app-top-modules {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.app-top-module {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid #d8e1ec;
  border-radius: 999px;
  color: #42556b;
  background: #fff;
  text-decoration: none;
  font-size: 12.5px;
  font-weight: 700;
}

.app-top-module:hover,
.app-top-module.is-active {
  color: #fff;
  background: linear-gradient(135deg, var(--brand-soft), var(--brand-ink));
  border-color: transparent;
}

.app-module-sidebar {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.app-module-heading {
  padding: 0 10px;
}

.app-module-subtitle {
  display: block;
  margin-top: 6px;
  color: rgba(226, 232, 240, 0.62);
  font-size: 11.5px;
  line-height: 1.5;
}

.module-bottom-nav {
  display: none;
}

.module-home {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.module-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, 360px);
  gap: 18px;
  padding: 22px;
  border: 1px solid var(--panel-border);
  border-radius: 22px;
  background:
    linear-gradient(135deg, rgba(36, 59, 99, 0.08), rgba(255, 255, 255, 0.9)),
    #fff;
  box-shadow: var(--shadow-sm);
}

.module-kicker {
  color: var(--brand);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.8px;
  text-transform: uppercase;
}

.module-title {
  margin: 8px 0 0;
  color: var(--brand-ink);
  font-size: 28px;
  font-weight: 850;
}

.module-description {
  max-width: 680px;
  margin: 10px 0 0;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1.7;
}

.module-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.module-summary-card {
  min-height: 94px;
  padding: 14px;
  border: 1px solid rgba(36, 59, 99, 0.12);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.82);
}

.module-summary-label {
  display: block;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
}

.module-summary-card strong {
  display: block;
  margin-top: 10px;
  color: var(--brand-ink);
  font-size: 24px;
}

.module-section-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.module-section-header h2 {
  margin: 0;
  color: var(--text-main);
  font-size: 18px;
  font-weight: 800;
}

.module-section-header p {
  margin: 5px 0 0;
  color: var(--text-muted);
  font-size: 13px;
}

.module-entry-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}

.module-entry-card {
  position: relative;
  min-height: 138px;
  padding: 16px;
  border: 1px solid var(--panel-border);
  border-radius: 18px;
  background: #fff;
  color: var(--text-main);
  text-decoration: none;
  box-shadow: var(--shadow-sm);
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}

.module-entry-card:hover {
  border-color: rgba(36, 59, 99, 0.28);
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.module-entry-index {
  color: rgba(36, 59, 99, 0.38);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.8px;
}

.module-entry-title {
  display: block;
  margin-top: 18px;
  color: var(--brand-ink);
  font-size: 16px;
  font-weight: 800;
}

.module-entry-desc {
  display: block;
  margin-top: 8px;
  color: var(--text-muted);
  font-size: 12.5px;
  line-height: 1.6;
}

@media (max-width: 992px) {
  .app-top-modules {
    display: none;
  }

  .module-bottom-nav {
    position: fixed;
    left: 10px;
    right: 10px;
    bottom: 10px;
    z-index: 1020;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 6px;
    padding: 8px;
    border: 1px solid var(--panel-border);
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.96);
    box-shadow: 0 12px 32px rgba(15, 23, 42, 0.16);
    backdrop-filter: blur(10px);
  }

  .module-bottom-link {
    display: inline-flex;
    min-height: 42px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    border-radius: 12px;
    color: #52657c;
    text-decoration: none;
    font-size: 11.5px;
    font-weight: 700;
  }

  .module-bottom-link.is-active {
    color: #fff;
    background: linear-gradient(135deg, var(--brand-soft), var(--brand-ink));
  }

  .module-bottom-dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: currentColor;
    opacity: 0.8;
  }

  .app-content {
    padding-bottom: 82px;
  }

  .module-hero {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .module-title {
    font-size: 24px;
  }

  .module-summary-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 4: Keep sidebar group JavaScript safe with the new nav**

In `static/js/ui_phase3.js`, no code needs to be removed. Verify the existing query selectors still tolerate the new nav:

```javascript
document.querySelectorAll("[data-sidebar-group]").forEach(...)
document.querySelectorAll("[data-sidebar-toggle]").forEach(...)
```

These selectors should simply find no legacy grouped sidebar elements after Task 3. Do not rewrite them in this task.

- [ ] **Step 5: Run focused tests**

Run:

```bash
python3 -m pytest tests/test_attendance_override_features.py -v
```

Expected:

```text
PASSED
```

- [ ] **Step 6: Commit design system shell styles**

```bash
git add static/css/style.css static/js/ui_phase3.js tests/test_attendance_override_features.py
git commit -m "style: add product shell design system"
```

---

### Task 5: Final verification and local smoke check

**Files:**
- Test: `tests/test_attendance_override_features.py`
- Test: `tests/test_manager_attendance_service.py`

- [ ] **Step 1: Run full available tests**

Run:

```bash
python3 -m pytest tests/test_attendance_override_features.py -v
python3 -m pytest tests/test_manager_attendance_service.py -v
```

Expected:

```text
17 or more attendance override tests pass
3 manager attendance service tests pass
```

- [ ] **Step 2: Start local app on a non-default port**

Run:

```bash
python3 -m flask --app app run --port 5055
```

Expected:

```text
Running on http://127.0.0.1:5055
```

- [ ] **Step 3: Check representative HTTP responses**

In another terminal, run:

```bash
curl -I http://127.0.0.1:5055/login
curl -I http://127.0.0.1:5055/module/query
curl -I http://127.0.0.1:5055/module/account
curl -I http://127.0.0.1:5055/static/css/style.css
```

Expected:

```text
/login returns 200
/module/query redirects to /login when unauthenticated
/module/account redirects to /login when unauthenticated
/static/css/style.css returns 200
```

- [ ] **Step 4: Stop the local app**

Press `Ctrl+C` in the Flask server terminal.

- [ ] **Step 5: Manual visual check**

Open the app in a browser and check these pages:

```text
/login
/module/query
/module/account
/module/master-data
/module/corrections
/module/settings
/employee/dashboard
/admin/dashboard
/admin/departments/manage
/admin/employee-attendance-overrides
```

Expected:

```text
Desktop shows top product modules and module-specific left navigation.
Phone width shows bottom module navigation.
Module home pages show entry cards.
Existing business pages keep their forms, tables, buttons, and scripts.
Restricted users do not see inaccessible modules or entry cards.
```

- [ ] **Step 6: Commit any final verification-only adjustments**

Check whether verification changed files:

```bash
git status --short
```

Expected when no final fix was needed:

```text
No output
```

If `static/css/style.css` changed during final verification, commit it:

```bash
git add static/css/style.css
git commit -m "fix: polish product shell verification"
```

If `static/js/ui_phase3.js` changed during final verification, commit it:

```bash
git add static/js/ui_phase3.js
git commit -m "fix: polish product shell verification"
```

---

## Self-Review Checklist

- Spec coverage: product modules, desktop top navigation, left module navigation, mobile bottom navigation, module homes, permissions, route boundaries, and testing are all covered.
- Scope control: no service, model, import parser, calculation, or existing endpoint response changes are required.
- Type consistency: module `slug`, `label`, `short_label`, `description`, `entries`, `href`, `permission_key`, and `admin_only` are used consistently across helper, route, template, and tests.
- Dependency control: no new frontend dependency or build pipeline is introduced.
- Verification: every implementation task has a focused test or smoke check before commit.
