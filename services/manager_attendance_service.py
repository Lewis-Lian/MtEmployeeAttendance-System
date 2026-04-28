from __future__ import annotations

import calendar
import math
from dataclasses import dataclass

from sqlalchemy import func

from models import db
from models.employee import Employee
from models.monthly_report import MonthlyReport
from models.daily_record import DailyRecord
from models.leave import LeaveRecord
from models.manager_month_stat import ManagerMonthStat


MANAGER_HEADERS = [
    "部   门",
    "姓名",
    "出勤天数",
    "事/病假",
    "工伤",
    "出差",
    "婚假",
    "丧假",
    "迟到\\早退",
    "汇总",
    "福利天数",
    "加班变化",
    "备注",
]


@dataclass
class ManagerAttendanceOptions:
    month: str
    factory_rest_days: float = 0.0
    monthly_benefit_days: float = 0.0


def _round2(value: float) -> float:
    return round(float(value or 0), 2)


def _float_value(value: object) -> float:
    if value in (None, ""):
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _int_value(value: object) -> int:
    return int(round(_float_value(value)))


def _raw_float(raw: dict, *keys: str) -> float:
    for key in keys:
        value = raw.get(key)
        if value not in (None, ""):
            return _float_value(value)
    return 0.0


def _raw_minutes(raw: dict, *keys: str) -> int:
    return sum(_int_value(raw.get(key)) for key in keys)


def _manager_raw_score(raw: dict) -> int:
    score = 0
    for key in (
        "出勤天数",
        "工作时长",
        "迟到时长",
        "严重迟到时长",
        "早退时长",
        "出差时长",
        "请假/年假(天)",
        "请假/事假(小时)",
        "请假/病假(小时)",
        "请假/调休(小时)",
        "请假/婚假(天)",
        "请假/丧假(天)",
        "加班时长-按加班规则计算/工作日加班",
    ):
        if raw.get(key) not in (None, ""):
            score += 10
    score += sum(1 for value in raw.values() if value not in (None, ""))
    return score


def _month_days(month: str) -> int:
    year, month_no = [int(x) for x in month.split("-", 1)]
    return calendar.monthrange(year, month_no)[1]


def _stat_year_key(month: str) -> tuple[int, str]:
    year, month_no = [int(x) for x in month.split("-", 1)]
    return year, f"m{month_no}"


def normalize_days(value: float | int | None) -> float:
    """Convert decimal hours to days using the rule:
    <0.084 -> 0 days, >=0.084 and <0.17 -> 0.5 days, >=0.17 -> 1 day.
    Values > 3 are treated as hours and divided by 8.
    """
    raw = float(value or 0)
    if raw <= 0:
        return 0.0
    if raw > 3:
        return _round2(raw / 8)

    integer = math.floor(raw)
    fraction = round(raw - integer, 5)

    # >= 0.17 means 1 day for this fraction
    if fraction >= 0.17:
        return float(integer + 1)
    # >= 0.084 and < 0.17 means 0.5 day
    if fraction >= 0.084:
        return float(integer) + 0.5
    # < 0.084 means 0 day
    return float(integer)


def _leave_bucket(value: str | None) -> str:
    text = (value or "").strip()
    if "工伤" in text:
        return "injury"
    if "出差" in text:
        return "business_trip"
    if "婚" in text:
        return "marriage"
    if "丧" in text:
        return "funeral"
    if "补休" in text or "调休" in text:
        return "time_off"
    if "事假" in text or "病假" in text or "请假" in text:
        return "personal_sick"
    return ""


