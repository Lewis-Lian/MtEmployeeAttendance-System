from __future__ import annotations

import csv
from io import StringIO
from models.daily_record import DailyRecord


class ReportService:
    @staticmethod
    def export_daily_records_csv(records: list[DailyRecord]) -> str:
        output = StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "工号", "姓名", "日期", "应出勤小时", "实出勤小时", "旷工小时", "请假小时", "加班小时", "迟到分钟", "早退分钟", "异常原因"
        ])
        for r in records:
            writer.writerow([
                r.employee.emp_no,
                r.employee.name,
                r.record_date.isoformat(),
                r.expected_hours,
                r.actual_hours,
                r.absent_hours,
                r.leave_hours,
                r.overtime_hours,
                r.late_minutes,
                r.early_leave_minutes,
                r.exception_reason or "",
            ])
        return output.getvalue()
