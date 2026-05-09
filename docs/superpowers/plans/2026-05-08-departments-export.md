# Departments Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "export all departments" action that downloads a directly re-importable Excel file, and keep the department import template in the same structure.

**Architecture:** Keep the change inside the existing admin departments flow. Reuse the current `openpyxl` + `send_file` export pattern in `routes/admin.py`, expose it with one toolbar button in the departments page, and verify the contract through Flask endpoint tests that read the generated workbook.

**Tech Stack:** Flask, SQLAlchemy, Jinja2 templates, vanilla JavaScript, `openpyxl`, `unittest`

---

### Task 1: Lock the export/template workbook contract with tests

**Files:**
- Modify: `tests/test_attendance_override_features.py`
- Test: `tests/test_attendance_override_features.py`

- [ ] **Step 1: Write the failing tests**

Add these tests near the existing admin download tests in `tests/test_attendance_override_features.py`:

```python
    def test_departments_template_download_uses_importable_headers(self) -> None:
        res = self.client.get("/admin/departments/template")
        self.assertEqual(res.status_code, 200)

        wb = openpyxl.load_workbook(io.BytesIO(res.data))
        ws = wb.active
        headers = [cell.value for cell in ws[1]]
        self.assertEqual(headers, ["部门编号", "部门名称", "上级部门编号"])

    def test_departments_export_downloads_importable_rows(self) -> None:
        with self.app.app_context():
            parent = Department.query.filter_by(dept_no="D001").first()
            child = Department(dept_no="D010", dept_name="行政一部", parent_id=parent.id)
            db.session.add(child)
            db.session.commit()

        res = self.client.get("/admin/departments/export")
        self.assertEqual(res.status_code, 200)
        self.assertIn("部门导出.xlsx", res.headers.get("Content-Disposition", ""))

        wb = openpyxl.load_workbook(io.BytesIO(res.data))
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        self.assertEqual(rows[0], ("部门编号", "部门名称", "上级部门编号"))
        self.assertIn(("D001", "行政部", ""), rows[1:])
        self.assertIn(("D010", "行政一部", "D001"), rows[1:])
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pytest tests/test_attendance_override_features.py -k "departments_template_download or departments_export_downloads" -v
```

Expected:
- `test_departments_template_download_uses_importable_headers`: PASS or existing PASS if current template already matches
- `test_departments_export_downloads_importable_rows`: FAIL with `404` or missing `/admin/departments/export`

- [ ] **Step 3: If the template test already passes, keep it as the contract test**

No production change here. The goal is to keep one green test documenting the existing template header contract while the export test stays red until the route exists.

- [ ] **Step 4: Re-run just the export test and confirm it is still red**

Run:

```bash
pytest tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_departments_export_downloads_importable_rows -v
```

Expected:
- FAIL with status code mismatch (`404 != 200`) before implementation

- [ ] **Step 5: Commit the red tests**

```bash
git add tests/test_attendance_override_features.py
git commit -m "test: cover department export workbook contract"
```

### Task 2: Implement the backend export and unify workbook structure

**Files:**
- Modify: `routes/admin.py`
- Test: `tests/test_attendance_override_features.py`

- [ ] **Step 1: Add a shared department workbook helper**

In `routes/admin.py`, add a small helper above `download_departments_template()` so template and export share one header definition:

```python
def _build_departments_workbook(rows: list[tuple[str, str, str]]) -> openpyxl.Workbook:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "部门导入模板"
    ws.append(["部门编号", "部门名称", "上级部门编号"])
    for row in rows:
        ws.append(list(row))
    return wb
```

- [ ] **Step 2: Update the template download to use the shared helper**

Replace the body of `download_departments_template()` with:

```python
    wb = _build_departments_workbook(
        [
            ("D001", "行政部", ""),
            ("D002", "生产中心", ""),
            ("D003", "生产一部", "D002"),
        ]
    )
```

Keep the existing `send_file(...)` response shape and filename `部门导入模板.xlsx`.

- [ ] **Step 3: Add the export route with real department rows**

In `routes/admin.py`, add:

```python
@admin_bp.route("/departments/export", methods=["GET"])
@admin_required
def export_departments_xlsx():
    departments = Department.query.order_by(Department.dept_no.asc(), Department.dept_name.asc()).all()
    rows = [
        (
            department.dept_no or "",
            department.dept_name or "",
            department.parent.dept_no if department.parent else "",
        )
        for department in departments
    ]
    wb = _build_departments_workbook(rows)

    output = BytesIO()
    wb.save(output)
    output.seek(0)
    return send_file(
        output,
        as_attachment=True,
        download_name="部门导出.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
```

- [ ] **Step 4: Run the focused tests and verify they pass**

Run:

```bash
pytest tests/test_attendance_override_features.py -k "departments_template_download or departments_export_downloads" -v
```

Expected:
- Both tests PASS

- [ ] **Step 5: Commit the backend implementation**

```bash
git add routes/admin.py tests/test_attendance_override_features.py
git commit -m "feat: export departments as importable workbook"
```

### Task 3: Expose the export action in the departments UI

**Files:**
- Modify: `templates/admin/departments.html`
- Modify: `static/js/departments.js`
- Test: `tests/test_attendance_override_features.py`

- [ ] **Step 1: Add the export button to the toolbar**

In `templates/admin/departments.html`, add this button in the departments list toolbar before the refresh button:

```html
<button class="btn btn-sm btn-outline-success" id="exportDeptBtn" type="button">导出全部部门</button>
```

- [ ] **Step 2: Bind the button to the export endpoint**

In `static/js/departments.js`, add a DOM reference near the other toolbar buttons:

```javascript
  const exportBtn = document.getElementById("exportDeptBtn");
```

Then add the click binding near the bottom:

```javascript
  exportBtn.addEventListener("click", () => {
    window.location.href = "/admin/departments/export";
  });
```

- [ ] **Step 3: Keep the change minimal**

Do not add extra filtering, toast messaging, or async fetch logic. This action should behave like the other download buttons in the project and simply trigger a file download.

- [ ] **Step 4: Run the full targeted test file**

Run:

```bash
pytest tests/test_attendance_override_features.py -v
```

Expected:
- PASS for the full file
- No regressions in existing override/template download tests

- [ ] **Step 5: Commit the UI wiring**

```bash
git add templates/admin/departments.html static/js/departments.js
git commit -m "feat: add departments export action"
```

### Task 4: Final verification and handoff

**Files:**
- Review: `routes/admin.py`
- Review: `templates/admin/departments.html`
- Review: `static/js/departments.js`
- Review: `tests/test_attendance_override_features.py`

- [ ] **Step 1: Run the final verification command**

Run:

```bash
pytest tests/test_attendance_override_features.py -v
```

Expected:
- Entire file PASS

- [ ] **Step 2: Inspect the final diff**

Run:

```bash
git diff --stat HEAD~3..HEAD
```

Expected:
- Only the four planned files changed for the feature work

- [ ] **Step 3: Summarize the user-visible behavior**

Confirm the final state:

```text
部门管理页新增“导出全部部门”按钮。
导出文件表头为：部门编号、部门名称、上级部门编号。
导出文件修改后可直接通过“上传导入”重新导入。
下载示例模板与导出文件结构完全一致。
```

- [ ] **Step 4: Create the final integration commit if working inline**

```bash
git add routes/admin.py templates/admin/departments.html static/js/departments.js tests/test_attendance_override_features.py
git commit -m "feat: support exportable department import workbook"
```
