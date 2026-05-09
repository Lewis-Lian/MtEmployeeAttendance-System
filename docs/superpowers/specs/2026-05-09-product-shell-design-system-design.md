# Product Shell And Design System Redesign

## Goal

Redesign the attendance system into a productized enterprise workbench by rebuilding the application shell, navigation architecture, design system, and module home template foundation.

This is phase 1 of the full-page UI redesign. It creates the structure and visual language that later module redesigns will use.

## Visual Direction

The visual direction combines three references:

- Primary backbone: modern government / HR management console.
- Grid discipline: editorial data desk and Swiss-style structure.
- Polish layer: small amounts of modern SaaS dashboard refinement.

The result should feel stable, professional, and productized without becoming flashy. Use navy as the core brand color, pale mist-gray backgrounds, white content panels, strict grids, readable tables, and restrained dashboard summary cards.

Avoid neon effects, dark cyber dashboards, heavy glassmorphism, marketing-style illustrations, and decorative UI that competes with data.

## Phase 1 Scope

Phase 1 delivers the product shell and design-system foundation.

Included:

- Desktop top module navigation.
- Desktop left module-page navigation.
- Mobile bottom module navigation.
- Module home template for all product modules.
- Shared design tokens and shell component rules.
- Shared page, data, form, and action component rules.
- Permission-aware navigation and entry cards.

Not included:

- Full rewrite of all business pages.
- Backend calculation changes.
- Database changes.
- Import parser changes.
- New analytics/statistics APIs.
- React/Vue migration.
- Complex frontend build pipeline.

## Information Architecture

The application should move from object/permission-oriented menu groups to product modules.

Top-level modules:

- Query Center
- Account Set Center
- Master Data
- Correction Center
- System Settings

Chinese labels:

- 查询中心
- 账套中心
- 主数据
- 修正中心
- 系统设置

Desktop navigation:

- Top navigation selects the current product module.
- Left sidebar shows pages inside the selected module.
- The shell should answer two questions clearly: which module am I in, and which page am I on?

Mobile navigation:

- Bottom navigation shows the five top-level modules.
- Module-internal pages should be available through a drawer or module-home entry cards.
- Do not force the full desktop sidebar into phone layouts.

## Module Mapping

Query Center:

- `/employee/dashboard`
- `/employee/abnormal-query`
- `/employee/punch-records`
- `/employee/department-hours-query`
- `/employee/summary-download`
- `/employee/manager-query`
- `/employee/manager-overtime-query`
- `/employee/manager-annual-leave-query`
- `/employee/manager-department-hours-query`

Account Set Center:

- `/admin/dashboard`

Master Data:

- `/admin/employees/manage`
- `/admin/departments/manage`
- `/admin/shifts/manage`

Correction Center:

- `/admin/employee-attendance-overrides`
- `/admin/manager-attendance-overrides`
- `/admin/manager-overtime`
- `/admin/manager-annual-leave`

System Settings:

- `/admin/accounts`

Existing business URLs should remain valid. Phase 1 may add lightweight module-home routes, but it must not rename or remove existing routes.

Recommended module-home routes:

- `/module/query`
- `/module/account`
- `/module/master-data`
- `/module/corrections`
- `/module/settings`

These routes are product entry pages only. They should not fetch new statistics or replace existing business pages.

## Module Home Template

Every module should have a consistent home-page structure:

- Module title and description.
- Primary entry cards for accessible pages.
- A status or summary area using static or already-available information.
- A common actions area for frequent user paths.
- Empty or restricted states when the user has no accessible entries.

The first implementation should rely on existing routes and static descriptions. Do not add backend summary APIs in this phase.

Module-home purpose by module:

- Query Center: guide users to attendance, abnormal, punch, work-hour, manager, and download queries.
- Account Set Center: guide admins into account-set maintenance, upload, calculation, and import records.
- Master Data: guide users into employees, departments, shifts, and later account/personnel metadata.
- Correction Center: guide users into employee corrections, manager corrections, overtime, annual leave, and history-oriented workflows.
- System Settings: guide admins into account and permission management.

## Component Model

Shell components:

- Top module navigation.
- Module-internal sidebar.
- Mobile bottom module navigation.
- Mobile drawer or module-entry fallback.

Page components:

- Module home.
- Page title area.
- Operation toolbar.
- Filter panel.
- Data panel.
- Helper note panel.

Data components:

