# Enterprise UI Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the attendance processing system into a navy, professional finance / HR enterprise back-office UI while preserving existing business behavior.

**Architecture:** Keep the existing Flask + Jinja + Bootstrap structure. Implement the refresh through shared shell/template changes, centralized CSS tokens/components, small responsive-navigation JavaScript, and representative page class adjustments. Avoid route, service, model, and calculation changes.

**Tech Stack:** Flask, Jinja2 templates, Bootstrap 5, vanilla JavaScript, CSS, `unittest` smoke tests.

---

## File Structure

- Modify `templates/base.html`: authenticated app shell, navy sidebar copy, mobile menu trigger, sidebar backdrop.
- Modify `templates/login.html`: formal enterprise login composition and Chinese product positioning.
- Modify `static/css/style.css`: navy design tokens, shell, shared components, login, representative page polish, responsive behavior.
- Modify `static/js/ui_phase3.js`: existing sidebar persistence plus mobile drawer open/close behavior.
- Modify `templates/admin/dashboard.html`: add semantic section classes for account-set workflow panels.
- Modify `templates/dashboard.html`: add semantic classes for attendance query workflow panels.
- Modify `tests/test_attendance_override_features.py`: template smoke tests for the refreshed shell, login page, and representative page classes.

Do not add a frontend build system. Do not change Flask routes, models, import parsing, attendance calculations, or existing endpoint behavior.

---

### Task 1: Lock the refreshed authenticated shell contract

**Files:**
- Modify: `tests/test_attendance_override_features.py`
- Modify: `templates/base.html`
- Modify: `static/js/ui_phase3.js`
- Test: `tests/test_attendance_override_features.py`

- [ ] **Step 1: Add shell smoke tests**

Add these tests after `test_departments_page_renders_with_export_link` in `tests/test_attendance_override_features.py`:

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
        self.assertIn("mobileSidebarBtn", html)
        self.assertIn("sidebarBackdrop", html)
        self.assertIn("app-shell-badge", html)
        self.assertIn("app-sidebar", html)
        self.assertIn("top-nav", html)
```

- [ ] **Step 2: Run the shell smoke test and verify it fails**

Run:

```bash
pytest tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_authenticated_shell_renders_enterprise_navigation -v
```

Expected:

```text
FAILED ... AssertionError: '企业考勤处理中心' not found
```

- [ ] **Step 3: Update the authenticated shell markup**

In `templates/base.html`, make these targeted changes.

Change the brand subtitle:

```html
<div class="app-brand-subtitle">企业考勤处理中心</div>
```

Add a shell badge inside `.app-sidebar-brand`, after `.app-brand-subtitle`:

```html
<div class="app-shell-badge">Finance / HR Console</div>
```

Inside `.top-nav-inner`, before the title block, add the mobile trigger:

```html
<button class="mobile-sidebar-btn" id="mobileSidebarBtn" type="button" aria-label="打开菜单" aria-controls="appSidebar" aria-expanded="false">
  <span></span>
  <span></span>
  <span></span>
