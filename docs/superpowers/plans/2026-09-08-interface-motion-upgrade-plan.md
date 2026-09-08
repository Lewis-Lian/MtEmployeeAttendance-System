# 界面动效升级 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为查询、日历、选择器、后台操作和导入流程补充一致、克制且支持无障碍降级的反馈动效。

**Architecture:** 复用现有 `motion`、`AnimatePresence` 和组件级 CSS，在现有组件边界内增加状态类和最小结构标记。按查询/日历、选择器/弹窗、后台/导入三个可独立验证的子项目推进，统一使用 150–300ms 交互时长，并集中补充 reduced-motion 规则。

**Tech Stack:** React 18、TypeScript、`motion`、CSS、Vitest、Testing Library、Vite。

**Spec:** `docs/superpowers/specs/2026-09-08-interface-motion-upgrade-design.md`

## Global Constraints

- 优先复用现有 `motion`、`AnimatePresence`、CSS token 和组件边界，不引入新的动画依赖。
- 交互反馈控制在约 150–300ms；状态型循环动画仅用于明确的加载状态。
- 不修改后端接口和业务数据流，不改变现有权限与操作语义。
- 所有新增动画都要提供 `prefers-reduced-motion` 降级。
- 通过组件测试验证关键状态类/结构，通过样式边界测试验证动效归属；最后运行完整前端测试和生产构建。

### Task 1: 查询结果表格动效

**Files:**
- Modify: `frontend/src/components/query/QueryTable.tsx`
- Modify: `frontend/src/pages/query/QueryPage.tsx`
- Modify: `frontend/src/pages/query/AbnormalQueryPage.tsx`
- Modify: `frontend/src/styles/components/query-table.css`
- Test: `frontend/src/components/query/QueryTable.test.tsx`

**Interfaces:**
- Consumes: existing `QueryTable` row rendering and query-page `isQuerying` state.
- Produces: `.query-result-table.is-refreshing` and `.query-table-row` animation hooks without changing table props or API payloads.

- [ ] **Step 1: Write failing tests**

  Add a test that renders rows and asserts each rendered data row receives the row animation class and an index-based delay style. Add a test that a querying table exposes the refreshing class while preserving rendered rows.

- [ ] **Step 2: Run focused tests and verify failure**

  Run `npm test -- --run src/components/query/QueryTable.test.tsx` from `frontend/`. Expected: the new class/style assertions fail because the hooks do not exist.

- [ ] **Step 3: Implement minimal table hooks**

  Add `isRefreshing?: boolean` to `QueryTable`, apply it to the result wrapper, and add `--query-row-index` to the existing row map. Pass `isQuerying` from `QueryPage` and `AbnormalQueryPage`. Add CSS for panel fade-in, row `opacity/translateY`, and a non-looping refreshing state.

- [ ] **Step 4: Add reduced-motion coverage and run tests**

  Add the component-scoped reduced-motion rule and run `npm test -- --run src/components/query/QueryTable.test.tsx tests/styleBoundaries.test.ts`. Expected: all focused tests pass.

- [ ] **Step 5: Commit**

  Run `git add frontend/src/components/query/QueryTable.tsx frontend/src/components/query/QueryTable.test.tsx frontend/src/pages/query/QueryPage.tsx frontend/src/pages/query/AbnormalQueryPage.tsx frontend/src/styles/components/query-table.css` and commit with `feat: animate query result updates`.

### Task 2: 考勤日历切换与日期反馈

**Files:**
- Modify: `frontend/src/components/attendance/AttendanceCalendarGrid.tsx`
- Modify: `frontend/src/styles/components/attendance-calendar.css`
- Test: `frontend/src/components/attendance/AttendanceCalendarGrid.test.tsx`

**Interfaces:**
- Consumes: existing calendar `data`, day-cell rendering, and day-detail callback/modal behavior.
- Produces: a stable calendar transition class and day-cell hover/selected hooks; no API changes.

- [ ] **Step 1: Write failing tests**

  Assert that calendar cells expose the existing status classes plus a transition hook, and that the selected/detail container exposes an enter class when opened.

- [ ] **Step 2: Run focused tests and verify failure**

  Run `npm test -- --run src/components/attendance/AttendanceCalendarGrid.test.tsx`. Expected: the new hook assertions fail.

- [ ] **Step 3: Implement calendar feedback**

  Add a month transition wrapper with a direction-neutral fade/slide class, add `transform`/`box-shadow` transitions to interactive cells, and add a short detail-panel enter animation. Keep all click, keyboard, and modal behavior unchanged.

- [ ] **Step 4: Verify accessibility and regressions**

  Add reduced-motion rules and run `npm test -- --run src/components/attendance/AttendanceCalendarGrid.test.tsx src/pages/query/AttendanceCalendarPage.test.tsx`.

- [ ] **Step 5: Commit**

  Commit the calendar files with `feat: animate attendance calendar interactions`.

### Task 3: 选择器动效

**Files:**
- Modify: `frontend/src/components/query/EmployeePicker.tsx`
- Modify: `frontend/src/components/common/MonthPicker.tsx`
- Modify: `frontend/src/components/common/MultiSelectDropdown.tsx`
- Modify: `frontend/src/styles/components/employee-picker.css`
- Modify: `frontend/src/styles/components/multi-select-dropdown.css`
- Test: existing component tests for EmployeePicker, PickerMotion, and MultiSelectDropdown

