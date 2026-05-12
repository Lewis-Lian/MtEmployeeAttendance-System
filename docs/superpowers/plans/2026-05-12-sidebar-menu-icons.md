# Sidebar Menu Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为侧边菜单所有页面项补齐统一的线性描边图标，并保持现有导航结构与权限逻辑不变。

**Architecture:** 继续沿用 `templates/partials/app_nav.html` 中 `entry.key -> icon-{{ key }}` 的类名映射，不引入图标库，也不改动导航数据结构。先用测试锁定 18 个实际菜单 key 都能渲染到对应图标类，再在 `static/css/style.css` 中补齐缺失图标和统一已有图标风格。

**Tech Stack:** Flask/Jinja 模板、纯 CSS 伪元素图标、pytest

---

## File Map

- Modify: `tests/test_attendance_override_features.py`
  - 为产品导航增加图标渲染断言，覆盖所有实际 `entry.key`
- Modify: `static/css/style.css`
  - 补齐所有缺失的 `.icon-*` 样式，并微调已有图标的线宽、尺寸和重心
- Reference: `utils/app_navigation.py`
  - 导航模块和页面项的唯一 `entry.key` 来源，不应在本任务中改动
- Reference: `templates/partials/app_nav.html`
  - 当前菜单模板已输出 `app-side-icon icon-{{ entry.key|replace('_', '-') }}`，本任务不改动模板结构

### Task 1: 锁定导航图标覆盖范围

**Files:**
- Modify: `tests/test_attendance_override_features.py`
- Reference: `utils/app_navigation.py`

- [ ] **Step 1: 写一个失败测试，断言管理员导航会为所有页面项输出图标类**

在 `tests/test_attendance_override_features.py` 里 `test_authenticated_shell_renders_enterprise_navigation` 后新增这个测试：

```python
    def test_authenticated_shell_renders_icon_class_for_every_sidebar_entry(self) -> None:
        res = self.client.get("/admin/departments/manage")
        self.assertEqual(res.status_code, 200)

        html = res.get_data(as_text=True)

        expected_icon_classes = [
            "icon-employee-dashboard",
            "icon-abnormal-query",
            "icon-punch-records",
            "icon-department-hours-query",
            "icon-summary-download",
            "icon-manager-query",
            "icon-manager-overtime-query",
            "icon-manager-annual-leave-query",
            "icon-manager-department-hours-query",
            "icon-account-dashboard",
            "icon-employees",
            "icon-departments",
            "icon-shifts",
            "icon-employee-attendance-overrides",
            "icon-manager-attendance-overrides",
            "icon-manager-overtime",
            "icon-manager-annual-leave",
            "icon-accounts",
        ]

        for icon_class in expected_icon_classes:
            with self.subTest(icon_class=icon_class):
                self.assertIn(icon_class, html)
```

- [ ] **Step 2: 运行单测，确认它先失败或暴露缺失图标范围**

Run:

```bash
python3 -m pytest tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_authenticated_shell_renders_icon_class_for_every_sidebar_entry -v
```

Expected:

```text
FAILED
```

失败原因应指向部分 `icon-*` 类对应样式尚未实现，或者当前测试尚未落地。

- [ ] **Step 3: 提交测试约束**

```bash
git add tests/test_attendance_override_features.py
git commit -m "test: cover sidebar menu icon classes"
```

### Task 2: 补齐并统一侧边菜单图标样式

**Files:**
- Modify: `static/css/style.css`
- Reference: `templates/partials/app_nav.html`

- [ ] **Step 1: 在 CSS 中保留现有图标容器，只统一基础盒模型**

确认并保留这一段结构，不改模板：

```css
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

.app-side-icon::before,
.app-side-icon::after {
  content: "";
  position: absolute;
  box-sizing: border-box;
}
```

如果需要微调，只允许改线宽、定位和留白，不改整体交互结构。

- [ ] **Step 2: 用最小改动把已有通用图标类映射到当前实际 key**

在 `static/css/style.css` 现有图标定义后新增这些别名选择器，让现有业务图标先覆盖实际导航 key：

