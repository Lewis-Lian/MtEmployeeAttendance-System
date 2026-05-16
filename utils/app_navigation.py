from __future__ import annotations

from copy import deepcopy
from typing import Any

from models.user import EMPLOYEE_PAGE_PERMISSION_KEYS, HOME_PAGE_PERMISSION_KEYS, MANAGER_PAGE_PERMISSION_KEYS


QUERY_CENTER_PERMISSION_KEYS = (
    *HOME_PAGE_PERMISSION_KEYS,
    *EMPLOYEE_PAGE_PERMISSION_KEYS,
    *MANAGER_PAGE_PERMISSION_KEYS,
)


MODULES: list[dict[str, Any]] = [
    {
        "slug": "home",
        "label": "首页",
        "short_label": "首页",
        "description": "查看当前账号对应管理人员的首页概览。",
        "icon_key": "query-home",
        "entries": [
            {
                "key": "query_home",
                "label": "首页",
                "href": "/employee/home",
                "permission_key": "query_home",
                "description": "查看与账号工号匹配的管理人员考勤概览。",
            },
        ],
    },
    {
        "slug": "query",
        "label": "查询中心",
        "short_label": "查询",
        "description": "集中查看员工、管理人员、打卡、异常与汇总下载。",
        "icon_key": "attendance",
        "entries": [
            {
                "key": "employee_dashboard",
                "label": "员工考勤数据查询",
                "href": "/employee/dashboard",
                "permission_key": "employee_dashboard",
                "description": "按账套与员工范围查询最终考勤汇总。",
            },
            {
                "key": "abnormal_query",
                "label": "员工异常查询",
                "href": "/employee/abnormal-query",
                "permission_key": "abnormal_query",
                "description": "查看员工异常考勤与需要关注的数据。",
            },
            {
                "key": "punch_records",
                "label": "员工打卡数据查询",
                "href": "/employee/punch-records",
                "permission_key": "punch_records",
                "description": "查询原始打卡记录和明细。",
            },
            {
                "key": "department_hours_query",
                "label": "员工部门工时",
                "href": "/employee/department-hours-query",
                "permission_key": "department_hours_query",
                "description": "按部门查看员工工时汇总。",
            },
            {
                "key": "manager_query",
                "label": "管理人员考勤数据查询",
                "href": "/employee/manager-query",
                "permission_key": "manager_query",
                "description": "查询管理人员月度考勤结果。",
            },
            {
                "key": "manager_overtime_query",
                "label": "管理人员加班查询",
                "href": "/employee/manager-overtime-query",
                "permission_key": "manager_overtime_query",
                "description": "查询管理人员加班记录。",
            },
            {
                "key": "manager_annual_leave_query",
                "label": "管理人员年休查询",
                "href": "/employee/manager-annual-leave-query",
                "permission_key": "manager_annual_leave_query",
                "description": "查询管理人员年休记录。",
            },
            {
                "key": "manager_department_hours_query",
                "label": "管理人员部门工时",
                "href": "/employee/manager-department-hours-query",
                "permission_key": "manager_department_hours_query",
                "description": "按部门查询管理人员工时。",
            },
            {
                "key": "summary_download",
                "label": "汇总下载",
                "href": "/employee/summary-download",
                "permission_key": "summary_download",
                "description": "下载月度考勤汇总文件。",
            },
        ],
    },
    {
        "slug": "account",
        "label": "账套中心",
        "short_label": "账套",
        "description": "维护月度账套、上传原始表并执行计算入库。",
        "icon_key": "account-dashboard",
        "entries": [
            {
                "key": "account_dashboard",
                "label": "账套管理",
                "href": "/admin/dashboard",
                "admin_only": True,
                "description": "创建账套、保存参数、上传原始表和查看导入记录。",
            },
        ],
    },
    {
        "slug": "master-data",
        "label": "主数据",
        "short_label": "主数据",
        "description": "维护员工、部门、班次等基础数据。",
        "icon_key": "departments",
        "entries": [
            {
                "key": "employees",
                "label": "员工管理",
                "href": "/admin/employees/manage",
                "admin_only": True,
                "description": "维护员工基础信息、归属部门、班次和统计口径。",
            },
            {
                "key": "departments",
                "label": "部门管理",
                "href": "/admin/departments/manage",
                "admin_only": True,
                "description": "维护部门层级、导入导出组织主数据。",
            },
            {
                "key": "shifts",
                "label": "班次管理",
                "href": "/admin/shifts/manage",
                "admin_only": True,
                "description": "维护班次和工作时段规则。",
            },
        ],
    },
    {
        "slug": "corrections",
        "label": "修正中心",
        "short_label": "修正",
        "description": "处理考勤修正、加班、年休等需要审慎操作的数据。",
        "icon_key": "manager-attendance-overrides",
        "entries": [
            {
                "key": "employee_attendance_overrides",
                "label": "员工考勤修正",
                "href": "/admin/employee-attendance-overrides",
                "admin_only": True,
                "description": "按员工和月份修正考勤结果并查看历史。",
            },
            {
                "key": "manager_attendance_overrides",
                "label": "管理人员考勤修正",
                "href": "/admin/manager-attendance-overrides",
                "admin_only": True,
                "description": "修正管理人员考勤统计结果。",
            },
            {
                "key": "manager_overtime",
                "label": "管理人员加班",
                "href": "/admin/manager-overtime",
                "admin_only": True,
                "description": "维护管理人员加班信息。",
            },
            {
                "key": "manager_annual_leave",
                "label": "管理人员年休",
                "href": "/admin/manager-annual-leave",
                "admin_only": True,
                "description": "维护管理人员年休信息。",
            },
        ],
    },
    {
        "slug": "settings",
        "label": "系统设置",
        "short_label": "设置",
        "description": "管理账号、角色和页面访问范围。",
        "icon_key": "accounts",
        "entries": [
            {
                "key": "accounts",
                "label": "账号管理",
                "href": "/admin/accounts",
                "admin_only": True,
                "description": "维护管理员和只读账号权限。",
            },
        ],
    },
]