**Interfaces:**
- Consumes: existing open state, search results, selected values, and `DropdownMotion` wrapper.
- Produces: item index animation hooks and selected-item enter/exit hooks without changing selection callbacks.

- [ ] **Step 1: Write failing tests**

  Add assertions for result-item index styles, selected-chip transition hooks, and open/close animation wrapper usage in the existing picker tests.

- [ ] **Step 2: Run focused tests and verify failure**

  Run `npm test -- --run src/components/query/EmployeePicker.test.tsx src/components/common/MultiSelectDropdown.test.tsx src/components/common/PickerMotion.test.tsx`.

- [ ] **Step 3: Implement selector animations**

  Reuse `DropdownMotion` for panels that are not already wrapped, add `AnimatePresence` only around removable selected chips/items, and use CSS custom-property delays for result lists. Do not animate layout dimensions in a way that changes keyboard focus order.

- [ ] **Step 4: Run focused tests and reduced-motion checks**

  Run the same focused command plus `npm test -- --run tests/styleBoundaries.test.ts` and confirm all pass.

- [ ] **Step 5: Commit**

  Commit with `feat: animate selection controls`.

### Task 4: 弹窗与后台操作反馈

**Files:**
- Modify: `frontend/src/components/feedback/ConfirmDialog.tsx`
- Modify: `frontend/src/components/admin/AttendanceOverrideCalendarModal.tsx`
- Modify: `frontend/src/components/feedback/Notification.tsx`
- Modify: `frontend/src/styles/components/confirm-dialog.css`
- Modify: `frontend/src/styles/components/notification.css`
- Modify: `frontend/src/pages/admin/EmployeesPage.tsx` only where its existing action success state needs a class hook
- Test: `frontend/src/components/feedback/ConfirmDialog.test.tsx`, `frontend/src/components/feedback/Notification.test.tsx`, and affected admin tests

**Interfaces:**
- Consumes: existing dialog open state, notification lifecycle, and EmployeesPage action success/error state.
- Produces: unified enter/exit classes and one-shot success feedback; existing callbacks and messages remain unchanged.

- [ ] **Step 1: Write failing tests**

  Assert dialog enter/exit class hooks, notification completion state, and EmployeesPage action success hook after the existing promise resolves.

- [ ] **Step 2: Run focused tests and verify failure**

  Run `npm test -- --run src/components/feedback/ConfirmDialog.test.tsx src/components/feedback/Notification.test.tsx` and the affected admin test files.

- [ ] **Step 3: Implement unified modal/action motion**

  Keep `AnimatePresence` as the lifecycle owner, add only the missing overlay/card transitions, and add a short success class that automatically clears after the existing action completion. Do not introduce a second notification system.

- [ ] **Step 4: Verify**

  Run the focused tests and `npm test -- --run tests/styleBoundaries.test.ts`.

- [ ] **Step 5: Commit**

  Commit with `feat: add modal and action feedback motion`.

### Task 5: 后台统计与上传/计算流程

**Files:**
- Modify: `frontend/src/pages/admin/AdminDashboardPage.tsx`
- Modify: `frontend/src/pages/admin/EmployeesPage.tsx`
- Modify: `frontend/src/pages/admin/DepartmentsPage.tsx`
- Modify: `frontend/src/styles/legacy-ui.css`, keeping selectors scoped to the existing admin/import classes
- Test: `frontend/src/App.smoke.test.tsx` and `frontend/tests/styleBoundaries.test.ts`

**Interfaces:**
- Consumes: existing AdminDashboardPage card lists/calculation polling and EmployeesPage/DepartmentsPage upload drag state.
- Produces: card stagger hooks, drag-active class, progress-node state classes, and completion check hook without API changes.

- [ ] **Step 1: Write failing tests**

  Assert that AdminDashboardPage cards expose index delays, EmployeesPage and DepartmentsPage drag-active state is reflected in the upload surface, and AdminDashboardPage calculation progress marks reached/current nodes.

- [ ] **Step 2: Run focused tests and verify failure**

  Run `npm test -- --run src/App.smoke.test.tsx tests/styleBoundaries.test.ts`. Expected: the new hook assertions fail.

- [ ] **Step 3: Implement scoped motion**

  Add CSS-only card and drag transitions in `legacy-ui.css`, derive progress-node classes from the existing percent/state values in `AdminDashboardPage`, and use a one-shot completion check. Preserve disabled controls, error messages, and polling timing.

- [ ] **Step 4: Verify**

  Run `npm test -- --run src/App.smoke.test.tsx tests/styleBoundaries.test.ts` and `npm run build`.

- [ ] **Step 5: Commit**

  Commit with `feat: animate admin import workflow`.

### Task 6: 全量验证

**Files:**
- Test/verify only: all frontend source and test files

- [ ] **Step 1: Run full test suite**

  From `frontend/`, run `npm test`. Expected: all test files pass with zero failures.

- [ ] **Step 2: Run production build**

  Run `npm run build`. Expected: TypeScript compilation and Vite production build exit successfully.

- [ ] **Step 3: Check diff quality**

  From the repository root, run `git diff --check` and `git status --short`; inspect that only planned files are changed and no generated output is staged.

- [ ] **Step 4: Final commit review**

  Run `git log --oneline -6` and verify each task commit is present before pushing or opening a review.
