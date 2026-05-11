# Query Center Taskbar Adjustment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove duplicated Query Center in-page titles and restyle table-query filters as a light top taskbar instead of a left dark rail.

**Architecture:** Keep existing Query Center partials, page templates, JavaScript files, DOM ids, routes, and backend behavior. Update smoke tests to require no `.query-page-heading`, remove those heading blocks from table-query templates, and adjust CSS so `.query-filter-rail` becomes a single-column top taskbar.

**Tech Stack:** Flask, Jinja2, Bootstrap 5, CSS, `unittest`/`pytest`.

---

## File Structure

- Modify `tests/test_attendance_override_features.py`: assert table query pages no longer render duplicate in-page heading cards.
- Modify Query Center table templates: remove `.query-page-heading` blocks from eight table-query pages.
- Modify `static/css/style.css`: make `.query-page-shell` single-column and restyle `.query-filter-rail` as a light top taskbar.

Do not modify JavaScript, backend endpoints, route handlers, models, permissions, or existing DOM ids.

---

### Task 1: Add no-duplicate-heading test

**Files:**
- Modify: `tests/test_attendance_override_features.py`
- Test: `tests/test_attendance_override_features.py`

- [ ] **Step 1: Update table-query structure test**

In `test_query_center_table_pages_render_query_workspace`, after:

```python
                self.assertIn("query-result-panel", html)
```

add:

```python
                self.assertNotIn("query-page-heading", html)
                self.assertNotIn("Query Center", html)
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
python3 -m pytest tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_query_center_table_pages_render_query_workspace -v
```

Expected:

```text
FAILED with AssertionError because 'query-page-heading' is still rendered
```

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/test_attendance_override_features.py
git commit -m "test: require query pages without duplicate heading"
```

---

### Task 2: Remove table-query in-page heading blocks

**Files:**
- Modify: `templates/dashboard.html`
- Modify: `templates/abnormal_query.html`
- Modify: `templates/punch_records.html`
- Modify: `templates/department_hours_query.html`
- Modify: `templates/manager_query.html`
- Modify: `templates/manager_overtime_query.html`
- Modify: `templates/manager_annual_leave_query.html`
- Modify: `templates/manager_department_hours_query.html`
- Test: `tests/test_attendance_override_features.py`

- [ ] **Step 1: Remove `.query-page-heading` from all table-query templates**

In each listed template, remove the entire `query-page-heading` div block. The block starts with:

```html
    <div class="query-page-heading">
      <span class="query-page-kicker">Query Center</span>
```

and ends at the first closing `</div>` after the page-specific `<p>` description inside that heading block.

Keep the surrounding section:

```html
  <section class="query-workspace">
```

and keep metric grids, result panels, filters, ids, and scripts unchanged.

- [ ] **Step 2: Run focused test and verify it passes**

Run:

```bash
python3 -m pytest tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_query_center_table_pages_render_query_workspace -v
```

Expected:

```text
PASSED
```

- [ ] **Step 3: Commit template cleanup**

```bash
git add templates/dashboard.html templates/abnormal_query.html templates/punch_records.html templates/department_hours_query.html templates/manager_query.html templates/manager_overtime_query.html templates/manager_annual_leave_query.html templates/manager_department_hours_query.html
git commit -m "refactor: remove duplicate query page headings"
```

---

### Task 3: Restyle query filter as top taskbar

**Files:**
- Modify: `static/css/style.css`
- Test: `tests/test_attendance_override_features.py`

- [ ] **Step 1: Replace query shell and filter CSS rules**

In `static/css/style.css`, update the existing Query Center rules so they match this behavior:

```css
.query-page-shell {
  display: grid;
  gap: 16px;
  align-items: start;
}

.query-filter-rail {
  position: static;
  display: grid;
  gap: 14px;
  padding: 18px;
  border: 1px solid var(--panel-border);
  border-radius: 20px;
  color: var(--text-main);
  background:
    radial-gradient(260px 140px at 96% 0%, rgba(247, 200, 115, 0.12), transparent 64%),
    linear-gradient(180deg, #ffffff, #f9fbfe);
  box-shadow: var(--shadow-sm);
}

.query-filter-kicker {
  color: #657895;
}

.query-filter-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 14px;
}

.query-filter-heading h2 {
  margin: 4px 0 0;
  color: var(--brand-ink);
  font-size: 18px;
  font-weight: 850;
}

.query-filter-heading p {
  max-width: 520px;
  margin: 0;
  color: #64748b;
  font-size: 12.5px;
  line-height: 1.6;
  text-align: right;
}

.query-filter-body {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  align-items: end;
}

.query-filter-field {
  display: grid;
  gap: 7px;
}

.query-filter-rail .form-label {
  color: #334155;
}

.query-filter-rail .form-control,
.query-filter-rail .form-select {
  border-color: #d7e3ef;
  background-color: #ffffff;
}

.query-filter-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
}

.query-filter-actions .btn {
  width: 100%;
}
```

Remove or neutralize older conflicting rules that set `.query-page-shell` to two columns, `.query-filter-rail` to sticky, or `.query-filter-rail` to dark navy.

- [ ] **Step 2: Simplify responsive rules**

Keep responsive behavior:

```css
@media (max-width: 1180px) {
  .query-filter-body {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .query-metric-grid,
  .query-filter-body,
  .query-filter-actions {
    grid-template-columns: 1fr;
  }

  .query-filter-heading {
    display: grid;
  }

  .query-filter-heading p {
    text-align: left;
  }
}
```

Keep existing `.query-workspace`, `.query-metric-grid`, `.query-result-panel`, `.download-*`, and final density rules unless they conflict with the top taskbar.

- [ ] **Step 3: Run focused tests**

Run:

```bash
python3 -m pytest tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_representative_pages_render_workflow_classes tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_query_center_table_pages_render_query_workspace tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_summary_download_renders_download_task_layout -v
```

Expected:

```text
3 passed
```

- [ ] **Step 4: Commit CSS adjustment**

```bash
git add static/css/style.css
git commit -m "style: convert query filters to top taskbar"
```

---

### Task 4: Final verification and completion

**Files:**
- No expected file changes
- Test: `tests/test_attendance_override_features.py`, `tests/test_manager_attendance_service.py`

- [ ] **Step 1: Run full focused tests**

Run:

```bash
python3 -m pytest tests/test_attendance_override_features.py -v
python3 -m pytest tests/test_manager_attendance_service.py -v
```

Expected:

```text
24 passed
3 passed
```

- [ ] **Step 2: Local smoke check**

Start Flask:

```bash
python3 -m flask --app app run --port 5055
```

Check:

```bash
curl -I http://127.0.0.1:5055/login
curl -I http://127.0.0.1:5055/static/css/style.css
curl -I http://127.0.0.1:5055/employee/dashboard
```

Expected:

```text
/login -> 200 OK
/static/css/style.css -> 200 OK
/employee/dashboard -> 302 FOUND Location: /login
```

Stop the Flask server.

- [ ] **Step 3: Finish the branch**

Use `superpowers:finishing-a-development-branch` and offer:

```text
1. Merge back to master locally
2. Push and create a Pull Request
3. Keep the branch as-is
4. Discard this work
```
