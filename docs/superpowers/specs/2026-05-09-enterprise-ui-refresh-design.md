# Enterprise UI Refresh Design

## Goal

Refresh the attendance processing system into a professional, trustworthy enterprise back-office product.

The target style is a stable finance / HR system: clean, restrained, data-first, and suitable for daily internal use. The refresh should create a clear first impression of a new version while avoiding risky business logic changes.

## Confirmed Direction

- Scope: global visual upgrade.
- Style: finance / HR enterprise back office.
- Primary color: navy blue.
- Priority outcome: looks more professional and trustworthy.
- Change level: major visual refresh.
- First impression target: global shell and shared components.
- Dependency boundary: lightweight libraries are acceptable, but production must work offline.
- Mobile target: phone users should be able to log in, navigate, query, and view results.

## Visual System

The primary brand color will be navy blue, used for the sidebar, active navigation, primary buttons, important focus states, and page emphasis. Supporting colors will stay low-saturation: mist gray, slate gray, pale blue-gray, and white.

Recommended palette:

- Brand navy: `#17233D`, `#1D2F4D`, `#243B63`
- Page background: `#F3F6FA`, `#EEF3F8`
- Panels: `#FFFFFF`, `#FAFCFE`
- Borders: `#D8E1EC`
- Main text: `#1F2937`
- Muted text: `#667085`
- Success: `#2F6B4F`
- Warning: `#A16207`
- Danger: `#B42318`

The design should avoid neon colors, heavy gradients, glassmorphism, and decorative effects that compete with tables or form workflows. Light gradients and subtle borders are acceptable when they make the shell feel more polished.

## Application Shell

The existing `base.html` shell is a good foundation and should be preserved structurally. The refresh should make it look like a complete enterprise management console.

The sidebar should become a dark navy brand anchor. It should keep the existing menu grouping, but use lower-contrast group labels and clearer active states. The current page should be easy to identify through a pale active background, strong text contrast, and a restrained accent marker.

The top navigation should remain light and focused. It should show the current page title, page description, current user, role, and logout action. It may later show current account-set status, but the first UI refresh should not add new business dependencies for that.

The main content area should use a pale mist-gray background with consistent spacing. Cards and table containers should use clear borders, moderate radius, and very light shadows. The goal is order and confidence, not floating SaaS decoration.

## Shared Components

Buttons need a stable action hierarchy:

- Primary buttons use navy and are reserved for the main page action, such as query, save, upload, or calculate.
- Secondary buttons use outline or light neutral styles for refresh, download, and navigation actions.
- Dangerous actions use restrained brick-red styles and should not visually compete with normal actions.

Cards should behave like work panels. Each card should have a consistent title area, optional helper text or status tag, and predictable body spacing. Existing Bootstrap card structure can remain, but styles should be normalized globally.

Tables are a critical part of the perceived quality. Table headers should use pale blue-gray backgrounds, stronger text, and consistent padding. Row hover should use a very light navy tint. Status, error, and result values should gradually move toward unified badges or result panels instead of ad-hoc text styling.

Forms should feel precise and easy to scan. Labels should be small and semi-bold. Inputs should share height, border, radius, and focus ring behavior. Query panels should make the path from filters to action obvious.

Toast, modal, alert, and result-panel styles should share the same status color system. Risky confirmation dialogs should explain the impact clearly, especially for delete, lock, unlock, upload, and calculation actions.

## Page-Level Design

### Login

The login page should become the formal entry point for the system. It should use the navy brand language, a concise product description, and a simple login card. The page should communicate that the system manages account sets, attendance data, employees, and departments.

The design should avoid marketing-heavy illustration. Subtle geometry, a navy brand block, or a restrained background pattern is enough.

### Global Pages

All authenticated pages should immediately feel upgraded through the shell, background, cards, buttons, tables, and navigation. Individual page layouts can be refined gradually, but global components should make every page feel part of the same product.

### Account Set Management

The account set management page is the core admin workflow. Its visual structure should emphasize:

- Account set status.
- Parameter settings.
- Import and calculation workflow.
- Import records as an audit-style table.

Delete, lock, and unlock actions should be visually separated from ordinary toolbar actions where practical.

### Attendance Query

The attendance query page should emphasize the workflow:

1. Choose query conditions.
2. Review summary metrics.
3. Read or download result data.

Metric cards can remain, but they should look more restrained and enterprise-oriented. The final data table should show clear metadata such as waiting state, row count, and selected account-set context when already available.

### Mobile Query Experience

Mobile support should focus on login, navigation, filtering, querying, and viewing results. Complex admin workflows only need to remain accessible and not broken.

On phones:

- Sidebar should become a drawer or compact navigation entry.
- Top navigation should reduce visual weight.
- Filter forms should stack vertically.
- Tables may scroll horizontally, but must not break the page layout.
- Query pages receive priority over admin maintenance pages.

## Architecture Boundaries

This is a visual and interaction refresh, not a business logic rewrite.

Primary change areas:

- `templates/base.html`
- `templates/login.html`
- `static/css/style.css`
- Small class or structure adjustments in representative templates where needed

Avoid changing:

- Flask routes
- Service-layer calculations
- Database models
- Import parsing logic
- Existing page JavaScript behavior unless required for responsive navigation

If a lightweight library is introduced, it must not require adding a frontend build pipeline. Prefer plain CSS, Bootstrap capabilities already in use, local SVG assets, or small local vendor files.

## Resource Strategy

Production should work in an offline or intranet environment.

Development may reference online design inspiration, but final required assets should be local. If Bootstrap, icons, or fonts become part of the refreshed design, they should be vendored under `static/vendor/` or implemented as local static assets.

The default font strategy should continue using a Chinese-friendly system font stack. Do not depend on online font loading unless the font is also packaged locally.

## Error Handling And Safety UX

The UI should make operation outcomes and risks clearer.

Success, warning, error, and neutral states should use consistent color, spacing, and typography. Dangerous operations should use confirmation dialogs with explicit impact text. Import and calculation results should be easy to distinguish from ordinary helper text.

The refresh should not add speculative error states. It should standardize the states already surfaced by existing pages and scripts.

## Verification Plan

Verification should focus on preventing visual regressions and business breakage:

1. Run existing automated tests after implementation.
2. Manually inspect representative pages: login, account set management, attendance query, department management, employee management, and an override page.
3. Check desktop wide layout, tablet/narrow layout, and phone-width layout.
4. Confirm sidebar, top navigation, cards, forms, tables, modals, toasts, and result panels remain usable.
5. Confirm no business flow is changed unintentionally: login, query, download, upload, calculate, lock, unlock, delete, and pagination.

## Non-Goals

- No route redesign.
- No database or service-layer changes.
- No new dashboard analytics feature.
- No full React/Vue migration.
- No complex frontend build system.
- No mobile-native rewrite of all admin workflows.

## Open Implementation Notes

The implementation plan should decide whether to refresh all templates in one pass or stage the work:

- Stage 1: shell, login, global components.
- Stage 2: account set management and attendance query.
- Stage 3: remaining admin/query pages and mobile polish.

The recommended path is staged implementation, because it creates a visible upgrade quickly while keeping review and testing manageable.