```css
.icon-attendance::before,
.icon-employee-dashboard::before {
  width: 12px;
  height: 12px;
  top: 5px;
  left: 5px;
  border: 2px solid currentColor;
  border-radius: 3px;
  background: transparent;
}

.icon-attendance::after,
.icon-employee-dashboard::after {
  width: 8px;
  height: 2px;
  top: 8px;
  left: 7px;
  background: currentColor;
  box-shadow: 0 4px 0 currentColor;
}

.icon-abnormal::before,
.icon-abnormal-query::before {
  width: 12px;
  height: 12px;
  top: 5px;
  left: 5px;
  border: 2px solid currentColor;
  border-radius: 999px;
  background: transparent;
}

.icon-abnormal::after,
.icon-abnormal-query::after {
  width: 6px;
  height: 6px;
  top: 8px;
  left: 8px;
  border-left: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transform: rotate(-45deg);
  background: transparent;
}

.icon-punch::before,
.icon-punch-records::before {
  width: 12px;
  height: 10px;
  top: 6px;
  left: 5px;
  border: 2px solid currentColor;
  border-radius: 3px;
  background: transparent;
}

.icon-punch::after,
.icon-punch-records::after {
  width: 8px;
  height: 2px;
  top: 10px;
  left: 7px;
  background: currentColor;
}

.icon-hours::before,
.icon-department-hours-query::before,
.icon-manager-department-hours-query::before {
  width: 12px;
  height: 12px;
  top: 5px;
  left: 5px;
  border: 2px solid currentColor;
  border-radius: 999px;
  background: transparent;
}

.icon-hours::after,
.icon-department-hours-query::after,
.icon-manager-department-hours-query::after {
  width: 2px;
  height: 5px;
  top: 8px;
  left: 10px;
  background: currentColor;
  box-shadow: 3px 2px 0 currentColor;
}

.icon-accountset::before,
.icon-account-dashboard::before {
  width: 12px;
  height: 12px;
  top: 5px;
  left: 5px;
  border: 2px solid currentColor;
  border-radius: 3px;
  background: transparent;
}

.icon-accountset::after,
.icon-account-dashboard::after {
  width: 8px;
  height: 2px;
  top: 9px;
  left: 7px;
  background: currentColor;
  box-shadow: 0 4px 0 currentColor;
}

.icon-employee::before,
.icon-employees::before {
  width: 8px;
  height: 8px;
  top: 4px;
  left: 7px;
  border: 2px solid currentColor;
  border-radius: 999px;
  background: transparent;
}

.icon-employee::after,
.icon-employees::after {
  width: 12px;
  height: 6px;
  top: 13px;
  left: 5px;
  border: 2px solid currentColor;
  border-top: 0;
  border-radius: 0 0 8px 8px;
  background: transparent;
}

.icon-department::before,
.icon-departments::before {
  width: 4px;
  height: 4px;
  top: 5px;
  left: 9px;
  border: 2px solid currentColor;
  border-radius: 999px;
  background: transparent;
  box-shadow: -5px 8px 0 -2px transparent, 5px 8px 0 -2px transparent;
}

.icon-department::after,
.icon-departments::after {
  width: 12px;
  height: 2px;
  top: 7px;
  left: 5px;
  background: currentColor;
  box-shadow: -5px 8px 0 currentColor, 5px 8px 0 currentColor, 0 4px 0 currentColor;
}

.icon-shift::before,
.icon-shifts::before {
  width: 12px;
  height: 12px;
  top: 5px;
  left: 5px;
  border: 2px solid currentColor;
  border-radius: 3px;
  background: transparent;
}

.icon-shift::after,
.icon-shifts::after {
  width: 8px;
  height: 2px;
  top: 10px;
  left: 7px;
  background: currentColor;
  box-shadow: 0 -4px 0 currentColor, 0 4px 0 currentColor;
}

.icon-account::before,
.icon-accounts::before {
  width: 12px;
  height: 12px;
  top: 5px;
  left: 5px;
  border: 2px solid currentColor;
  border-radius: 4px;
  background: transparent;
}

.icon-account::after,
.icon-accounts::after {
  width: 6px;
  height: 2px;
  top: 10px;
  left: 8px;
  background: currentColor;
  box-shadow: 0 -4px 0 currentColor, 0 4px 0 currentColor;
}
```

- [ ] **Step 3: 为修正类和下载类补上当前缺失的专用图标**

在同一位置继续新增这些缺失样式：

