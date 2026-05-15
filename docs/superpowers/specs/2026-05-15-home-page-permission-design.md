# 首页加入菜单权限 & 权限标签文本修改

## 背景

当前"首页"(`/employee/home`) 通过 `requires_any_page_access: True` 控制访问——只要用户有任何查询中心页面权限就能看到首页，无法单独控制。需要将首页作为独立权限项加入账号管理的权限选择器，同时将相关标签文本从"菜单权限"改为更准确的表述。

## 设计

### 1. 权限定义 (`models/user.py`)

- `PAGE_PERMISSION_LABELS` 新增 `"query_home": "首页"`
- 新增 `HOME_PAGE_PERMISSION_KEYS = ("query_home",)`
- `ALL_PAGE_PERMISSION_KEYS` 前置 `*HOME_PAGE_PERMISSION_KEYS`
- `effective_page_permissions()` 向后兼容：对于 `HOME_PAGE_PERMISSION_KEYS` 中的 key，如果已有用户的 `page_permissions` JSON 中不包含该 key，默认返回 `True`

### 2. 导航 (`utils/app_navigation.py`)

- 首页 entry 从 `requires_any_page_access: True` 改为 `permission_key: "query_home"`
- `QUERY_CENTER_PERMISSION_KEYS` 纳入 `HOME_PAGE_PERMISSION_KEYS`

### 3. 路由保护 (`routes/employee.py`)

以下三个首页相关路由改用 `g.current_user.can_access_page("query_home")` 检查：
- `query_home_page()` — 首页页面
- `account_sets_api()` — 账套列表 API
- `home_manager_summary_api()` — 首页汇总 API

`departments_api()` 保持使用 `_can_access_query_center()`（多页面共享）。

### 4. 登录跳转 (`routes/auth.py`)

- `_landing_url_for_user()` 中的 `has_any_page_access` 检查纳入 `HOME_PAGE_PERMISSION_KEYS`
- 确保只有首页权限的用户登录后能正确跳转

### 5. 后端模板数据 (`routes/admin_accounts.py`)

- `accounts_page()` 新增 `home_page_permissions` 列表（group: "通用"）传给模板
- `_manager_self_query_permissions()` 默认包含 `"query_home": True`

### 6. 前端模板 (`templates/admin/accounts.html`)

权限目录 JSON 新增首位：
```json
{"key": "query_home", "label": "首页", "group": "通用"}
```

文本更新：
| 位置 | 修改前 | 修改后 |
|------|--------|--------|
| 创建表单 label | 菜单权限 | 账号页面权限 |
| 编辑弹窗 label | 菜单权限 | 编辑页面权限 |
| placeholder（创建/编辑） | 点击选择菜单权限 | 点击选择页面权限 |
| 批量按钮 | 批量修改菜单权限 | 批量修改页面权限 |
| 弹窗标题 | 选择菜单权限 | 选择页面权限 |

### 7. 前端 JS (`static/js/accounts.js`)

- `PAGE_LABELS` 新增 `query_home: "首页"`
- `permissionState` title 更新："创建账号页面权限" / "编辑页面权限" / "批量修改页面权限"
- 提示文本：`未选择菜单权限` → `未选择页面权限`，`已批量更新菜单权限` → `已批量更新页面权限`

### 8. 测试更新

- 所有 mock 用户 `can_access_page` 追加 `query_home`
- 权限 key 迭代纳入 `HOME_PAGE_PERMISSION_KEYS`

## 向后兼容性

- 管理员始终返回全部权限 `True`，不受影响
- 已有只读用户的 `page_permissions` JSON 不含 `query_home` key，`effective_page_permissions()` 对其默认返回 `True`
- 一键创建管理人员账号默认包含首页权限

## 验证方式

1. 账号管理页面：创建表单权限标签显示"账号页面权限"，编辑弹窗显示"编辑页面权限"
2. 权限选择器弹出：看到"通用"分组下的"首页"，以及原有的管理和员工分组
3. 编辑已有只读用户：首页权限默认勾选
4. 取消首页权限后：该用户登录不显示首页入口，直接访问 `/employee/home` 返回 403
5. 管理员始终可见全部内容
