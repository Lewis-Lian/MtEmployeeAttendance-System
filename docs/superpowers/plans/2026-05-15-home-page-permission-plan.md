# Home Page Permission & Label Text Update — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "首页" as a standalone page permission in account management, and rename "菜单权限" labels to context-appropriate text.

**Architecture:** Add `query_home` permission key to the existing permission catalog, wire it through navigation/route protection/auth, and surface it in the permission selector UI under a new "通用" group. Backward-compat ensures existing users retain home access.

**Tech Stack:** Python/Flask, Jinja2 templates, vanilla JavaScript, SQLAlchemy

---

### Task 1: Add `query_home` permission to the model

**Files:**
- Modify: `models/user.py:7-37` (constants), `models/user.py:69-77` (effective_page_permissions)

- [ ] **Step 1: Add `HOME_PAGE_PERMISSION_KEYS`, update `PAGE_PERMISSION_LABELS` and `ALL_PAGE_PERMISSION_KEYS`**

Edit `models/user.py`, replace the permission constants block:

```python
PAGE_PERMISSION_LABELS = {
    "query_home": "首页",
    "manager_query": "管理人员考勤数据查询",
    "manager_overtime_query": "查询加班",
    "manager_annual_leave_query": "查询年休",
    "manager_department_hours_query": "管理人员部门工时查询",
    "employee_dashboard": "员工考勤数据查询",
    "abnormal_query": "员工异常查询",
    "punch_records": "员工打卡数据查询",
    "department_hours_query": "员工部门工时查询",
    "summary_download": "汇总下载",
}

HOME_PAGE_PERMISSION_KEYS = ("query_home",)

MANAGER_PAGE_PERMISSION_KEYS = (
    "manager_query",
    "manager_overtime_query",
    "manager_annual_leave_query",
    "manager_department_hours_query",
)

EMPLOYEE_PAGE_PERMISSION_KEYS = (
    "employee_dashboard",
    "abnormal_query",
    "punch_records",
    "department_hours_query",
    "summary_download",
)

ALL_PAGE_PERMISSION_KEYS = (
    *HOME_PAGE_PERMISSION_KEYS,
    *MANAGER_PAGE_PERMISSION_KEYS,
    *EMPLOYEE_PAGE_PERMISSION_KEYS,
)
```

- [ ] **Step 2: Add backward-compat logic in `effective_page_permissions()`**

Replace the final return statement in `effective_page_permissions()`:

```python
    def effective_page_permissions(self) -> dict[str, bool]:
        if self.role == "admin":
            return {key: True for key in ALL_PAGE_PERMISSION_KEYS}

        raw = self.page_permissions if isinstance(self.page_permissions, dict) else None
        if raw is None:
            return {key: True for key in ALL_PAGE_PERMISSION_KEYS}

        result = {}
        for key in ALL_PAGE_PERMISSION_KEYS:
            if key in raw:
                result[key] = bool(raw[key])
            elif key in HOME_PAGE_PERMISSION_KEYS:
                result[key] = True
            else:
                result[key] = False
        return result
```

- [ ] **Step 3: Verify import works**

Run: `python -c "from models.user import PAGE_PERMISSION_LABELS, HOME_PAGE_PERMISSION_KEYS, ALL_PAGE_PERMISSION_KEYS; print(len(ALL_PAGE_PERMISSION_KEYS)); print(PAGE_PERMISSION_LABELS['query_home'])"`

Expected: `10` and `首页`

- [ ] **Step 4: Commit**

```bash
git add models/user.py
git commit -m "feat: add query_home permission key with backward-compat default"
```

---

### Task 2: Update navigation to use new permission key

**Files:**
- Modify: `utils/app_navigation.py:9-12` (QUERY_CENTER_PERMISSION_KEYS), `utils/app_navigation.py:22-30` (home entry)

- [ ] **Step 1: Import `HOME_PAGE_PERMISSION_KEYS` and update `QUERY_CENTER_PERMISSION_KEYS`**

```python
from models.user import EMPLOYEE_PAGE_PERMISSION_KEYS, HOME_PAGE_PERMISSION_KEYS, MANAGER_PAGE_PERMISSION_KEYS

QUERY_CENTER_PERMISSION_KEYS = (
    *HOME_PAGE_PERMISSION_KEYS,
    *EMPLOYEE_PAGE_PERMISSION_KEYS,
    *MANAGER_PAGE_PERMISSION_KEYS,
)
```

