# Query Center Taskbar Adjustment

## Goal

Refine the Query Center redesign by removing duplicated in-page titles and replacing the left filter rail with a top taskbar layout.

## Problem

The current Query Center pages repeat the page identity in two places:

- The global top bar already shows the page title and description.
- The content area repeats `Query Center`, the page title, and the same description.

The left dark filter rail also visually competes with the global navy sidebar, making the page feel like it has two side navigation areas.

## Design

Use a top taskbar model for Query Center table pages.

Page order:

1. Top global bar from `base.html` provides page title and description.
2. Content begins with a query taskbar.
3. Metric cards follow the taskbar.
4. Result table panel follows the metrics.

The query taskbar should be light, compact, and operational. It should contain the same controls that currently live in the filter rail:

- Employee or manager selector when the page needs it.
- Account set or year selector.
- Display options.
- Query button.
- Download button when available.

The content-level `.query-page-heading` card should be removed from Query Center table pages.

## Layout Rules

Desktop:

- `.query-page-shell` becomes a single-column layout.
- `.query-filter-rail` becomes a top `.query-taskbar`-style panel visually.
- The taskbar uses a white panel with navy accents, not a dark sidebar.
- Controls use a responsive grid rather than a vertical rail.

Mobile:

- The same taskbar stacks vertically.
- Buttons become full-width where needed.
- No left rail exists on any viewport.

## Summary Download

Summary Download already uses a top task model. Keep that direction.

It may share taskbar styling, but it should keep the stronger `.download-task-panel` treatment because it is a file-generation page, not a table-query page.

## Behavior Boundaries

Do not change:

- Routes.
- Backend endpoints.
- JavaScript files.
- Existing DOM ids.
- Employee picker behavior.
- Download behavior.
- Permission logic.

This adjustment is layout and CSS only, plus tests that assert the duplicate heading is gone.

## Acceptance Criteria

- Table query pages no longer render `.query-page-heading`.
- Table query pages still render `.query-page-shell`, `.query-filter-rail`, `.query-workspace`, `.query-metric-grid`, and `.query-result-panel`.
- The `.query-filter-rail` component is visually styled as a light top taskbar.
- Existing ids and scripts remain present.
- Existing Query Center tests pass.