def _is_admin(user: Any) -> bool:
    return bool(user and getattr(user, "role", None) == "admin")


def can_access_entry(user: Any, entry: dict[str, Any]) -> bool:
    if not user:
        return False
    if _is_admin(user):
        return True
    if entry.get("admin_only"):
        return False
    if entry.get("requires_any_page_access"):
        has_any_page_access = getattr(user, "has_any_page_access", None)
        return bool(has_any_page_access and has_any_page_access(QUERY_CENTER_PERMISSION_KEYS))
    permission_key = entry.get("permission_key")
    if permission_key:
        can_access_page = getattr(user, "can_access_page", None)
        return bool(can_access_page and can_access_page(permission_key))
    return False


def visible_entries(user: Any, module: dict[str, Any]) -> list[dict[str, Any]]:
    return [deepcopy(entry) for entry in module.get("entries", []) if can_access_entry(user, entry)]


def visible_modules(user: Any) -> list[dict[str, Any]]:
    modules: list[dict[str, Any]] = []
    for module in MODULES:
        entries = visible_entries(user, module)
        if not entries:
            continue
        copy_module = deepcopy(module)
        copy_module["entries"] = entries
        copy_module["home_href"] = f"/module/{copy_module['slug']}"
        modules.append(copy_module)
    return modules


def module_by_slug(slug: str) -> dict[str, Any] | None:
    for module in MODULES:
        if module["slug"] == slug:
            copy_module = deepcopy(module)
            copy_module["home_href"] = f"/module/{copy_module['slug']}"
            return copy_module
    return None


def module_for_path(path: str) -> dict[str, Any] | None:
    if path.startswith("/module/"):
        slug = path.strip("/").split("/", 1)[1]
        return module_by_slug(slug)
    matches: list[tuple[int, dict[str, Any]]] = []
    for module in MODULES:
        for entry in module["entries"]:
            href = entry["href"]
            if path == href or path.startswith(f"{href}/"):
                matches.append((len(href), module))
    if not matches:
        return None
    return module_by_slug(max(matches, key=lambda item: item[0])[1]["slug"])


def nav_context(user: Any, path: str) -> dict[str, Any]:
    modules = visible_modules(user)
    current_module = module_for_path(path)
    if current_module:
        current_module = next((module for module in modules if module["slug"] == current_module["slug"]), None)
    if current_module is None and modules:
        current_module = modules[0]
    current_entries = []
    if current_module and current_module["slug"] != "home":
        current_entries = visible_entries(user, current_module)
    elif current_module and current_module["slug"] == "home" and len(modules) > 1:
        current_entries = visible_entries(user, modules[1])
    return {
        "modules": modules,
        "current_module": current_module,
        "current_entries": current_entries,
    }