- [ ] **Step 2: Change home entry from `requires_any_page_access` to `permission_key`**

```python
        "entries": [
            {
                "key": "query_home",
                "label": "首页",
                "href": "/employee/home",
                "permission_key": "query_home",
                "description": "查看与账号工号匹配的管理人员考勤概览。",
            },
        ],
```

- [ ] **Step 3: Verify import works**

Run: `python -c "from utils.app_navigation import MODULES; print(MODULES[0]['entries'][0].get('permission_key')); print(MODULES[0]['entries'][0].get('requires_any_page_access'))"`

Expected: `query_home` and `None`

- [ ] **Step 4: Commit**

```bash
git add utils/app_navigation.py
git commit -m "feat: gate home navigation entry on query_home permission"
```

---

### Task 3: Update route protection for home page and its APIs

**Files:**
- Modify: `routes/employee.py:871-873`, `routes/employee.py:939-941`, `routes/employee.py:997-999`

- [ ] **Step 1: Update `query_home_page()` route guard**

Replace the `_can_access_query_center()` check:

```python
@employee_bp.route("/home")
@login_required
def query_home_page():
    if not g.current_user.can_access_page("query_home"):
        return render_template("login.html", error="暂无权限访问查询中心"), 403
    return render_template("employee_home.html")
```

- [ ] **Step 2: Update `account_sets_api()` route guard**

```python
@employee_bp.route("/api/account-sets", methods=["GET"])
@login_required
def account_sets_api():
    if not g.current_user.can_access_page("query_home"):
        return jsonify({"error": "Forbidden"}), 403
```

- [ ] **Step 3: Update `home_manager_summary_api()` route guard**

```python
@employee_bp.route("/api/home-manager-summary", methods=["GET"])
@login_required
def home_manager_summary_api():
    if not g.current_user.can_access_page("query_home"):
        return jsonify({"error": "Forbidden"}), 403
```

- [ ] **Step 4: Verify syntax**

Run: `python -c "import routes.employee; print('employee routes loaded')"`

Expected: `employee routes loaded`

- [ ] **Step 5: Commit**

```bash
git add routes/employee.py
git commit -m "feat: protect home page and APIs with query_home permission"
```

---

### Task 4: Update auth login redirect to include home permission

**Files:**
- Modify: `routes/auth.py:10` (import), `routes/auth.py:58` (has_any_page_access check)

- [ ] **Step 1: Update import and `_landing_url_for_user()`**

```python
from models.user import EMPLOYEE_PAGE_PERMISSION_KEYS, HOME_PAGE_PERMISSION_KEYS, MANAGER_PAGE_PERMISSION_KEYS, User
```

```python
def _landing_url_for_user(user: User) -> str:
    if user.role == "admin":
        return url_for("employee.query_home_page")

    if user.has_any_page_access((*HOME_PAGE_PERMISSION_KEYS, *MANAGER_PAGE_PERMISSION_KEYS, *EMPLOYEE_PAGE_PERMISSION_KEYS)):
        return url_for("employee.query_home_page")

    for page_key, endpoint in _DEFAULT_PAGE_ENDPOINTS:
        if user.can_access_page(page_key):
            return url_for(endpoint)
    return url_for("auth.login_page")
```

- [ ] **Step 2: Verify syntax**

Run: `python -c "import routes.auth; print('auth routes loaded')"`

Expected: `auth routes loaded`

- [ ] **Step 3: Commit**

```bash
git add routes/auth.py
git commit -m "feat: include home permission in login landing redirect"
```

---

### Task 5: Pass home page permissions to template and update batch creation

**Files:**
- Modify: `routes/admin_accounts.py:11-16` (_manager_self_query_permissions), `routes/admin_accounts.py:26-38` (accounts_page)

- [ ] **Step 1: Update `_manager_self_query_permissions()` to include home permission**

```python
    def _manager_self_query_permissions() -> dict[str, bool]:
        permissions = {key: False for key in admin_module.ALL_PAGE_PERMISSION_KEYS}
        permissions["query_home"] = True
        for key in admin_module.MANAGER_PAGE_PERMISSION_KEYS:
            permissions[key] = True
        return permissions
```

- [ ] **Step 2: Add `home_page_permissions` to `accounts_page()` template data**

