"""考勤视图查询的请求级缓存测试。

同一 Flask 请求（app context）内，相同 (month, emp_ids, context) 参数的
attendance_views_by_employee 重复调用应命中缓存、不再访问数据库；
不同参数或无 app context 时行为不变。
"""

from __future__ import annotations

import os
import tempfile
import unittest
from datetime import date

from flask import Flask

from models import db
import app  # noqa: F401 —— 触发全部模型注册到 metadata，使 db.create_all() 建全表
from models.daily_record import DailyRecord
from models.department import Department
from models.employee import Employee
from services.attendance_source_service import (
    EMPLOYEE_STATS_CONTEXT,
    MANAGER_STATS_CONTEXT,
    attendance_views_by_employee,
)


class AttendanceViewsRequestCacheTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmpdir.name, "test.db")
        self.flask_app = Flask(__name__)
        self.flask_app.config.update(
            SQLALCHEMY_DATABASE_URI=f"sqlite:///{self.db_path}",
            SQLALCHEMY_TRACK_MODIFICATIONS=False,
        )
        db.init_app(self.flask_app)
        with self.flask_app.app_context():
            db.create_all()
            dept = Department(dept_no="D001", dept_name="研发部")
            db.session.add(dept)
            db.session.flush()
            employee = Employee(emp_no="E001", name="员工甲", dept_id=dept.id, is_manager=False)
            db.session.add(employee)
            db.session.flush()
            db.session.add(
                DailyRecord(
                    emp_id=employee.id,
                    record_date=date(2026, 5, 11),
                    employee_payload={"actual_hours": 8, "late_minutes": 10},
                )
            )
            db.session.commit()
            self.employee_id = employee.id

    def tearDown(self) -> None:
        self.tmpdir.cleanup()

    def _fetch_employee(self) -> Employee:
        return db.session.get(Employee, self.employee_id)

    def test_same_request_repeated_call_hits_cache(self) -> None:
        with self.flask_app.app_context():
            employee = self._fetch_employee()
            first = attendance_views_by_employee("2026-05", [employee], EMPLOYEE_STATS_CONTEXT)
            # 库里插入新记录：若第二次仍查库，结果会变化
            db.session.add(
                DailyRecord(
                    emp_id=self.employee_id,
                    record_date=date(2026, 5, 12),
                    employee_payload={"actual_hours": 8, "late_minutes": 5},
                )
            )
            db.session.commit()
            second = attendance_views_by_employee("2026-05", [employee], EMPLOYEE_STATS_CONTEXT)
            self.assertEqual(len(first[self.employee_id]), 1)
            self.assertEqual(second, first)  # 命中缓存，看不到新插入的记录

    def test_different_context_or_month_queries_independently(self) -> None:
        with self.flask_app.app_context():
            employee = self._fetch_employee()
            employee_ctx = attendance_views_by_employee("2026-05", [employee], EMPLOYEE_STATS_CONTEXT)
            # manager 上下文会 fallback 到 employee payload，也应有数据，但属于独立查询
            manager_ctx = attendance_views_by_employee("2026-05", [employee], MANAGER_STATS_CONTEXT)
            other_month = attendance_views_by_employee("2026-06", [employee], EMPLOYEE_STATS_CONTEXT)
            self.assertEqual(len(employee_ctx[self.employee_id]), 1)
            self.assertEqual(len(manager_ctx[self.employee_id]), 1)
            self.assertIsNot(manager_ctx[self.employee_id], employee_ctx[self.employee_id])
            self.assertEqual(other_month[self.employee_id], [])  # 不同月份 key 不同，独立查询

    def test_manager_zero_values_do_not_fallback_to_shared_employee_columns(self) -> None:
        with self.flask_app.app_context():
            dept = Department.query.first()
            manager = Employee(emp_no="M001", name="经理甲", dept_id=dept.id, is_manager=True)
            db.session.add(manager)
            db.session.flush()
            db.session.add(
                DailyRecord(
                    emp_id=manager.id,
                    record_date=date(2026, 5, 14),
                    actual_hours=8,
                    late_minutes=12,
                    early_leave_minutes=4,
                    employee_payload={
                        "actual_hours": 8,
                        "late_minutes": 12,
                        "early_leave_minutes": 4,
                    },
                    manager_payload={
                        "actual_hours": 0,
                        "late_minutes": 0,
                        "early_leave_minutes": 0,
                        "raw_data": {"上班1打卡时间": "08:00", "下班1打卡时间": "17:00"},
                    },
                )
            )
            db.session.commit()

            rows = attendance_views_by_employee("2026-05", [manager], MANAGER_STATS_CONTEXT)[manager.id]

            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0].actual_hours, 0)
            self.assertEqual(rows[0].late_minutes, 0)
            self.assertEqual(rows[0].early_leave_minutes, 0)

    def test_manager_context_falls_back_to_employee_payload_when_manager_payload_missing(self) -> None:
        with self.flask_app.app_context():
            dept = Department.query.first()
            manager = Employee(emp_no="M002", name="经理乙", dept_id=dept.id, is_manager=True)
            db.session.add(manager)
            db.session.flush()
            db.session.add(
                DailyRecord(
                    emp_id=manager.id,
                    record_date=date(2026, 5, 15),
                    actual_hours=8,
                    raw_data={"刷卡时间数据": "08:00,17:00"},
                    employee_payload={
                        "actual_hours": 8,
                        "late_minutes": 0,
                        "early_leave_minutes": 0,
                        "raw_data": {"刷卡时间数据": "08:00,17:00"},
                    },
                )
            )
            db.session.commit()

            rows = attendance_views_by_employee("2026-05", [manager], MANAGER_STATS_CONTEXT)[manager.id]

            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0].source, "employee")
            self.assertEqual(rows[0].actual_hours, 8)

    def test_cache_does_not_leak_across_requests(self) -> None:
        # 缓存挂在 flask.g 上，新请求（新 app context）必须重新查库
        with self.flask_app.app_context():
            employee = self._fetch_employee()
            first = attendance_views_by_employee("2026-05", [employee], EMPLOYEE_STATS_CONTEXT)
            self.assertEqual(len(first[self.employee_id]), 1)

        with self.flask_app.app_context():
            db.session.add(
                DailyRecord(
                    emp_id=self.employee_id,
                    record_date=date(2026, 5, 13),
                    employee_payload={"actual_hours": 8},
                )
            )
            db.session.commit()
            employee = self._fetch_employee()
            second = attendance_views_by_employee("2026-05", [employee], EMPLOYEE_STATS_CONTEXT)
            self.assertEqual(len(second[self.employee_id]), 2)


if __name__ == "__main__":
    unittest.main()
