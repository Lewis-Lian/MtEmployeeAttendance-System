from __future__ import annotations

import re
from copy import deepcopy
from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy.orm import joinedload

from models.daily_record import DailyRecord
from models.employee import (
    ATTENDANCE_SOURCE_AUTO_FALLBACK,
    ATTENDANCE_SOURCE_EMPLOYEE,
    ATTENDANCE_SOURCE_MANAGER,
    Employee,
)
from models.monthly_report import MonthlyReport


EMPLOYEE_STATS_CONTEXT = "employee_stats"
MANAGER_STATS_CONTEXT = "manager_stats"


@dataclass
class AttendanceRecordView:
    employee: Employee | None
    shift: object
    record_date: date | None
    source: str
    expected_hours: float
    actual_hours: float
    absent_hours: float
    check_in_times: list[object]
    check_out_times: list[object]
    leave_hours: float
    leave_type: str | None
    overtime_hours: float
    overtime_type: str | None
    late_minutes: int
    early_leave_minutes: int
    exception_reason: str | None
    raw_data: dict


def _month_date_range(month: str) -> tuple[date, date] | None:
    try:
        start = datetime.strptime(month, "%Y-%m").date().replace(day=1)
    except ValueError:
        return None
    if start.month == 12:
        return start, date(start.year + 1, 1, 1)
    return start, date(start.year, start.month + 1, 1)


def _payload_for_source(record: DailyRecord, source: str) -> dict:
    if source == ATTENDANCE_SOURCE_MANAGER:
        payload = record.manager_payload
    else:
        payload = record.employee_payload
    if isinstance(payload, dict) and payload:
        return payload
    raw = record.raw_data if isinstance(record.raw_data, dict) else {}
    return raw if isinstance(raw, dict) else {}


def _record_has_source_payload(record: DailyRecord, source: str) -> bool:
    payload = _payload_for_source(record, source)
    if payload:
        return True
    if source == ATTENDANCE_SOURCE_EMPLOYEE:
        return bool(record.check_in_times or record.check_out_times or record.shift_id or record.expected_hours or record.absent_hours)
    return bool(record.actual_hours or record.late_minutes or record.early_leave_minutes)


def _payload_value_or_fallback(payload: dict, key: str, fallback: object) -> object:
    value = payload.get(key)
    if value is None or value == "":
        return fallback
    return value


def _select_sources(configured_source: str, default_source: str) -> list[str]:
    source = configured_source or default_source
    if source == ATTENDANCE_SOURCE_AUTO_FALLBACK:
        if default_source == ATTENDANCE_SOURCE_MANAGER:
            return [ATTENDANCE_SOURCE_MANAGER, ATTENDANCE_SOURCE_EMPLOYEE]
        return [ATTENDANCE_SOURCE_EMPLOYEE, ATTENDANCE_SOURCE_MANAGER]
    if source == ATTENDANCE_SOURCE_MANAGER:
        return [ATTENDANCE_SOURCE_MANAGER, ATTENDANCE_SOURCE_EMPLOYEE]
    return [ATTENDANCE_SOURCE_EMPLOYEE, ATTENDANCE_SOURCE_MANAGER]


def attendance_source_for_context(employee: Employee, context: str) -> str:
    if context == MANAGER_STATS_CONTEXT:
        return employee.manager_stats_attendance_source or ATTENDANCE_SOURCE_MANAGER
    return employee.employee_stats_attendance_source or ATTENDANCE_SOURCE_EMPLOYEE