- Tables.
- Pagination.
- Status badges.
- Empty states.
- Result panels.
- Audit or history list panels.

Form components:

- Text inputs.
- Selects.
- File uploads.
- Employee and department selectors.
- Checkbox groups.

Action components:

- Primary action buttons.
- Secondary action buttons.
- Dangerous action buttons.
- Batch operation buttons.
- Download buttons.

The design system should keep navy as the primary action and module color. Use editorial grid discipline for alignment, spacing, section rhythm, and table readability. Use modern dashboard polish only for module-home summary cards and entry cards.

## Page Template Rules

Query pages:

1. Filter conditions.
2. Summary metrics.
3. Result table.
4. Download and pagination actions.

Management pages:

1. Operation panel.
2. Data table.
3. Batch action area.
4. Safety hints for destructive operations.

Import and calculation pages:

1. Current account-set status.
2. Upload and calculation steps.
3. Result feedback.
4. Import records.

Correction pages:

1. Select object and month.
2. Compare system value and correction value.
3. Save or clear correction.
4. Review history and impact explanation.

Module home pages:

1. Module identity.
2. Entry cards.
3. Summary or status cards.
4. Common actions.

## Permissions

Navigation and module-home entries must respect existing access controls.

Use current permission mechanisms:

- `g.current_user.role`
- `g.current_user.has_any_page_access(...)`
- `g.current_user.can_access_page(...)`

A module should only be visible when the user can access at least one page in that module. An admin can see all modules. Page entry cards should only render when the user can access the target page.

This redesign must not expose inaccessible pages through the new product shell.

## Data And Route Boundaries

Existing route handlers and page JavaScript should keep their current behavior.

Phase 1 may add lightweight module-home routes and templates. These routes should:

- Render static module metadata and permission-filtered entry cards.
- Link to existing business pages.
- Avoid new business queries unless already available without service changes.
- Avoid changing existing endpoint response formats.

Existing business pages should continue loading their current JavaScript files. The shell may provide navigation state and layout classes, but it should not interfere with business data requests, import flows, downloads, corrections, or pagination.

## Implementation Shape

Prefer small templates over growing `base.html` further.

Recommended template structure:

- `templates/base.html`: shell container and shared includes.
- `templates/partials/app_modules.html`: module configuration or render helpers.
- `templates/partials/app_nav.html`: top navigation, sidebar, mobile bottom navigation.
- `templates/module_home.html`: shared module-home renderer.

If Jinja limitations make a separate configuration awkward, keep the first implementation simple and explicit. Do not create a complex framework around navigation.

## Testing Strategy

Automatic tests should verify structure and permission behavior, not visual taste.

Add or update tests for:

- Authenticated shell renders the top module navigation.
- Shell contains the five module labels.
- Mobile bottom navigation structure exists.
- Module-home routes render.
- Module-home entry cards link to expected existing routes.
- Users without access do not see restricted module entries.
- Existing attendance override, department import/export, and manager attendance service tests continue passing.

Manual checks should cover:

- `/login`
- `/module/query`
- `/module/account`
- `/module/master-data`
- `/module/corrections`
- `/module/settings`
- `/employee/dashboard`
- `/admin/dashboard`
- `/admin/departments/manage`
- `/admin/employee-attendance-overrides`

Responsive checks:

- Desktop width: top module navigation plus sidebar works.
- Tablet width: navigation remains usable.
- Phone width: bottom module navigation works and tables do not break the page.

## Implementation Stages

Stage 1: Navigation architecture.

- Define module-page mapping.
- Render top module navigation.
- Render module-internal sidebar.
- Preserve permissions.

Stage 2: Module-home template.

- Add module-home routes.
- Render entry cards for accessible pages.
- Provide consistent module descriptions and actions.

Stage 3: Design system strengthening.

- Add shell, module-nav, entry-card, module-home, status-card, mobile-bottom-nav, and empty-state styles.
- Ensure existing page components remain compatible.

Stage 4: Responsive and regression verification.

- Verify phone bottom navigation.
- Verify existing pages still work.
- Run automated tests and local smoke checks.

## Success Criteria

The phase is complete when:

- The system has product modules instead of the old object-oriented menu groups.
- Desktop users can switch modules from the top navigation.
- Desktop users see module-specific pages in the left sidebar.
- Phone users see a bottom module navigation.
- All five module home pages exist and link to accessible existing pages.
- Existing business tests pass.
- No business logic or data model changes are required.