```python
    @admin_bp.route("/accounts")
    @admin_required
    def accounts_page():
        return render_template(
            "admin/accounts.html",
            current_user_id=g.current_user.id,
            home_page_permissions=[
                {"key": key, "label": admin_module.PAGE_PERMISSION_LABELS[key]}
                for key in admin_module.HOME_PAGE_PERMISSION_KEYS
            ],
            manager_page_permissions=[
                {"key": key, "label": admin_module.PAGE_PERMISSION_LABELS[key]}
                for key in admin_module.MANAGER_PAGE_PERMISSION_KEYS
            ],
            employee_page_permissions=[
                {"key": key, "label": admin_module.PAGE_PERMISSION_LABELS[key]}
                for key in admin_module.EMPLOYEE_PAGE_PERMISSION_KEYS
            ],
        )
```

- [ ] **Step 3: Verify syntax**

Run: `python -c "import routes.admin_accounts; print('admin_accounts routes loaded')"`

Expected: `admin_accounts routes loaded`

- [ ] **Step 4: Commit**

```bash
git add routes/admin_accounts.py
git commit -m "feat: pass home page permissions to accounts template"
```

---

### Task 6: Update template — permission catalog and label text

**Files:**
- Modify: `templates/admin/accounts.html:51-57` (create form label+placeholder), `templates/admin/accounts.html:236-242` (edit modal label+placeholder), `templates/admin/accounts.html:106` (batch button), `templates/admin/accounts.html:289-298` (catalog JSON), `templates/admin/accounts.html:404` (modal title)

- [ ] **Step 1: Add home page permissions to the catalog JSON**

Replace the `#accountPermissionCatalog` script block:

```html
<script type="application/json" id="accountPermissionCatalog">
[
  {% for item in home_page_permissions %}
  {"key": "{{ item.key }}", "label": "{{ item.label }}", "group": "通用"}{% if not loop.last or manager_page_permissions|length or employee_page_permissions|length %},{% endif %}
  {% endfor %}
  {% for item in manager_page_permissions %}
  {"key": "{{ item.key }}", "label": "{{ item.label }}", "group": "管理人员"}{% if not loop.last or employee_page_permissions|length %},{% endif %}
  {% endfor %}
  {% for item in employee_page_permissions %}
  {"key": "{{ item.key }}", "label": "{{ item.label }}", "group": "员工"}{% if not loop.last %},{% endif %}
  {% endfor %}
]
</script>
```

- [ ] **Step 2: Update create form label and placeholder**

```html
  <div class="query-filter-field">
    <label class="form-label">账号页面权限</label>
    <div class="input-group input-group-sm">
      <input class="form-control" id="createPermissionInput" placeholder="点击选择页面权限" readonly>
      <button class="btn btn-outline-secondary" id="openCreatePermissionBtn" type="button">选择</button>
    </div>
  </div>
```

- [ ] **Step 3: Update edit modal label and placeholder**

```html
          <div class="mb-3">
            <label class="form-label">编辑页面权限</label>
            <div class="input-group input-group-sm">
              <input class="form-control" id="editPermissionInput" placeholder="点击选择页面权限" readonly>
              <button class="btn btn-outline-secondary" id="openEditPermissionBtn" type="button">选择</button>
            </div>
          </div>
```

- [ ] **Step 4: Update batch button text**

```html
<button class="btn btn-sm btn-outline-secondary" id="openBatchPermissionBtn" type="button">批量修改页面权限</button>
```

- [ ] **Step 5: Update modal title**

```html
<h5 class="modal-title" id="accountPermissionModalTitle">选择页面权限</h5>
```

- [ ] **Step 6: Verify template file is valid**

Run: `python -c "with open('templates/admin/accounts.html') as f: content = f.read(); assert '账号页面权限' in content; assert '编辑页面权限' in content; assert '通用' in content; print('template content verified')"`

Expected: `template content verified`

- [ ] **Step 7: Commit**

```bash
git add templates/admin/accounts.html
git commit -m "feat: add home permission to catalog, update menu permission labels"
```

---

### Task 7: Update JavaScript — PAGE_LABELS and permissionState titles

**Files:**
- Modify: `static/js/accounts.js:2-11` (PAGE_LABELS), `static/js/accounts.js:57-61` (permissionState titles), `static/js/accounts.js:303` (未选择文本), `static/js/accounts.js:643` (已批量更新文本)

- [ ] **Step 1: Add `query_home` to PAGE_LABELS**