def _monthly_report_raw(employee_id: int, month: str) -> dict:
    rows = MonthlyReport.query.filter_by(emp_id=employee_id, report_month=month).all()
    candidates = [row.raw_data for row in rows if isinstance(row.raw_data, dict)]
    manager_candidates = [raw for raw in candidates if "出勤天数" in raw]
    if manager_candidates:
        return max(manager_candidates, key=_manager_raw_score)

    # Older imports of "2026年_3月管理人员..." were parsed as 1970-01.
    # Prefer the manager-style raw shape when the correctly keyed row is absent
    # or was overwritten by ordinary employee monthly data.
    fallback_rows = (
        MonthlyReport.query.filter_by(emp_id=employee_id, report_month="1970-01")
        .filter(MonthlyReport.raw_data.isnot(None))
        .all()
    )
    fallback_candidates = [
        row.raw_data for row in fallback_rows if isinstance(row.raw_data, dict) and "出勤天数" in row.raw_data
    ]
    if fallback_candidates:
        return max(fallback_candidates, key=_manager_raw_score)
    return candidates[0] if candidates else {}


def _leave_rows(employee_id: int, month: str) -> list[LeaveRecord]:
    return (
        LeaveRecord.query.filter_by(emp_id=employee_id)
        .filter(func.strftime("%Y-%m", LeaveRecord.start_time) == month)
        .all()
    )


def _manager_month_stat(employee_id: int, month: str, stat_type: str) -> ManagerMonthStat | None:
    year, _key = _stat_year_key(month)
    return ManagerMonthStat.query.filter_by(emp_id=employee_id, year=year, stat_type=stat_type).first()


def _stat_month_value(row: ManagerMonthStat | None, month: str) -> float | None:
    if not row:
        return None
    _year, key = _stat_year_key(month)
    return _round2(getattr(row, key) or 0)


def _required_stat_month_value(row: ManagerMonthStat | None, month: str) -> float:
    value = _stat_month_value(row, month)
    return _round2(value or 0)


def _stat_remaining(stat_type: str, emp_id: int, month: str) -> float:
    """Get remaining balance before the current month's value is applied."""
    row = _manager_month_stat(emp_id, month, stat_type)
    if not row:
        return 12.0 if stat_type == "annual_leave" else 0.0
    return _round2(row.remaining or 0)


def _write_manager_month_stat(stat_type: str, emp_id: int, month: str, used_days: float, sync_all_months: bool = True) -> None:
    """Write the computed used_days back to the ManagerMonthStat for the given month.
    - For annual_leave: positive = used (consumed from remaining).
    - For overtime: positive = overtime earned, negative = used (consumed from remaining).
    When sync_all_months=True, also recalculates remaining across all months.
    """
    year, key = _stat_year_key(month)
    row = ManagerMonthStat.query.filter_by(emp_id=emp_id, year=year, stat_type=stat_type).first()
    if not row:
        row = ManagerMonthStat(emp_id=emp_id, year=year, stat_type=stat_type)
        db.session.add(row)

    if stat_type == "annual_leave":
        row.prev_dec = 0

    # Set the current month's value
    setattr(row, key, _round2(used_days))

    if sync_all_months:
        _recalc_remaining(row, stat_type)

    db.session.flush()


def _recalc_remaining(row: ManagerMonthStat, stat_type: str) -> None:
    """Recalculate remaining for a stat row based on all month values."""
    value_keys = _annual_leave_value_keys() if stat_type == "annual_leave" else _month_value_keys()
    total = sum(_float_value(getattr(row, key)) for key in value_keys)
    if stat_type == "annual_leave":
        row.remaining = _round2(12 - total)
    else:
        row.remaining = _round2(total)


def _annual_leave_value_keys() -> list[str]:
    return [f"m{m}" for m in range(1, 13)]


def _month_value_keys() -> list[str]:
    return ["prev_dec", *[f"m{m}" for m in range(1, 13)]]


def _compute_overtime_used(emp_id: int, month: str) -> float:
    """Compute how many overtime days can be used for deduction this month.
    - If the month's stat value is non-zero, reset it to 0 first.
    - Then use from remaining balance, max 5 days, cannot go negative.
    Returns: the number of overtime days used (as a negative number to indicate consumption).
    """
    year, key = _stat_year_key(month)
    row = ManagerMonthStat.query.filter_by(emp_id=emp_id, year=year, stat_type="overtime").first()
    if not row:
        return 0.0

    # Check if current month already has a value (non-zero), reset to 0
    current = _float_value(getattr(row, key))
    if current != 0:
        setattr(row, key, 0.0)
        _recalc_remaining(row, "overtime")

    remaining = _round2(row.remaining or 0)
    if remaining <= 0:
        return 0.0

    # Max 5 days can be used
    return min(remaining, 5.0)


