# Query Center Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Query Center pages into a reusable enterprise query workspace with desktop filter rails, responsive mobile filter cards, shared Jinja partials, and a task-oriented Summary Download layout.

**Architecture:** Keep all existing routes, backend APIs, JavaScript files, and DOM ids intact. Add focused Jinja partials under `templates/partials/query/`, migrate page templates into two page models, and append CSS rules to `static/css/style.css`. Tests lock rendered structure and existing ids/scripts before each migration group.

**Tech Stack:** Flask, Jinja2, Bootstrap 5, vanilla JavaScript, CSS, `unittest`/`pytest`.

---

## File Structure

- Create `templates/partials/query/metric_card.html`: reusable metric card.
- Create `templates/partials/query/filter_shell.html`: responsive query filter container.
- Create `templates/partials/query/employee_picker_modal.html`: shared employee/manager picker modal preserving existing ids.
- Create `templates/partials/query/result_panel.html`: reusable table result panel.
- Create `templates/partials/query/download_task_panel.html`: Summary Download task header.
- Modify `templates/dashboard.html`: first table-query sample page.
- Modify `templates/abnormal_query.html`: employee abnormal table-query page.
- Modify `templates/punch_records.html`: punch-record table-query page.
- Modify `templates/summary_download.html`: download task page.
- Modify `templates/department_hours_query.html`: lightweight employee department-hours table-query page.
- Modify `templates/manager_query.html`: manager table-query page.
- Modify `templates/manager_overtime_query.html`: manager annual readonly query page.
- Modify `templates/manager_annual_leave_query.html`: manager annual readonly query page.
- Modify `templates/manager_department_hours_query.html`: lightweight manager department-hours table-query page.
- Modify `static/css/style.css`: Query Center layout, filter rail, download task, result panel, and responsive styles.
- Modify `tests/test_attendance_override_features.py`: structure smoke tests and existing-id/script preservation checks.

Do not modify backend services, route handlers, models, endpoint response formats, query JavaScript behavior, or permission logic.

---

### Task 1: Add Query Center structure smoke tests

**Files:**
- Modify: `tests/test_attendance_override_features.py`
- Test: `tests/test_attendance_override_features.py`

- [ ] **Step 1: Replace the old representative query workflow assertions**

In `tests/test_attendance_override_features.py`, replace the query half of `test_representative_pages_render_workflow_classes`.

Find:

```python
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

Replace with:

```python
        with app.test_request_context("/employee/dashboard"):
            g.current_user = admin_user
            query_html = render_template("dashboard.html", employees=[])

        self.assertIn("account-workflow", admin_html)
        self.assertIn("account-status-card", admin_html)
        self.assertIn("account-audit-card", admin_html)
        self.assertIn("query-page-shell", query_html)
        self.assertIn("query-filter-rail", query_html)
        self.assertIn("query-workspace", query_html)
        self.assertIn("query-metric-grid", query_html)
        self.assertIn("query-result-panel", query_html)
        self.assertIn("employeePickerModal", query_html)
        self.assertIn("static/js/dashboard.js", query_html)