</button>
```

Add `id="appSidebar"` to the sidebar element:

```html
<aside class="app-sidebar" id="appSidebar">
```

After `</div>` for `.app-layout`, before the app dialog modal, add:

```html
<div class="sidebar-backdrop" id="sidebarBackdrop" aria-hidden="true"></div>
```

- [ ] **Step 4: Add mobile drawer behavior without changing desktop persistence**

In `static/js/ui_phase3.js`, add these helpers above `document.addEventListener("DOMContentLoaded", () => {`:

```javascript
  function setMobileSidebarOpen(open) {
    document.body.classList.toggle("sidebar-mobile-open", open);
    const btn = document.getElementById("mobileSidebarBtn");
    if (btn) {
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.setAttribute("aria-label", open ? "关闭菜单" : "打开菜单");
    }
  }
```

Inside the `DOMContentLoaded` callback, after the existing `sidebarBtn` binding, add:

```javascript
    const mobileSidebarBtn = document.getElementById("mobileSidebarBtn");
    const sidebarBackdrop = document.getElementById("sidebarBackdrop");
    if (mobileSidebarBtn) {
      mobileSidebarBtn.addEventListener("click", () => {
        setMobileSidebarOpen(!document.body.classList.contains("sidebar-mobile-open"));
      });
    }
    if (sidebarBackdrop) {
      sidebarBackdrop.addEventListener("click", () => setMobileSidebarOpen(false));
    }
    document.querySelectorAll(".app-side-link").forEach((link) => {
      link.addEventListener("click", () => setMobileSidebarOpen(false));
    });
    window.addEventListener("resize", () => {
      if (window.innerWidth > 992) setMobileSidebarOpen(false);
    });
```

- [ ] **Step 5: Run the shell smoke test and verify it passes**

Run:

```bash
pytest tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_authenticated_shell_renders_enterprise_navigation -v
```

Expected:

```text
PASSED
```

- [ ] **Step 6: Commit the shell contract**

```bash
git add tests/test_attendance_override_features.py templates/base.html static/js/ui_phase3.js
git commit -m "feat: add enterprise app shell hooks"
```

---

### Task 2: Apply navy enterprise design tokens and shared component styles

**Files:**
- Modify: `static/css/style.css`
- Test: `tests/test_attendance_override_features.py`

- [ ] **Step 1: Replace the root design tokens**

In `static/css/style.css`, replace the existing `:root` block with:

```css
:root {
  --bg-base: #eef3f8;
  --bg-soft: #f6f8fb;
  --panel: #ffffff;
  --panel-soft: #fafcfe;
  --panel-border: #d8e1ec;
  --text-main: #1f2937;
  --text-muted: #667085;
  --brand: #1d2f4d;
  --brand-ink: #17233d;
  --brand-soft: #243b63;
  --brand-tint: rgba(36, 59, 99, 0.1);
  --accent: #243b63;
  --success: #2f6b4f;
  --warning: #a16207;
  --danger: #b42318;
  --ring: rgba(36, 59, 99, 0.2);
  --shadow-sm: 0 10px 24px rgba(23, 35, 61, 0.07);
  --shadow-md: 0 18px 42px rgba(23, 35, 61, 0.12);
  --radius-md: 12px;
  --radius-lg: 18px;
  --font-ui: "HarmonyOS Sans SC", "Alibaba PuHuiTi 3.0", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", "Source Han Sans SC", sans-serif;
  --table-row-py: 0.58rem;
  --table-row-px: 0.68rem;
  --table-font-size: 12.8px;
}
```

- [ ] **Step 2: Update page background and app shell styles**

Replace the existing `body`, `.app-layout`, `.app-sidebar`, `.app-sidebar-brand`, `.app-brand`, `.app-brand-subtitle`, `.brand-dot`, `.app-side-link`, `.app-side-icon`, `.top-nav`, `.top-nav-inner`, and `.app-content` rules with navy enterprise equivalents. Use this CSS as the implementation target:

```css
body {
  margin: 0;
  font-family: var(--font-ui);
  color: var(--text-main);
  background:
    radial-gradient(760px 460px at 16% -10%, rgba(36, 59, 99, 0.12), transparent 58%),
    linear-gradient(180deg, #f5f7fb 0%, var(--bg-base) 100%);
}

.app-layout {
  display: grid;
  grid-template-columns: 264px minmax(0, 1fr);
  min-height: 100vh;
  transition: grid-template-columns 0.2s ease;
}

.app-sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  padding: 22px 14px 18px;
  background: linear-gradient(180deg, #17233d 0%, #1d2f4d 56%, #15233c 100%);
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 14px 0 34px rgba(23, 35, 61, 0.16);
  display: flex;
  flex-direction: column;
  gap: 18px;
  overflow-y: auto;
  overflow-x: hidden;
}

.app-sidebar-brand {
  padding: 8px 10px 12px;
}

.app-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  letter-spacing: 0.2px;
  color: #ffffff;
  font-weight: 800;
  text-decoration: none;
  margin: 0;
  white-space: nowrap;
}

.app-brand-subtitle {
  margin-top: 8px;
  font-size: 12px;
  color: rgba(226, 232, 240, 0.78);
  padding-left: 23px;
  letter-spacing: 0.4px;
}

.app-shell-badge {
  display: inline-flex;
  margin: 12px 0 0 22px;
  padding: 5px 9px;
  border: 1px solid rgba(226, 232, 240, 0.18);
  border-radius: 999px;
  color: rgba(226, 232, 240, 0.76);
  background: rgba(255, 255, 255, 0.07);
  font-size: 11px;
  letter-spacing: 0.3px;
}

.brand-dot {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: linear-gradient(135deg, #ffffff, #cbd8e6);
  box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.13);
  flex: 0 0 auto;
}

.app-sidebar-title,
.app-sidebar-group-arrow {
  color: rgba(203, 216, 230, 0.64);
}

.app-sidebar-group-toggle:hover {
  background: rgba(255, 255, 255, 0.06);
}

.app-side-link {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 40px;
  border-radius: 11px;
  padding: 0 12px 0 14px;
  text-decoration: none;
  font-size: 13px;
  font-weight: 650;
  color: rgba(226, 232, 240, 0.82);
  transition: background-color 0.2s ease, color 0.2s ease, transform 0.2s ease;
}

.app-side-icon {
  width: 22px;
  height: 22px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(226, 232, 240, 0.9);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  position: relative;
}

.app-side-link:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.08);
}