def _compute_benefit_used(emp_id: int, month: str, factory_rest_days: float) -> float:
    """Compute how many annual leave (年休/福利) days can be used this month.
    - If the month's stat value is non-zero, reset it to 0 first.
    - Then use from remaining balance.
    Constraints:
      - Max 3 days per month
      - 厂休 + 年休 <= 7 days per month
      - Cannot exceed remaining
    Returns: the number of annual leave days used.
    """
    year, key = _stat_year_key(month)
    row = ManagerMonthStat.query.filter_by(emp_id=emp_id, year=year, stat_type="annual_leave").first()
    if not row:
        return 0.0

    # Check if current month already has a value (non-zero), reset to 0
    current = _float_value(getattr(row, key))
    if current != 0:
        setattr(row, key, 0.0)
        _recalc_remaining(row, "annual_leave")

    remaining = _round2(row.remaining or 0)
    if remaining <= 0:
        return 0.0

    # Constraint 1: max 3 days per month
    available = min(remaining, 3.0)

    # Constraint 2: 厂休 + 年休 <= 7
    max_benefit_for_rest = _round2(7.0 - factory_rest_days)
    if max_benefit_for_rest < 0:
        max_benefit_for_rest = 0.0
    available = min(available, max_benefit_for_rest)

    return available


def _manager_schedule_late_minutes(employee_id: int, month: str) -> int:
    """Only count 上午 (上班1) late minutes from the daily record raw data.
    哺乳假人员迟到计为0。
    """
    employee = Employee.query.get(employee_id)
    if employee and employee.is_nursing:
        return 0
    rows = (
        DailyRecord.query.filter_by(emp_id=employee_id)
        .filter(func.strftime("%Y-%m", DailyRecord.record_date) == month)
        .all()
    )
    total = 0
    for row in rows:
        raw = row.raw_data if isinstance(row.raw_data, dict) else {}
        # Only check 上班1 (上午) for late
        result = str(raw.get("上班1打卡结果") or "")
        if "迟到" not in result:
            continue
        total += _raw_minutes(raw, "迟到时长", "严重迟到时长")
    return total