def build_attendance_record_view(record: DailyRecord, employee: Employee, context: str) -> AttendanceRecordView | None:
    configured_source = attendance_source_for_context(employee, context)
    default_source = ATTENDANCE_SOURCE_MANAGER if context == MANAGER_STATS_CONTEXT else ATTENDANCE_SOURCE_EMPLOYEE
    selected_source = None
    for source in _select_sources(configured_source, default_source):
        if _record_has_source_payload(record, source):
            selected_source = source
            break
    if not selected_source:
        return None

    payload = deepcopy(_payload_for_source(record, selected_source))
    if isinstance(payload, dict):
        if selected_source == ATTENDANCE_SOURCE_EMPLOYEE:
            fallback_payload = record.manager_payload if isinstance(record.manager_payload, dict) else {}
        else:
            fallback_payload = record.employee_payload if isinstance(record.employee_payload, dict) else {}
        fallback_raw = fallback_payload.get("raw_data") if isinstance(fallback_payload.get("raw_data"), dict) else {}
        if fallback_raw:
            payload.setdefault("fallback_raw_data", deepcopy(fallback_raw))
    if selected_source == ATTENDANCE_SOURCE_MANAGER:
        actual_hours = float(_payload_value_or_fallback(payload, "actual_hours", record.actual_hours) or 0)
        late_minutes = int(_payload_value_or_fallback(payload, "late_minutes", record.late_minutes) or 0)
        early_leave_minutes = int(_payload_value_or_fallback(payload, "early_leave_minutes", record.early_leave_minutes) or 0)
        check_in_times = list(payload.get("check_in_times") or [])
        check_out_times = list(payload.get("check_out_times") or [])
        expected_hours = float(payload.get("expected_hours") or 0)
        absent_hours = float(payload.get("absent_hours") or 0)
        leave_hours = float(payload.get("leave_hours") or 0)
        overtime_hours = float(payload.get("overtime_hours") or 0)
        leave_type = payload.get("leave_type")
        overtime_type = payload.get("overtime_type")
        exception_reason = payload.get("exception_reason")
    else:
        actual_hours = float(payload.get("actual_hours") or 0)
        late_minutes = int(payload.get("late_minutes") or 0)
        early_leave_minutes = int(payload.get("early_leave_minutes") or 0)
        check_in_times = list(payload.get("check_in_times") or [])
        check_out_times = list(payload.get("check_out_times") or [])
        expected_hours = float(payload.get("expected_hours") or 0)
        absent_hours = float(payload.get("absent_hours") or 0)
        leave_hours = float(payload.get("leave_hours") or 0)
        overtime_hours = float(payload.get("overtime_hours") or 0)
        leave_type = payload.get("leave_type")
        overtime_type = payload.get("overtime_type")
        exception_reason = payload.get("exception_reason")

    return AttendanceRecordView(
        employee=record.employee,
        shift=record.shift,
        record_date=record.record_date,
        source=selected_source,
        expected_hours=expected_hours,
        actual_hours=actual_hours,
        absent_hours=absent_hours,
        check_in_times=check_in_times,
        check_out_times=check_out_times,
        leave_hours=leave_hours,
        leave_type=leave_type,
        overtime_hours=overtime_hours,
        overtime_type=overtime_type,
        late_minutes=late_minutes,
        early_leave_minutes=early_leave_minutes,
        exception_reason=exception_reason,
        raw_data=payload if isinstance(payload, dict) else {},
    )


def attendance_views_by_employee(month: str, employees: list[Employee], context: str) -> dict[int, list[AttendanceRecordView]]:
    if not employees:
        return {}
    # 请求级缓存：同一请求内相同 (month, emp_ids, context) 的重复调用直接复用结果。
    # 汇总导出等接口会对同一批员工反复取视图（final rows/异常行/部门工时等），
    # 该查询是全字段 DailyRecord joinedload 大查询，重复执行代价高。
    # 调用方均只读视图对象（不 mutate），共享引用安全；无 app context 时跳过缓存。
    cache: dict | None = None
    cache_key: tuple | None = None
    try:
        from flask import g, has_app_context

        if has_app_context():
            cache = getattr(g, "_attendance_views_cache", None)
            if cache is None:
                cache = {}
                g._attendance_views_cache = cache  # type: ignore[attr-defined]
            cache_key = (month, context, tuple(sorted(employee.id for employee in employees)))
            if cache_key in cache:
                return cache[cache_key]
    except RuntimeError:
        cache = None
    date_range = _month_date_range(month)
    if not date_range:
        return {}
    start_date, end_date = date_range
    emp_ids = [employee.id for employee in employees]
    rows = (
        DailyRecord.query.options(joinedload(DailyRecord.employee).joinedload(Employee.department), joinedload(DailyRecord.shift))
        .filter(DailyRecord.emp_id.in_(emp_ids))
        .filter(DailyRecord.record_date >= start_date, DailyRecord.record_date < end_date)
        .order_by(DailyRecord.record_date.asc())
        .all()
    )
    employees_by_id = {employee.id: employee for employee in employees}
    result: dict[int, list[AttendanceRecordView]] = {employee.id: [] for employee in employees}
    for row in rows:
        employee = employees_by_id.get(row.emp_id)
        if not employee:
            continue
        view = build_attendance_record_view(row, employee, context)
        if view is None:
            continue
        result.setdefault(row.emp_id, []).append(view)
    if cache is not None and cache_key is not None:
        cache[cache_key] = result
    return result


def selected_monthly_report_raw(employee: Employee, month: str, context: str) -> dict:
    rows = MonthlyReport.query.filter_by(emp_id=employee.id, report_month=month).all()
    candidates = []
    for row in rows:
        if context == MANAGER_STATS_CONTEXT:
            raw = row.manager_raw_data if isinstance(row.manager_raw_data, dict) and row.manager_raw_data else row.raw_data
        else:
            raw = row.employee_raw_data if isinstance(row.employee_raw_data, dict) and row.employee_raw_data else row.raw_data
        if isinstance(raw, dict) and raw:
            candidates.append(raw)
    return candidates[0] if candidates else {}