.app-side-link.is-active {
  color: #17233d;
  background: linear-gradient(90deg, #ffffff, #edf3fa);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.16);
}

.app-side-link.is-active .app-side-icon {
  background: rgba(36, 59, 99, 0.12);
  color: var(--brand);
}

.top-nav {
  position: sticky;
  top: 0;
  z-index: 1030;
  padding: 16px 18px 0;
  background: linear-gradient(180deg, rgba(245, 247, 251, 0.96), rgba(245, 247, 251, 0.76));
  backdrop-filter: blur(8px);
}

.top-nav-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 74px;
  padding: 14px 18px;
  border: 1px solid var(--panel-border);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 8px 24px rgba(23, 35, 61, 0.06);
}

.app-content {
  padding: 18px;
}
```

- [ ] **Step 3: Update shared components**

Keep existing selectors where possible and update the rules for cards, tables, forms, buttons, modals, alerts, `.page-tag`, `.panel-note`, `.toolbar`, `.empty-badge`, and `.table-pager` to use the new tokens. At minimum, ensure these declarations exist:

```css
.card {
  border: 1px solid var(--panel-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  background: var(--panel);
  overflow: visible;
}

.card-header {
  font-weight: 800;
  color: var(--text-main);
  background: linear-gradient(180deg, #ffffff, var(--panel-soft));
  border-bottom: 1px solid #e3eaf3;
  padding: 13px 16px;
}

.table thead th {
  font-size: var(--table-font-size);
  font-weight: 800;
  letter-spacing: 0.2px;
  color: #31445f;
  background: #eef3f8;
  border-bottom-width: 1px;
  border-color: #dbe5ef;
  white-space: nowrap;
  line-height: 1.2;
  padding: var(--table-row-py) var(--table-row-px);
}

.table tbody tr:hover > * {
  --bs-table-accent-bg: rgba(36, 59, 99, 0.06);
}

.btn-primary {
  background: linear-gradient(135deg, var(--brand-soft), var(--brand-ink));
  border: 0;
  box-shadow: 0 8px 18px rgba(23, 35, 61, 0.16);
}

.btn-primary:hover,
.btn-primary:focus {
  background: linear-gradient(135deg, #2b4774, #111c31);
}

.btn-success {
  background: linear-gradient(135deg, #3f7d5f, var(--success));
  border: 0;
}

.btn-warning {
  background: linear-gradient(135deg, #c58b1f, var(--warning));
  border: 0;
  color: #fff;
}

.btn-outline-danger {
  color: var(--danger);
  border-color: rgba(180, 35, 24, 0.35);
}
```

- [ ] **Step 4: Add mobile shell CSS hooks**

Add these rules near the responsive section:

```css
.mobile-sidebar-btn {
  display: none;
  width: 38px;
  height: 38px;
  border: 1px solid var(--panel-border);
  border-radius: 11px;
  background: #fff;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 4px;
}

.mobile-sidebar-btn span {
  width: 16px;
  height: 2px;
  border-radius: 999px;
  background: var(--brand);
}

.sidebar-backdrop {
  display: none;
}

@media (max-width: 992px) {
  .mobile-sidebar-btn {
    display: inline-flex;
    flex: 0 0 auto;
  }

  .app-layout {
    grid-template-columns: 1fr;
  }

  .app-sidebar {
    position: fixed;
    z-index: 1040;
    inset: 0 auto 0 0;
    width: min(82vw, 320px);
    height: 100vh;
    transform: translateX(-104%);
    transition: transform 0.22s ease;
  }

  body.sidebar-mobile-open .app-sidebar {
    transform: translateX(0);
  }

  .sidebar-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1035;
    background: rgba(15, 23, 42, 0.42);
  }

  body.sidebar-mobile-open .sidebar-backdrop {
    display: block;
  }

  .top-nav-inner {
    align-items: flex-start;
  }
}
```

- [ ] **Step 5: Run full focused tests**

Run:

```bash
pytest tests/test_attendance_override_features.py -v
```

Expected:

```text
PASSED
```

- [ ] **Step 6: Commit shared visual system**

```bash
git add static/css/style.css tests/test_attendance_override_features.py
git commit -m "style: refresh enterprise visual system"
```

---

### Task 3: Redesign the login page as the formal product entry

**Files:**
- Modify: `tests/test_attendance_override_features.py`
- Modify: `templates/login.html`
- Modify: `static/css/style.css`
- Test: `tests/test_attendance_override_features.py`

- [ ] **Step 1: Add login smoke test**

Add this test after the shell smoke test in `tests/test_attendance_override_features.py`:

```python
    def test_login_page_renders_enterprise_entry_copy(self) -> None:
        project_root = os.path.dirname(os.path.dirname(__file__))
        app = Flask(
            "enterprise_login_render_test",
            template_folder=os.path.join(project_root, "templates"),
            static_folder=os.path.join(project_root, "static"),
        )

        with app.test_request_context("/login"):
            html = render_template("login.html", error=None)

        self.assertIn("企业考勤处理中心", html)
        self.assertIn("统一处理账套、考勤、人员与部门数据", html)
        self.assertIn("login-brand-panel", html)
        self.assertIn("login-capability-grid", html)
```

- [ ] **Step 2: Run the login smoke test and verify it fails**

Run:

```bash
pytest tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_login_page_renders_enterprise_entry_copy -v
```

Expected:

```text
FAILED ... AssertionError: '企业考勤处理中心' not found
```

- [ ] **Step 3: Update login page copy and structure**

In `templates/login.html`, keep the existing form fields and password-toggle script. Replace only the content inside `<div class="login-shell page-wrap">` with:

```html
  <section class="login-brand-panel">
    <div class="login-brand">
      <span class="brand-dot"></span>
      <span>企业考勤处理中心</span>
    </div>
    <h1 class="login-hero-title">统一处理账套、考勤、人员与部门数据</h1>
    <p class="login-hero-subtitle">面向财务与 HR 场景的内部考勤数据管理平台，支持月度账套、原始表导入、查询下载与权限控制。</p>
    <div class="login-capability-grid">
      <div class="login-hero-point">
        <span class="login-hero-point-icon"></span>
        <span>月度账套闭环管理</span>
      </div>
      <div class="login-hero-point">
        <span class="login-hero-point-icon"></span>
        <span>考勤结果统一查询</span>
      </div>
      <div class="login-hero-point">
        <span class="login-hero-point-icon"></span>
        <span>人员部门权限维护</span>
      </div>
    </div>
  </section>
  <section class="login-panel-wrap">
    <div class="card login-card">
      <div class="card-body">
        <div class="login-panel-top">
          <div class="login-panel-kicker">授权访问</div>
          <h2 class="login-panel-title">账号登录</h2>
          <p class="login-panel-subtitle">请输入用户名和密码进入系统。</p>
        </div>
        {% if error %}
          <div class="alert alert-danger py-2">{{ error }}</div>
        {% endif %}
        <form method="post" action="/login" class="login-form">
          <div class="mb-3">
            <label class="form-label">用户名</label>
            <input type="text" class="form-control" name="username" placeholder="请输入用户名" required>
          </div>
          <div class="mb-4">
            <label class="form-label">密码</label>
            <div class="login-password-field">
              <input type="password" class="form-control" name="password" id="loginPasswordInput" placeholder="请输入密码" required>
              <button class="login-eye-btn" type="button" id="toggleLoginPasswordBtn" aria-label="显示密码">
                <svg class="login-eye-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none">
                  <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path>
                  <circle cx="12" cy="12" r="2.5"></circle>
                  <path class="login-eye-slash" d="M4.5 4.5 19.5 19.5"></path>
                </svg>
              </button>
            </div>
          </div>
          <button type="submit" class="btn btn-primary w-100 login-submit-btn">登录系统</button>
        </form>
        <div class="login-panel-footnote">仅限授权账号访问，所有操作将按角色范围控制。</div>
      </div>
    </div>
  </section>
  <div class="login-backdrop-orb orb-left"></div>
  <div class="login-backdrop-orb orb-right"></div>
```

- [ ] **Step 4: Update login CSS**

In `static/css/style.css`, update the login selectors to use a navy brand panel. Ensure these rules exist:

```css
.login-page {
  min-height: 100vh;
  background:
    radial-gradient(560px 380px at 14% 14%, rgba(36, 59, 99, 0.16), transparent 60%),
    radial-gradient(620px 420px at 90% 12%, rgba(23, 35, 61, 0.12), transparent 62%),
    linear-gradient(180deg, #f6f8fb, #edf2f7);
}

.login-shell {
  position: relative;
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(0, 1.04fr) minmax(420px, 500px);
  gap: 30px;
  align-items: center;
  padding: 48px 64px;
  overflow: hidden;
}

.login-brand-panel {
  position: relative;
  z-index: 1;
  max-width: 640px;
  padding: 34px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 28px;
  color: #fff;
  background: linear-gradient(145deg, #17233d, #243b63);
  box-shadow: var(--shadow-md);
}

.login-brand-panel .login-brand,
.login-brand-panel .login-hero-title {
  color: #fff;
}

.login-brand-panel .login-hero-subtitle {
  color: rgba(226, 232, 240, 0.82);
}

.login-capability-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 26px;
}

.login-brand-panel .login-hero-point {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.9);
}

@media (max-width: 992px) {
  .login-shell {
    grid-template-columns: 1fr;
    padding: 28px 18px;
  }

  .login-brand-panel {
    padding: 24px;
  }

  .login-capability-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 5: Run the login smoke test and full focused tests**

Run:

```bash
pytest tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_login_page_renders_enterprise_entry_copy -v
pytest tests/test_attendance_override_features.py -v
```

Expected:

```text
PASSED
```

- [ ] **Step 6: Commit login refresh**

```bash
git add tests/test_attendance_override_features.py templates/login.html static/css/style.css
git commit -m "style: refresh enterprise login page"
```

---

### Task 4: Add representative workflow classes for account and query pages

**Files:**
- Modify: `tests/test_attendance_override_features.py`
- Modify: `templates/admin/dashboard.html`
- Modify: `templates/dashboard.html`
- Modify: `static/css/style.css`
- Test: `tests/test_attendance_override_features.py`

- [ ] **Step 1: Add representative page smoke tests**

Add this test after the login smoke test in `tests/test_attendance_override_features.py`:

```python
    def test_representative_pages_render_workflow_classes(self) -> None:
        project_root = os.path.dirname(os.path.dirname(__file__))
        app = Flask(
            "enterprise_workflow_render_test",
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
            admin_html = render_template("admin/dashboard.html")

        with app.test_request_context("/employee/dashboard"):
            g.current_user = admin_user
            query_html = render_template("dashboard.html", employees=[])

        self.assertIn("account-workflow", admin_html)
        self.assertIn("account-status-card", admin_html)
        self.assertIn("account-audit-card", admin_html)
        self.assertIn("query-workflow", query_html)
        self.assertIn("query-filter-card", query_html)
        self.assertIn("query-result-card", query_html)
```

- [ ] **Step 2: Run the representative page test and verify it fails**

Run:

```bash
pytest tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_representative_pages_render_workflow_classes -v
```

Expected:

```text
FAILED ... AssertionError: 'account-workflow' not found
```

- [ ] **Step 3: Add account workflow classes**

In `templates/admin/dashboard.html`:

Change the outer row:

```html
<div class="row g-4 account-workflow">
```

Add `account-status-card` to the first account-set card:

```html
<div class="card account-status-card">
```

Add `account-import-card` to the import card:

```html
<div class="card account-import-card">
```

Add `account-audit-card` to the import records card:

```html
<div class="card table-wrap-tight account-audit-card">
```

- [ ] **Step 4: Add attendance query workflow classes**

In `templates/dashboard.html`:

Wrap the metric row and following query/result cards in a container:

```html
<div class="query-workflow">
```

Close it before `{% endblock %}`.

Add `query-filter-card` to the query condition card:

```html
<div class="card mb-4 query-filter-card">
```

Add `query-result-card` to the final data card:

```html
<div class="card query-result-card">
```

- [ ] **Step 5: Add representative page polish CSS**

Add these rules near the page-specific utility section in `static/css/style.css`:

```css
.account-workflow .card-header,
.query-workflow .card-header {
  min-height: 48px;
}

.account-status-card .card-header,
.query-filter-card .card-header {
  border-bottom-color: rgba(36, 59, 99, 0.12);
}

.account-import-card .panel-note {
  background: #f4f7fb;
  border-color: #cfdae8;
}

.account-audit-card .table-responsive,
.query-result-card .table-responsive {
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}

.query-workflow .summary-card {
  border: 1px solid var(--panel-border);
  background: linear-gradient(180deg, #ffffff, #f8fbfe);
}
```

- [ ] **Step 6: Run representative page test and full focused tests**

Run:

```bash
pytest tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_representative_pages_render_workflow_classes -v
pytest tests/test_attendance_override_features.py -v
```

Expected:

```text
PASSED
```

- [ ] **Step 7: Commit representative page hooks**

```bash
git add tests/test_attendance_override_features.py templates/admin/dashboard.html templates/dashboard.html static/css/style.css
git commit -m "style: add enterprise workflow page hooks"
```

---

### Task 5: Final responsive polish and manual verification

**Files:**
- Modify: `static/css/style.css`
- Modify: `static/js/ui_phase3.js`
- Test: `tests/test_attendance_override_features.py`

- [ ] **Step 1: Add phone-width component CSS**

In `static/css/style.css`, add this final responsive block after existing media queries:

```css
@media (max-width: 640px) {
  .top-nav {
    padding: 10px 10px 0;
  }

  .top-nav-inner {
    gap: 12px;
    min-height: auto;
    padding: 12px;
    border-radius: 14px;
  }

  .top-nav-title {
    font-size: 16px;
  }

  .top-nav-subtitle {
    font-size: 12px;
  }

  .top-nav-actions {
    gap: 8px;
  }

  .app-content {
    padding: 12px 10px;
  }

  .card-header {
    align-items: flex-start !important;
    flex-direction: column;
    gap: 8px;
  }

  .toolbar {
    width: 100%;
  }

  .toolbar .btn,
  .toolbar .form-select {
    flex: 1 1 auto;
  }

  .dashboard-action-group {
    width: 100%;
  }

  .dashboard-action-group .btn {
    width: 100%;
  }

  .table-responsive {
    max-height: calc(100vh - 220px);
  }
}
```

- [ ] **Step 2: Ensure mobile drawer closes on Escape**

In `static/js/ui_phase3.js`, inside `DOMContentLoaded`, after the resize listener from Task 1, add:

```javascript
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setMobileSidebarOpen(false);
    });
```

- [ ] **Step 3: Run automated tests**

Run:

```bash
pytest tests/test_attendance_override_features.py -v
pytest tests/test_manager_attendance_service.py -v
```

Expected:

```text
PASSED
```

- [ ] **Step 4: Start the app for manual visual verification**

Run:

```bash
python3 app.py
```

Expected:

```text
 * Running on
```

If dependencies are missing, run the project’s existing setup command first:

```bash
pip install -r requirements.txt
```

- [ ] **Step 5: Manually inspect representative pages**

Open the app in a browser and verify these pages:

```text
/login
/admin/dashboard
/employee/dashboard
/admin/departments/manage
/admin/employees/manage
/admin/employee-attendance-overrides
```

Expected visual results:

```text
Login page shows navy enterprise entry panel and usable login form.
Authenticated pages show dark navy sidebar, light top nav, and consistent cards.
Current navigation item is easy to identify.
Buttons use navy primary, neutral secondary, and restrained danger hierarchy.
Tables remain readable and horizontally scrollable when needed.
Modal, toast, and result-panel styling remains usable.
```

- [ ] **Step 6: Check responsive behavior**

Use browser responsive widths:

```text
1440px desktop
1024px tablet
390px phone
```

Expected:

```text
Desktop uses fixed sidebar.
Tablet and phone show mobile menu button.
Mobile drawer opens and closes via button, backdrop, nav link click, and Escape.
Query forms stack without breaking.
Tables scroll horizontally instead of expanding the page.
```

- [ ] **Step 7: Commit final responsive polish**

```bash
git add static/css/style.css static/js/ui_phase3.js
git commit -m "style: polish responsive enterprise UI"
```

---

## Self-Review Checklist

- Spec coverage: global visual upgrade, navy color, finance / HR tone, shell, components, login, representative account/query pages, offline-friendly no-build strategy, and mobile query usability are covered.
- Scope control: no routes, models, services, import parsing, or calculation code are modified.
- Verification: each implementation task has tests or explicit manual checks.
- Dependencies: no new dependency is required by this plan.
- Risk: CSS changes are broad, so commits are staged and representative pages are inspected before completion.