def build_manager_rows(options: ManagerAttendanceOptions, emp_ids: list[int] | None = None) -> list[dict[str, object]]:
    query = Employee.query.filter_by(is_manager=True)
    if emp_ids is not None:
        if not emp_ids:
            return []
        query = query.filter(Employee.id.in_(emp_ids))
    employees = query.order_by(Employee.dept_id.asc(), Employee.emp_no.asc(), Employee.name.asc()).all()
    rows: list[dict[str, object]] = []
    month_days = _month_days(options.month)

    for employee in employees:
        raw = _monthly_report_raw(employee.id, options.month)
        raw_attendance_days = _raw_float(raw, "出勤天数")

        # 哺乳假管理人员不计算迟到\早退
        if employee.is_nursing:
            late_early_minutes = 0
        else:
            late_early_minutes = _manager_schedule_late_minutes(employee.id, options.month)

        # Accumulate leave record days by category
        half_leave_days = 0.0
        half_time_off_days = 0.0
        injury_days = 0.0
        business_trip_days = 0.0
        marriage_days = 0.0
        funeral_days = 0.0

        for leave in _leave_rows(employee.id, options.month):
            days = normalize_days(leave.duration)
            bucket = _leave_bucket(leave.leave_type)
            if bucket == "injury":
                injury_days += days
            elif bucket == "business_trip":
                business_trip_days += days
            elif bucket == "marriage":
                marriage_days += days
            elif bucket == "funeral":
                funeral_days += days
            elif bucket == "personal_sick" and days == 0.5:
                half_leave_days += days
            elif bucket == "time_off" and days == 0.5:
                half_time_off_days += days

        # 出勤天数 = 管理人员月报里面的天数 - 请假半天的天数 - 加班半天的天数
        attendance_days = _round2(raw_attendance_days - half_leave_days - half_time_off_days)

        # 事/病假 = 需要扣除工资的天数
        # 按 本月天数 - 出勤天数 - 厂休天数 - 婚假天数 - 丧假天数 - 加班天数 - 福利天数 的顺序减免
        absence_gap = _round2(
            month_days
            - attendance_days
            - options.factory_rest_days
            - marriage_days
            - funeral_days
        )

        if absence_gap < 0:
            # 出勤天数 + 厂休 + 婚假 + 丧假 > 本月天数 → 本月有加班！
            overtime_earned = _round2(abs(absence_gap))
            used_overtime = 0.0
            used_benefit = 0.0
            personal_sick_days = 0.0
            overtime_change = overtime_earned
            # 写回加班表（正数 = 加班）
            _write_manager_month_stat("overtime", employee.id, options.month, overtime_earned)
        else:
            overtime_earned = 0.0

            # Step 1: use overtime days (from remaining balance, max 5)
            available_overtime = _compute_overtime_used(employee.id, options.month)
            overtime_for_deduction = min(absence_gap, available_overtime) if absence_gap > 0 else 0.0
            used_overtime = _round2(overtime_for_deduction)

            # Step 2: use benefit days (annual leave, from remaining, with constraints)
            remaining_after_overtime = _round2(max(absence_gap - used_overtime, 0.0))
            available_benefit = _compute_benefit_used(employee.id, options.month, options.factory_rest_days)
            benefit_for_deduction = min(remaining_after_overtime, available_benefit) if remaining_after_overtime > 0 else 0.0
            used_benefit = _round2(benefit_for_deduction)

            # Step 3: anything left is 事/病假 (deductible)
            personal_sick_days = _round2(max(remaining_after_overtime - used_benefit, 0.0))

            # Write back to stats tables
            if used_overtime > 0:
                _write_manager_month_stat("overtime", employee.id, options.month, -used_overtime)
            if used_benefit > 0:
                _write_manager_month_stat("annual_leave", employee.id, options.month, used_benefit)

            # 加班变化 = 使用了剩余加班天数用负数表示
            overtime_change = -used_overtime if used_overtime > 0 else 0.0

        # 汇总 = 扣除天数 + 迟到罚款(1元/分钟)
        summary_parts: list[str] = []
        if personal_sick_days > 0:
            summary_parts.append(f"扣{personal_sick_days:g}天")
        if late_early_minutes > 0:
            summary_parts.append(f"{late_early_minutes}元")

        # 备注
        remark_parts: list[str] = []
        if late_early_minutes > 0:
            remark_parts.append("迟到")
        if injury_days > 0:
            remark_parts.append(f"工伤{injury_days:g}天")

        rows.append(
            {
                "dept_name": employee.department.dept_name if employee.department else "",
                "name": employee.name,
                "attendance_days": attendance_days,
                "personal_sick_days": personal_sick_days,
                "injury_days": _round2(injury_days),
                "business_trip_days": _round2(business_trip_days),
                "marriage_days": _round2(marriage_days),
                "funeral_days": _round2(funeral_days),
                "late_early_minutes": late_early_minutes,
                "summary": "，".join(summary_parts),
                "benefit_days": used_benefit,
                "overtime_change": overtime_change,
                "remark": "，".join(remark_parts),
            }
        )

    return rows


def rows_as_table(rows: list[dict[str, object]]) -> list[list[object]]:
    return [
        [
            row.get("dept_name", ""),
            row.get("name", ""),
            row.get("attendance_days", 0),
            row.get("personal_sick_days", 0),
            row.get("injury_days", 0),
            row.get("business_trip_days", 0),
            row.get("marriage_days", 0),
            row.get("funeral_days", 0),
            row.get("late_early_minutes", 0),
            row.get("summary", ""),
            row.get("benefit_days", 0),
            row.get("overtime_change", 0),
            row.get("remark", ""),
        ]
        for row in rows
    ]
