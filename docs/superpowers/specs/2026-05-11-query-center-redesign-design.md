# Query Center Page Redesign

## Goal

Redesign the Query Center pages from Bootstrap-style stacked cards into a reusable enterprise query workspace.

This is phase 2 of the full UI redesign. Phase 1 created the product shell, module navigation, module home pages, and navy design-system foundation. Phase 2 applies that foundation to the Query Center's actual business pages.

## Visual Direction

Use the existing phase 1 visual language:

- Navy as the primary brand and structure color.
- Mist-gray page background.
- White data panels.
- Strict grid alignment.
- Restrained metric cards.
- Dense but readable tables.

The Query Center should feel like a professional data desk, not a marketing dashboard. Use polish to clarify hierarchy, not to decorate.

## Page Models

Query Center pages should use two page models.

### Table Query Pages

Most Query Center pages use a desktop layout with a left filter rail and a right data workspace.

Desktop structure:

1. Left filter rail.
2. Right page heading and status summary.
3. Metric cards.
4. Result panel with table.

The left filter rail contains query controls, display options, and primary actions. The right workspace gives maximum width to metrics and long tables.

Mobile structure:

1. Page heading.
2. Filter card at the top.
3. Metric cards.
4. Result panel.

Mobile should not keep the desktop left rail. The filter rail collapses into a top card so phone layouts remain readable.

### Download Task Page

The Summary Download page uses a task-oriented layout instead of the table-query layout.

Desktop and mobile structure:

1. Top download task panel.
2. Report selection cards.
3. Header customization area.
4. Download content explanation card.

This page is about producing files, not inspecting a live table. It should absorb the task-bar treatment from the visual exploration while still using the same typography, card, and action styles as the table query pages.

## Covered Pages

Phase 2 covers all Query Center entries.

First batch:

- `考勤数据查询` at `/employee/dashboard`
- `员工异常查询` at `/employee/abnormal-query`
- `打卡数据查询` at `/employee/punch-records`
- `汇总下载` at `/employee/summary-download`

Second batch:

- `员工部门工时` at `/employee/department-hours-query`
- `管理人员查询` at `/employee/manager-query`
- `管理人员加班查询` at `/employee/manager-overtime-query`
- `管理人员年休查询` at `/employee/manager-annual-leave-query`
- `管理人员部门工时` at `/employee/manager-department-hours-query`

The implementation plan should migrate in that order so the main table-query model is proven before applying it to lighter and manager-specific pages.

## Component Boundaries

Create shared Jinja partials for stable structure only.

Shared partials:

- `query_metric_card`: renders one metric card with caller-provided title, value id, default value, and helper text.
- `query_filter_shell`: renders the responsive filter container. On desktop it appears as the left rail; on mobile it becomes a top card. Page-specific fields are passed through template blocks or caller content.
- `employee_picker_modal`: renders the shared employee or manager picker modal. It accepts title and item label copy, but preserves the existing DOM ids used by current JavaScript.
- `query_result_panel`: renders the result panel shell, title, meta area, scroll container, and empty-state styling. The actual table header and body remain page-specific.
- `download_task_panel`: renders the Summary Download task header and primary action area.

Do not extract:

- Page-specific table columns.
- Page-specific JavaScript files.
- Existing control ids such as query buttons, download buttons, account-set selects, year inputs, metric value ids, and table body ids.
- Query or download API calls.
- Permission checks.

This keeps the structure reusable without forcing unrelated pages into a single rigid template.

## Behavior Boundaries

Preserve existing behavior.

Do not change:

- Routes.
- Backend endpoints.
- Response formats.
- Database models.
- Attendance calculations.
- Download behavior.
- Employee picker JavaScript behavior.
- Query page JavaScript behavior.
- Permission model.

Existing JavaScript may depend on specific ids. Keep those ids intact and only move them into the new layout.

## Page Rules

### Table Query Pages

Each table query page should have:

- `.query-page-shell` as the page root.
- `.query-filter-rail` for filter and action controls.
- `.query-workspace` for the main content.
- `.query-metric-grid` for metrics.
- `.query-result-panel` for the table panel.

The result panel should keep existing table ids and body ids. Header rows stay in the page template where the column semantics are clear.

Pages with employee or manager selection should use the shared employee picker partial. Pages without employee selection, such as department-hours pages, still use the query filter shell but only render account-set and action controls.

### Summary Download Page

The Summary Download page should have:

- `.download-page-shell` as the page root.
- `.download-task-panel` for account set, employee range, report selection, and primary download action.
- `.download-report-grid` for report selection cards.
- `.download-header-panel` for header customization.
- `.download-help-panel` for download content explanation.

Existing header customization ids and download option ids must remain unchanged.

## Responsive Rules

Desktop:

- Table query pages use a two-column grid.
- Filter rail width should be stable and compact, around 260-300px.
- Data workspace should own the remaining width.
- Tables should stay horizontally scrollable when needed.

Tablet and mobile:

- Query pages collapse to one column.
- Filter controls appear above metrics.
- Metric cards become two columns on tablet and one column on small phones when necessary.
- Bottom module navigation from phase 1 remains available.
- No horizontal layout should require the user to scroll the whole page sideways; only data tables may scroll horizontally.

## Testing Strategy

Add or update template smoke tests to verify:

- Table query pages render `.query-page-shell`, `.query-filter-rail`, `.query-workspace`, and `.query-result-panel`.
- Summary Download renders `.download-page-shell`, `.download-task-panel`, `.download-report-grid`, and `.download-help-panel`.
- Existing business ids still render on each migrated page.
- Existing page-specific script references remain present.
- Employee picker modal still renders for pages that use employee or manager selection.

Run existing focused tests:

- `python3 -m pytest tests/test_attendance_override_features.py -v`
- `python3 -m pytest tests/test_manager_attendance_service.py -v`

Run local smoke after implementation:

- Start Flask locally.
- Check `/login`.
- Check the Query Center pages while authenticated through existing test client or manual browser session.
- Check static CSS loads.

## Acceptance Criteria

The redesign is complete when:

- All covered Query Center pages use the new page models.
- Table query pages use the left filter rail on desktop.
- Summary Download uses the top task-panel model.
- Mobile layouts collapse filters to the top.
- Shared partials reduce repeated query-page markup without removing page-specific clarity.
- Existing JavaScript and backend behavior continue to work.
- Tests pass.

## Out Of Scope

This phase does not include:

- Backend query optimizations.
- New statistics APIs.
- Charting.
- New export formats.
- New permission features.
- Redesign of Account Set Center, Master Data, Correction Center, or System Settings business pages.
- React, Vue, or frontend build tooling migration.