```javascript
  const PAGE_LABELS = {
    query_home: "首页",
    manager_query: "管理人员考勤数据查询",
    manager_overtime_query: "查询加班",
    manager_annual_leave_query: "查询年休",
    employee_dashboard: "员工考勤数据查询",
    abnormal_query: "员工异常查询",
    punch_records: "员工打卡数据查询",
    department_hours_query: "员工部门工时查询",
    summary_download: "汇总下载",
  };
```

- [ ] **Step 2: Update permissionState titles**

```javascript
  const permissionState = {
    create: { selectedKeys: new Set(allPermissionKeys), inputEl: createPermissionInput, buttonEl: openCreatePermissionBtn, title: "创建账号页面权限" },
    edit: { selectedKeys: new Set(), inputEl: editPermissionInput, buttonEl: openEditPermissionBtn, title: "编辑页面权限" },
    batch: { selectedKeys: new Set(allPermissionKeys), inputEl: null, buttonEl: openBatchPermissionBtn, title: "批量修改页面权限" },
  };
```

- [ ] **Step 3: Update helper text strings**

Replace `未选择菜单权限` with `未选择页面权限` (in `permissionSummary` function, line ~303).

Replace `已批量更新菜单权限` with `已批量更新页面权限` (in batch confirm handler, line ~643).

- [ ] **Step 4: Verify syntax**

Run: `node -c static/js/accounts.js 2>&1 || echo "node not available, skipping"`

- [ ] **Step 5: Commit**

```bash
git add static/js/accounts.js
git commit -m "feat: add home page label to JS, update permission UI text"
```

---

### Task 8: Update tests for new permission structure

**Files:**
- Modify: `tests/test_attendance_override_features.py:17` (import), `tests/test_attendance_override_features.py:306-397` (batch test), `tests/test_attendance_override_features.py:853-858` (mock user), `tests/test_attendance_override_features.py:1161-1166` (mock user)

- [ ] **Step 1: Update import**

```python
from models.user import EMPLOYEE_PAGE_PERMISSION_KEYS, HOME_PAGE_PERMISSION_KEYS, MANAGER_PAGE_PERMISSION_KEYS, User
```

- [ ] **Step 2: Update both readonly_user mock objects — add `query_home` to `can_access_page`**

Two occurrences, both change from:
```python
    can_access_page=lambda key: key == "employee_dashboard",
```
to:
```python
    can_access_page=lambda key: key in ("employee_dashboard", "query_home"),
```

- [ ] **Step 3: Update batch operations test — add `HOME_PAGE_PERMISSION_KEYS` to all permission key tuples**

In `test_user_batch_operations_support_reset_role_permissions_and_delete`, replace every occurrence of:
```
(*MANAGER_PAGE_PERMISSION_KEYS, *EMPLOYEE_PAGE_PERMISSION_KEYS)
```
with:
```
(*HOME_PAGE_PERMISSION_KEYS, *MANAGER_PAGE_PERMISSION_KEYS, *EMPLOYEE_PAGE_PERMISSION_KEYS)
```

(This appears on 5 lines: the two `page_permissions` dict comprehensions, the `next_permissions` assignment, and the two `effective_page_permissions()` assertions.)

- [ ] **Step 4: Run affected tests**

Run: `pytest tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_product_navigation_filters_readonly_permissions tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_product_navigation_groups_pages_into_modules tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_user_batch_operations_support_reset_role_permissions_and_delete tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_module_home_rejects_inaccessible_module -v --tb=short`

Expected: All 4 tests PASS (teardown PermissionError on Windows is a pre-existing env issue, not a test failure).

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `pytest tests/ -q --ignore=tests/test_app_bootstrap.py`

Expected: No new failures beyond pre-existing env issues.

- [ ] **Step 6: Commit**

```bash
git add tests/test_attendance_override_features.py
git commit -m "test: update permission tests for query_home key"
```

---

### Final Verification

- [ ] Start the app and navigate to account management page
- [ ] Verify create form shows "账号页面权限" label
- [ ] Verify edit modal shows "编辑页面权限" label
- [ ] Open permission selector: "通用" group with "首页" appears first
- [ ] Edit an existing readonly user: "首页" is checked by default
- [ ] Create a readonly user with home unchecked: user cannot access `/employee/home`
- [ ] Create a readonly user with home checked: user sees home page normally
- [ ] Admin users unaffected — always see everything