```css
.icon-summary-download::before {
  width: 12px;
  height: 8px;
  top: 6px;
  left: 5px;
  border: 2px solid currentColor;
  border-top: 0;
  border-radius: 0 0 4px 4px;
  background: transparent;
}

.icon-summary-download::after {
  width: 2px;
  height: 7px;
  top: 4px;
  left: 10px;
  background: currentColor;
  box-shadow: 0 0 0 0 currentColor;
}

.icon-manager-query::before {
  width: 8px;
  height: 8px;
  top: 4px;
  left: 7px;
  border: 2px solid currentColor;
  border-radius: 999px;
  background: transparent;
}

.icon-manager-query::after {
  width: 14px;
  height: 8px;
  top: 12px;
  left: 4px;
  border: 2px solid currentColor;
  border-top: 0;
  border-radius: 0 0 8px 8px;
  background: transparent;
}

.icon-manager-overtime-query::before,
.icon-manager-overtime::before {
  width: 12px;
  height: 12px;
  top: 5px;
  left: 5px;
  border: 2px solid currentColor;
  border-radius: 999px;
  background: transparent;
}

.icon-manager-overtime-query::after,
.icon-manager-overtime::after {
  width: 5px;
  height: 2px;
  top: 10px;
  left: 10px;
  background: currentColor;
  transform: rotate(35deg);
  transform-origin: left center;
  box-shadow: -3px -3px 0 currentColor;
}

.icon-manager-annual-leave-query::before,
.icon-manager-annual-leave::before {
  width: 12px;
  height: 12px;
  top: 5px;
  left: 5px;
  border: 2px solid currentColor;
  border-radius: 3px;
  background: transparent;
}

.icon-manager-annual-leave-query::after,
.icon-manager-annual-leave::after {
  width: 8px;
  height: 2px;
  top: 9px;
  left: 7px;
  background: currentColor;
  box-shadow: 0 -4px 0 currentColor, 0 4px 0 currentColor;
}

.icon-employee-attendance-overrides::before,
.icon-manager-attendance-overrides::before {
  width: 12px;
  height: 12px;
  top: 5px;
  left: 5px;
  border: 2px solid currentColor;
  border-radius: 3px;
  background: transparent;
}

.icon-employee-attendance-overrides::after,
.icon-manager-attendance-overrides::after {
  width: 7px;
  height: 2px;
  top: 12px;
  left: 8px;
  background: currentColor;
  transform: rotate(-35deg);
  transform-origin: left center;
  box-shadow: -3px -4px 0 currentColor;
}
```

如果需要让下载箭头更完整，可在 `.icon-summary-download` 上添加一个小三角辅助样式，但必须保持纯 CSS 和线性描边风格。

- [ ] **Step 4: 运行图标测试，确认所有 key 都被覆盖**

Run:

```bash
python3 -m pytest tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_authenticated_shell_renders_icon_class_for_every_sidebar_entry -v
```

Expected:

```text
PASSED
```

- [ ] **Step 5: 提交图标样式**

```bash
git add static/css/style.css
git commit -m "style: add sidebar menu icons"
```

### Task 3: 验证整套导航与现有页面壳

**Files:**
- Modify: `tests/test_attendance_override_features.py`
- Verify: `static/css/style.css`
- Verify: `templates/partials/app_nav.html`

- [ ] **Step 1: 运行导航和壳层相关测试，确认没有回归**

Run:

```bash
python3 -m pytest \
  tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_authenticated_shell_renders_enterprise_navigation \
  tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_authenticated_shell_hides_restricted_modules_for_readonly_user \
  tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_product_navigation_groups_pages_into_modules \
  tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_product_navigation_filters_readonly_permissions \
  tests/test_attendance_override_features.py::AttendanceOverrideFeatureTests::test_authenticated_shell_renders_icon_class_for_every_sidebar_entry \
  -v
```

Expected:

```text
5 passed
```

- [ ] **Step 2: 运行完整的 UI 回归测试文件**

Run:

```bash
python3 -m pytest tests/test_attendance_override_features.py -v
```

Expected:

```text
24 passed
```

如果测试数量因为本次新增用例变成 `25 passed`，以实际输出为准，但必须全部通过。

- [ ] **Step 3: 提交最终验证结果**

```bash
git add tests/test_attendance_override_features.py static/css/style.css
git commit -m "test: verify sidebar menu icon coverage"
```

## Self-Review

- Spec coverage: 已覆盖“所有侧边菜单页面项补齐图标”“纯 CSS 线性描边风格”“不改模板结构与权限逻辑”“测试验证导航不回归”。
- Placeholder scan: 计划中没有 `TODO`、`TBD`、`later` 一类占位项，测试命令和改动文件均已写明。
- Type consistency: 全程使用 `entry.key -> icon-{{ entry.key|replace('_', '-') }}` 这一条命名规则，和 `templates/partials/app_nav.html` 当前实现保持一致。