# ---- 实际出勤（打卡口径）共享函数 -------------------------------------------
# 员工侧与管理人员侧共用同一实现：当日有真实刷卡（≥1 次）记 1 天，
# 单日「实际打卡」修正（is_actual_attendance）优先：算 → 1、不算 → 0。


def _repair_mojibake(text: str) -> str:
    try:
        return text.encode("latin1").decode("gbk")
    except Exception:
        return text


def _stringify_raw_punch_value(value: object) -> str:
    if isinstance(value, list):
        normalized = [str(item).strip() for item in value if str(item).strip()]
        return ",".join(normalized)
    return str(value).strip()


def _normalize_punch_token(value: object) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    m = re.search(r"(\d{1,2}:\d{2})", text)
    if not m:
        return text
    hh, mm = m.group(1).split(":")
    return f"{int(hh):02d}:{mm}"


def _extract_raw_punch_data_from_dict(raw: dict) -> str:
    if not isinstance(raw, dict):
        return ""

    direct_keys = {"刷卡时间数据", "原始刷卡数据", "刷卡时间", "打卡记录"}
    for key in direct_keys:
        value = raw.get(key)
        if value is not None and _stringify_raw_punch_value(value):
            return _stringify_raw_punch_value(value)

    for key, value in raw.items():
        if value is None or not _stringify_raw_punch_value(value):
            continue
        repaired = _repair_mojibake(str(key))
        if ("刷卡" in repaired and "时间" in repaired) or ("打卡" in repaired and "记录" in repaired):
            return _stringify_raw_punch_value(value)

    manager_time_keys = (
        "上班1打卡时间",
        "下班1打卡时间",
        "上班2打卡时间",
        "下班2打卡时间",
        "上班3打卡时间",
        "下班3打卡时间",
        "上班4打卡时间",
        "下班4打卡时间",
    )
    manager_times: list[str] = []
    for key in manager_time_keys:
        token = _normalize_punch_token(raw.get(key))
        if token:
            manager_times.append(token)
    if manager_times:
        return ",".join(manager_times)

    return ""


def _extract_raw_punch_data(record) -> str:
    raw = record.raw_data or {}
    if not isinstance(raw, dict):
        raw = {}
    fallback_raw = raw.get("fallback_raw_data") if isinstance(raw.get("fallback_raw_data"), dict) else {}
    if isinstance(raw.get("raw_data"), dict):
        raw = raw.get("raw_data") or {}

    primary_value = _extract_raw_punch_data_from_dict(raw)
    if primary_value:
        return primary_value
    return _extract_raw_punch_data_from_dict(fallback_raw)


def _punch_round_count(record) -> int:
    raw = record.raw_data or {}
    if not isinstance(raw, dict):
        raw = {}
    if isinstance(raw.get("raw_data"), dict):
        raw = raw.get("raw_data") or {}

    in_events = {_normalize_punch_token(x) for x in (record.check_in_times or [])}
    in_events = {x for x in in_events if x}
    out_events = {_normalize_punch_token(x) for x in (record.check_out_times or [])}
    out_events = {x for x in out_events if x}

    overlap = in_events & out_events
    if overlap:
        in_events -= overlap
        out_events -= overlap

    # Query page shows "打卡轮次" (e.g. 上午+下午 = 2), not raw swipe points.
    rounds = max(len(in_events), len(out_events))
    if rounds:
        return rounds

    manager_pairs = (
        ("上班1打卡时间", "下班1打卡时间"),
        ("上班2打卡时间", "下班2打卡时间"),
        ("上班3打卡时间", "下班3打卡时间"),
        ("上班4打卡时间", "下班4打卡时间"),
    )
    manager_rounds = 0
    for in_key, out_key in manager_pairs:
        if str(raw.get(in_key) or "").strip() or str(raw.get(out_key) or "").strip():
            manager_rounds += 1
    return manager_rounds


def _raw_punch_count(record) -> int:
    raw = _extract_raw_punch_data(record)
    if raw:
        tokens = re.findall(r"(\d{1,2}:\d{2})", raw)
        if tokens:
            return len(tokens)
    return _punch_round_count(record)


def _actual_attendance_day_value(record) -> float:
    # 实际出勤天数（刷卡口径）：当日有真实刷卡（>= 1 次）记 1 天，无刷卡 0 天。
    return 1.0 if _raw_punch_count(record) >= 1 else 0.0


def _effective_actual_attendance_day_value(record, override) -> float:
    """当日实际出勤天数：实际打卡修正优先（勾选算→1、明确不算→0），否则按刷卡口径。"""
    if override is not None and override.is_actual_attendance is not None:
        return 1.0 if override.is_actual_attendance else 0.0
    if record is None:
        return 0.0
    return _actual_attendance_day_value(record)