```

- [ ] **Step 2: Add a helper for rendering Query Center templates**

Add this method inside `AttendanceOverrideFeatureTests`, after `test_representative_pages_render_workflow_classes`:

```python
    def render_query_template(self, path: str, template_name: str, **context: object) -> str:
        project_root = os.path.dirname(os.path.dirname(__file__))
        app = Flask(
            f"query_center_render_{template_name.replace('/', '_')}",
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
        with app.test_request_context(path):
            g.current_user = admin_user
            return render_template(template_name, **context)
```

- [ ] **Step 3: Add table-query page structure test**

Add this test after the helper:

```python
    def test_query_center_table_pages_render_query_workspace(self) -> None:
        pages = [
            ("/employee/dashboard", "dashboard.html", {"employees": []}, ["selectedEmpIds", "accountSetSelect", "refreshBtn", "downloadBtn", "finalDataTable", "static/js/dashboard.js"]),
            ("/employee/abnormal-query", "abnormal_query.html", {"employees": []}, ["selectedEmpIds", "accountSetSelect", "queryBtn", "downloadBtn", "abnormalTableBody", "static/js/abnormal_query.js"]),
            ("/employee/punch-records", "punch_records.html", {"employees": []}, ["selectedEmpIds", "accountSetSelect", "queryBtn", "downloadBtn", "punchTableBody", "static/js/punch_records.js"]),
            ("/employee/department-hours-query", "department_hours_query.html", {}, ["accountSetSelect", "queryBtn", "downloadBtn", "departmentHoursBody", "static/js/department_hours_query.js"]),
            ("/employee/manager-query", "manager_query.html", {"employees": []}, ["selectedEmpIds", "managerAccountSetSelect", "managerQueryBtn", "managerDownloadBtn", "managerQueryBody", "static/js/manager_query.js"]),
            ("/employee/manager-overtime-query", "manager_overtime_query.html", {"employees": []}, ["selectedEmpIds", "managerOvertimeQueryYear", "managerOvertimeQueryBtn", "managerOvertimeQueryBody", "static/js/manager_overtime_query.js"]),
            ("/employee/manager-annual-leave-query", "manager_annual_leave_query.html", {"employees": []}, ["selectedEmpIds", "managerAnnualLeaveQueryYear", "managerAnnualLeaveQueryBtn", "managerAnnualLeaveQueryBody", "static/js/manager_annual_leave_query.js"]),
            ("/employee/manager-department-hours-query", "manager_department_hours_query.html", {}, ["accountSetSelect", "queryBtn", "downloadBtn", "managerDepartmentHoursBody", "static/js/manager_department_hours_query.js"]),
        ]

        for path, template_name, context, expected_fragments in pages:
            with self.subTest(template=template_name):
                html = self.render_query_template(path, template_name, **context)
                self.assertIn("query-page-shell", html)
                self.assertIn("query-filter-rail", html)
                self.assertIn("query-workspace", html)
                self.assertIn("query-result-panel", html)
                for fragment in expected_fragments:
                    self.assertIn(fragment, html)
```

- [ ] **Step 4: Add Summary Download structure test**

Add this test after the table-query test:

```python
    def test_summary_download_renders_download_task_layout(self) -> None:
        html = self.render_query_template("/employee/summary-download", "summary_download.html", employees=[])

        self.assertIn("download-page-shell", html)
        self.assertIn("download-task-panel", html)
        self.assertIn("download-report-grid", html)
        self.assertIn("download-header-panel", html)
        self.assertIn("download-help-panel", html)
        self.assertIn("employeePickerModal", html)
        self.assertIn("accountSetSelect", html)
        self.assertIn("selectedEmpIds", html)
        self.assertIn("includeFinalData", html)
        self.assertIn("includePunchRecords", html)
        self.assertIn("downloadBtn", html)
        self.assertIn("finalHeaderCheckboxes", html)
        self.assertIn("punchHeaderCheckboxes", html)
        self.assertIn("static/js/summary_download.js", html)
```

- [ ] **Step 5: Run the new tests and verify they fail**

Run:

```bash
python3 -m pytest tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_representative_pages_render_workflow_classes tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_query_center_table_pages_render_query_workspace tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_summary_download_renders_download_task_layout -v
```

Expected:

```text
FAILED ... AssertionError: 'query-page-shell' not found
FAILED ... AssertionError: 'download-page-shell' not found
```

- [ ] **Step 6: Commit the failing tests**

```bash
git add tests/test_attendance_override_features.py
git commit -m "test: cover query center layout structure"
```

---

### Task 2: Add shared Query Center partials and migrate the dashboard sample

**Files:**
- Create: `templates/partials/query/metric_card.html`
- Create: `templates/partials/query/filter_shell.html`
- Create: `templates/partials/query/employee_picker_modal.html`
- Create: `templates/partials/query/result_panel.html`
- Modify: `templates/dashboard.html`
- Modify: `static/css/style.css`
- Test: `tests/test_attendance_override_features.py`

- [ ] **Step 1: Create the metric card partial**

Create `templates/partials/query/metric_card.html`:

```html
<div class="summary-card dashboard-metric-card query-metric-card">
  <div class="dashboard-metric-label">{{ label }}</div>
  <div class="dashboard-metric-value {% if value_class is defined %}{{ value_class }}{% endif %}" id="{{ value_id }}">{{ value }}</div>
  <div class="dashboard-metric-sub" {% if sub_id is defined %}id="{{ sub_id }}"{% endif %}>{{ sub }}</div>
</div>
```

- [ ] **Step 2: Create the filter shell partial**

Create `templates/partials/query/filter_shell.html`:

```html
<aside class="query-filter-rail">
  <div class="query-filter-heading">
    <span class="query-filter-kicker">{{ kicker|default("Query Filters") }}</span>
    <h2>{{ title|default("查询条件") }}</h2>
    <p>{{ description }}</p>
  </div>
  <div class="query-filter-body">
    {{ body|safe }}
  </div>
</aside>
```

- [ ] **Step 3: Create the employee picker partial**

Create `templates/partials/query/employee_picker_modal.html` by moving the current modal markup from `templates/dashboard.html` into the partial. The partial must keep these ids exactly:

```html
employeePickerModal
employeePickerDeptList
employeePickerSelectVisible
employeePickerSearchInput
employeePickerList
employeePickerSelectedCount
employeePickerClearBtn
employeePickerSelectedList
employeePickerConfirmBtn
```

Use these title variables at the top:

```html
{% set picker_title = picker_title|default("选择员工") %}
{% set picker_search_placeholder = picker_search_placeholder|default("搜索员工编号/姓名") %}
```

The modal title must render:

```html
<h5 class="modal-title">{{ picker_title }}</h5>
```

The search input placeholder must render:

```html
<input type="text" class="form-control form-control-sm" id="employeePickerSearchInput" placeholder="{{ picker_search_placeholder }}">
```

- [ ] **Step 4: Create the result panel partial**

Create `templates/partials/query/result_panel.html`:

```html
<div class="card query-result-panel">
  <div class="card-header d-flex justify-content-between align-items-center">
    <span>{{ title }}</span>
    <div class="small text-muted" id="{{ meta_id }}">{{ meta_text|default("等待查询") }}</div>
  </div>
  <div class="table-responsive query-result-table">
    {{ table|safe }}
  </div>
</div>
```

- [ ] **Step 5: Migrate `templates/dashboard.html`**

Replace the content block in `templates/dashboard.html` with this structure. Keep the existing script block unchanged.

```html
{% block content %}
<div class="query-page-shell">
  {% set filter_body %}
  <div class="query-filter-field">
    <label class="form-label">员工</label>
    <div class="employee-lookup" id="employeeLookup">
      <div class="input-group input-group-sm">
        <input type="text" class="form-control form-control-sm" id="empSearchInput" placeholder="搜索员工编号/姓名" autocomplete="off">
        <button class="btn btn-outline-secondary employee-picker-trigger" type="button" id="openEmployeePickerBtn" title="选择员工">
          <span class="employee-picker-icon" aria-hidden="true">👤</span>
        </button>
      </div>
      <input type="hidden" id="selectedEmpIds">
      <div class="employee-float-list" id="employeeQuickList"></div>
    </div>
  </div>
  <div class="query-filter-field">
    <label class="form-label">账套</label>
    <select class="form-select" id="accountSetSelect"></select>
  </div>
  <div class="query-filter-field">
    <label class="form-label">显示选项</label>
    <div class="dashboard-check-stack">
      <label class="dashboard-check-option">
        <input class="form-check-input m-0" type="checkbox" id="showLeaveCounts">
        <span>请假次数</span>
      </label>
      <label class="dashboard-check-option">
        <input class="form-check-input m-0" type="checkbox" id="showLeaveDurations">
        <span>请假时长</span>
      </label>
    </div>
  </div>
  <div class="query-filter-actions">
    <button class="btn btn-primary" id="refreshBtn">查询</button>
    <button class="btn btn-outline-success" id="downloadBtn">下载XLSX</button>
  </div>
  {% endset %}
  {% with title="查询条件", description="按员工范围、账套和显示列模式组合查询。", body=filter_body %}
    {% include "partials/query/filter_shell.html" %}
  {% endwith %}

  <section class="query-workspace">
    <div class="query-page-heading">
      <span class="query-page-kicker">Query Center</span>
      <h1>考勤数据查询</h1>
      <p>按账套与员工范围查询最终考勤汇总数据。</p>
    </div>

    <div class="query-metric-grid">
      {% with label="已选员工", value_id="metricSelectedEmployees", value="0", sub_id="metricSelectedEmployeesSub", sub="当前未选择员工" %}{% include "partials/query/metric_card.html" %}{% endwith %}
      {% with label="当前账套", value_id="metricAccountSet", value="未选择", value_class="dashboard-metric-text", sub="查询时按所选月度账套取数" %}{% include "partials/query/metric_card.html" %}{% endwith %}
      {% with label="结果记录", value_id="metricResultRows", value="0", sub_id="metricResultRowsSub", sub="点击查询后更新" %}{% include "partials/query/metric_card.html" %}{% endwith %}
      {% with label="显示列模式", value_id="metricColumnMode", value="基础字段", value_class="dashboard-metric-text", sub_id="metricColumnModeSub", sub="未显示请假次数和时长" %}{% include "partials/query/metric_card.html" %}{% endwith %}
    </div>

    {% set result_table %}
    <table class="table table-sm table-striped mb-0" id="finalDataTable">
      <thead id="finalDataHead"></thead>
      <tbody id="finalDataBody"></tbody>
    </table>
    {% endset %}
    {% with title="最终数据工作表", meta_id="finalDataMeta", table=result_table %}
      {% include "partials/query/result_panel.html" %}
    {% endwith %}
  </section>
</div>

{% with picker_title="选择员工", picker_search_placeholder="搜索员工编号/姓名" %}
  {% include "partials/query/employee_picker_modal.html" %}
{% endwith %}
{% endblock %}
```

- [ ] **Step 6: Add initial Query Center CSS**

Append to `static/css/style.css`:

```css
.query-page-shell {
  display: grid;
  grid-template-columns: minmax(260px, 292px) minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.query-filter-rail {
  position: sticky;
  top: 116px;
  display: grid;
  gap: 16px;
  padding: 18px;
  border-radius: 22px;
  color: #ffffff;
  background:
    radial-gradient(180px 140px at 90% 0%, rgba(247, 200, 115, 0.2), transparent 62%),
    linear-gradient(180deg, #17233d, #1d2f4d);
  box-shadow: 0 18px 42px rgba(23, 35, 61, 0.18);
}

.query-filter-kicker,
.query-page-kicker {
  color: rgba(226, 232, 240, 0.7);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1.4px;
  text-transform: uppercase;
}

.query-filter-heading h2 {
  margin: 6px 0 6px;
  font-size: 22px;
  font-weight: 850;
}

.query-filter-heading p {
  margin: 0;
  color: rgba(226, 232, 240, 0.68);
  font-size: 12.5px;
  line-height: 1.6;
}

.query-filter-body {
  display: grid;
  gap: 14px;
}

.query-filter-field {
  display: grid;
  gap: 7px;
}

.query-filter-rail .form-label {
  color: rgba(226, 232, 240, 0.84);
}

.query-filter-rail .form-control,
.query-filter-rail .form-select {
  border-color: rgba(255, 255, 255, 0.18);
  background-color: rgba(255, 255, 255, 0.96);
}

.query-filter-actions {
  display: grid;
  gap: 9px;
  margin-top: 4px;
}

.query-filter-actions .btn {
  width: 100%;
}

.query-workspace {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.query-page-heading {
  padding: 20px 22px;
  border: 1px solid var(--panel-border);
  border-radius: 22px;
  background:
    radial-gradient(280px 160px at 94% 0%, rgba(247, 200, 115, 0.16), transparent 64%),
    linear-gradient(135deg, #ffffff, #f7faff);
  box-shadow: var(--shadow-sm);
}

.query-page-heading .query-page-kicker {
  color: #657895;
}

.query-page-heading h1 {
  margin: 6px 0 6px;
  color: var(--brand-ink);
  font-size: clamp(24px, 3vw, 34px);
  font-weight: 860;
}

.query-page-heading p {
  margin: 0;
  color: #64748b;
  font-size: 14px;
}

.query-metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.query-result-panel {
  overflow: hidden;
}

.query-result-table {
  border-radius: 0;
}

@media (max-width: 1180px) {
  .query-page-shell {
    grid-template-columns: 1fr;
  }

  .query-filter-rail {
    position: static;
    color: var(--text-main);
    background: #ffffff;
    border: 1px solid var(--panel-border);
    box-shadow: var(--shadow-sm);
  }

  .query-filter-kicker {
    color: #657895;
  }

  .query-filter-heading p {
    color: #64748b;
  }

  .query-filter-rail .form-label {
    color: #334155;
  }

  .query-filter-body {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: end;
  }

  .query-filter-actions {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .query-metric-grid,
  .query-filter-body,
  .query-filter-actions {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 7: Run focused tests and verify dashboard now passes**

Run:

```bash
python3 -m pytest tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_representative_pages_render_workflow_classes tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_query_center_table_pages_render_query_workspace -v
```

Expected:

```text
test_representative_pages_render_workflow_classes PASSED
test_query_center_table_pages_render_query_workspace FAILED
```

The remaining failure should be for pages not migrated yet.

- [ ] **Step 8: Commit the partials and dashboard migration**

```bash
git add templates/partials/query/metric_card.html templates/partials/query/filter_shell.html templates/partials/query/employee_picker_modal.html templates/partials/query/result_panel.html templates/dashboard.html static/css/style.css
git commit -m "feat: add query workspace partials"
```

---

### Task 3: Migrate first-batch table query pages

**Files:**
- Modify: `templates/abnormal_query.html`
- Modify: `templates/punch_records.html`
- Test: `tests/test_attendance_override_features.py`

- [ ] **Step 1: Migrate `templates/abnormal_query.html`**

Use the same `.query-page-shell` structure from `dashboard.html`.

Keep these ids unchanged in the filter rail:

```text
employeeLookup
empSearchInput
openEmployeePickerBtn
selectedEmpIds
employeeQuickList
accountSetSelect
toggleEmpNo
queryBtn
downloadBtn
```

Metric cards must use:

```text
metricSelectedEmployees
metricSelectedEmployeesSub
metricAccountSet
metricAbnormalTotal
metricAbnormalTotalSub
metricResultRows
metricResultRowsSub
```

Result table must keep:

```html
<tbody id="abnormalTableBody"></tbody>
```

Include the picker partial:

```html
{% with picker_title="选择员工", picker_search_placeholder="搜索员工编号/姓名" %}
  {% include "partials/query/employee_picker_modal.html" %}
{% endwith %}
```

- [ ] **Step 2: Migrate `templates/punch_records.html`**

Use the same `.query-page-shell` structure.

Keep these ids unchanged in the filter rail:

```text
employeeLookup
empSearchInput
openEmployeePickerBtn
selectedEmpIds
employeeQuickList
accountSetSelect
toggleRawPunch
toggleInOutPunch
queryBtn
downloadBtn
```

Metric cards must use:

```text
metricSelectedEmployees
metricSelectedEmployeesSub
metricAccountSet
metricResultRows
metricResultRowsSub
metricDisplayMode
metricDisplayModeSub
```

Result table must keep:

```html
<tbody id="punchTableBody"></tbody>
```

Include the picker partial:

```html
{% with picker_title="选择员工", picker_search_placeholder="搜索员工编号/姓名" %}
  {% include "partials/query/employee_picker_modal.html" %}
{% endwith %}
```

- [ ] **Step 3: Run focused tests and verify first-batch table pages pass**

Run:

```bash
python3 -m pytest tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_query_center_table_pages_render_query_workspace -v
```

Expected:

```text
FAILED
```

The failure should only mention the remaining unmigrated table query pages: `department_hours_query.html`, `manager_query.html`, `manager_overtime_query.html`, `manager_annual_leave_query.html`, or `manager_department_hours_query.html`.

- [ ] **Step 4: Commit the first-batch table migration**

```bash
git add templates/abnormal_query.html templates/punch_records.html
git commit -m "feat: migrate employee query pages"
```

---

### Task 4: Migrate Summary Download to the download task model

**Files:**
- Create: `templates/partials/query/download_task_panel.html`
- Modify: `templates/summary_download.html`
- Modify: `static/css/style.css`
- Test: `tests/test_attendance_override_features.py`

- [ ] **Step 1: Create the download task panel partial**

Create `templates/partials/query/download_task_panel.html`:

```html
<section class="download-task-panel">
  <div class="download-task-copy">
    <span class="query-page-kicker">Download Task</span>
    <h1>{{ title }}</h1>
    <p>{{ description }}</p>
  </div>
  <div class="download-task-controls">
    {{ body|safe }}
  </div>
</section>
```

- [ ] **Step 2: Migrate `templates/summary_download.html`**

Replace the page root with:

```html
<div class="download-page-shell">
```

The task panel body must keep these ids:

```text
accountSetSelect
employeeLookup
empSearchInput
openEmployeePickerBtn
selectedEmpIds
employeeQuickList
includeFinalData
includePunchRecords
downloadBtn
```

The report cards section must use:

```html
<div class="download-report-grid">
```

The header customization wrapper must use:

```html
<div class="card mb-4 download-header-panel">
```

Keep these ids unchanged:

```text
headerCustomizeBody
toggleAllFinalHeaders
finalHeaderCheckboxes
toggleAllPunchHeaders
punchHeaderCheckboxes
```

The explanation card wrapper must use:

```html
<div class="card download-help-panel">
```

Include the picker partial:

```html
{% with picker_title="选择员工", picker_search_placeholder="搜索员工编号/姓名" %}
  {% include "partials/query/employee_picker_modal.html" %}
{% endwith %}
```

- [ ] **Step 3: Add download layout CSS**

Append to `static/css/style.css`:

```css
.download-page-shell {
  display: grid;
  gap: 18px;
}

.download-task-panel {
  display: grid;
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.4fr);
  gap: 18px;
  padding: 22px;
  border-radius: 24px;
  color: #ffffff;
  background:
    radial-gradient(360px 220px at 92% 0%, rgba(247, 200, 115, 0.22), transparent 64%),
    linear-gradient(135deg, #17233d, #243b63);
  box-shadow: 0 18px 42px rgba(23, 35, 61, 0.18);
}

.download-task-copy h1 {
  margin: 7px 0 7px;
  font-size: clamp(26px, 3.2vw, 38px);
  font-weight: 860;
}

.download-task-copy p {
  margin: 0;
  color: rgba(226, 232, 240, 0.72);
}

.download-task-controls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  align-items: end;
}

.download-task-controls .form-label,
.download-task-controls .form-check-label {
  color: rgba(226, 232, 240, 0.86);
}

.download-report-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.download-report-card {
  padding: 18px;
  border: 1px solid var(--panel-border);
  border-radius: 18px;
  background: #ffffff;
  box-shadow: var(--shadow-sm);
}

.download-help-panel {
  border-color: rgba(240, 184, 79, 0.34);
  background: linear-gradient(180deg, #fffaf0, #ffffff);
}

@media (max-width: 992px) {
  .download-task-panel,
  .download-task-controls,
  .download-report-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 4: Run Summary Download test and verify it passes**

Run:

```bash
python3 -m pytest tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_summary_download_renders_download_task_layout -v
```

Expected:

```text
PASSED
```

- [ ] **Step 5: Commit the Summary Download migration**

```bash
git add templates/partials/query/download_task_panel.html templates/summary_download.html static/css/style.css
git commit -m "feat: migrate summary download layout"
```

---

### Task 5: Migrate remaining Query Center pages

**Files:**
- Modify: `templates/department_hours_query.html`
- Modify: `templates/manager_query.html`
- Modify: `templates/manager_overtime_query.html`
- Modify: `templates/manager_annual_leave_query.html`
- Modify: `templates/manager_department_hours_query.html`
- Test: `tests/test_attendance_override_features.py`

- [ ] **Step 1: Migrate department-hours pages**

Migrate `templates/department_hours_query.html` and `templates/manager_department_hours_query.html` to `.query-page-shell`.

Each filter rail must keep:

```text
accountSetSelect
queryBtn
downloadBtn
```

Each result table body must keep:

```text
departmentHoursBody
managerDepartmentHoursBody
```

These pages do not render `employeePickerModal`.

- [ ] **Step 2: Migrate `templates/manager_query.html`**

Use `.query-page-shell` and the shared employee picker partial with manager copy:

```html
{% with picker_title="选择管理人员", picker_search_placeholder="搜索员工编号/姓名" %}
  {% include "partials/query/employee_picker_modal.html" %}
{% endwith %}
```

Keep these ids unchanged:

```text
employeeLookup
empSearchInput
openEmployeePickerBtn
selectedEmpIds
employeeQuickList
managerAccountSetSelect
showActualAttendanceDaysToggle
managerQueryBtn
managerDownloadBtn
managerMetricAccountSet
managerMetricFactoryRest
managerMetricBenefitDays
managerMetricResultRows
managerMetricResultRowsSub
managerQueryTable
managerQueryHead
managerQueryBody
managerQueryMeta
```

- [ ] **Step 3: Migrate manager annual readonly pages**

Migrate `templates/manager_overtime_query.html` and `templates/manager_annual_leave_query.html`.

Both pages use `.query-page-shell`, the shared employee picker partial with manager copy, and no download button.

Keep these overtime ids unchanged:

```text
managerOvertimeQueryMetricYear
managerOvertimeQueryMetricRows
managerOvertimeQueryMetricRowsSub
managerOvertimeQueryMetricStatus
managerOvertimeQueryYear
managerOvertimeQueryBtn
managerOvertimeQueryMeta
managerOvertimeQueryHead
managerOvertimeQueryBody
```

Keep these annual-leave ids unchanged:

```text
managerAnnualLeaveQueryMetricYear
managerAnnualLeaveQueryMetricRows
managerAnnualLeaveQueryMetricRowsSub
managerAnnualLeaveQueryMetricStatus
managerAnnualLeaveQueryYear
managerAnnualLeaveQueryBtn
managerAnnualLeaveQueryMeta
managerAnnualLeaveQueryHead
managerAnnualLeaveQueryBody
```

- [ ] **Step 4: Run all Query Center structure tests**

Run:

```bash
python3 -m pytest tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_representative_pages_render_workflow_classes tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_query_center_table_pages_render_query_workspace tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_summary_download_renders_download_task_layout -v
```

Expected:

```text
3 passed
```

- [ ] **Step 5: Commit remaining page migrations**

```bash
git add templates/department_hours_query.html templates/manager_query.html templates/manager_overtime_query.html templates/manager_annual_leave_query.html templates/manager_department_hours_query.html
git commit -m "feat: migrate manager query pages"
```

---

### Task 6: Final styling pass and verification

**Files:**
- Modify: `static/css/style.css`
- Test: `tests/test_attendance_override_features.py`, `tests/test_manager_attendance_service.py`

- [ ] **Step 1: Add final responsive and density polish**

Append to `static/css/style.css`:

```css
.query-filter-rail .dashboard-check-option {
  border-color: rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.88);
}

.query-filter-rail .employee-float-list {
  color: var(--text-main);
}

.query-metric-card {
  min-height: 116px;
}

.query-result-panel .card-header {
  min-height: 52px;
}

.query-result-panel .table-responsive {
  max-height: calc(100vh - 330px);
}

@media (max-width: 1180px) {
  .query-filter-rail .dashboard-check-option {
    border-color: #dbe5ef;
    background: #f8fbff;
    color: #334155;
  }

  .query-result-panel .table-responsive {
    max-height: calc(100vh - 280px);
  }
}

@media (max-width: 640px) {
  .query-page-heading,
  .query-filter-rail,
  .download-task-panel {
    border-radius: 18px;
    padding: 16px;
  }

  .download-task-controls .btn,
  .query-filter-actions .btn {
    min-height: 40px;
  }
}
```

- [ ] **Step 2: Run the full focused test file**

Run:

```bash
python3 -m pytest tests/test_attendance_override_features.py -v
```

Expected:

```text
24 passed
```

The exact count may be higher if more tests were added during implementation. Any failure must be fixed before continuing.

- [ ] **Step 3: Run manager service tests**

Run:

```bash
python3 -m pytest tests/test_manager_attendance_service.py -v
```

Expected:

```text
3 passed
```

- [ ] **Step 4: Run local smoke checks**

Start the app:

```bash
python3 -m flask --app app run --port 5055
```

In another terminal, check:

```bash
curl -I http://127.0.0.1:5055/login
curl -I http://127.0.0.1:5055/static/css/style.css
curl -I http://127.0.0.1:5055/employee/dashboard
curl -I http://127.0.0.1:5055/employee/summary-download
```

Expected:

```text
/login -> 200 OK
/static/css/style.css -> 200 OK
/employee/dashboard -> 302 FOUND Location: /login
/employee/summary-download -> 302 FOUND Location: /login
```

Stop the Flask server after the checks.

- [ ] **Step 5: Commit final polish**

If `static/css/style.css` changed in this task:

```bash
git add static/css/style.css
git commit -m "style: polish query center responsive layout"
```

If no files changed, skip the commit.

---

### Task 7: Complete the branch

**Files:**
- No expected file changes
- Test: repository state

- [ ] **Step 1: Verify git status**

Run:

```bash
git status --short
```

Expected: no output.

- [ ] **Step 2: Run final verification commands**

Run:

```bash
python3 -m pytest tests/test_attendance_override_features.py -v
python3 -m pytest tests/test_manager_attendance_service.py -v
```

Expected:

```text
All tests pass
```

- [ ] **Step 3: Use finishing workflow**

Invoke `superpowers:finishing-a-development-branch` and present the standard completion options:

```text
1. Merge back to master locally
2. Push and create a Pull Request
3. Keep the branch as-is
4. Discard this work
```
