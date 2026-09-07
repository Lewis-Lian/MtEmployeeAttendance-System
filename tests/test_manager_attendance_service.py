import os
import tempfile
import unittest
from types import SimpleNamespace
from unittest import mock

from datetime import date, datetime

from flask import Flask

from models import db
from models.account_set import AccountSet, AccountSetFactoryRestDay
from models.annual_leave import AnnualLeave
from models.attendance_override_history import AttendanceOverrideHistory
from models.daily_attendance_override import DailyAttendanceOverride
from models.daily_record import DailyRecord
from models.department import Department
from models.employee import Employee
from models.employee_attendance_override import EmployeeAttendanceOverride
from models.employee_shift import EmployeeShiftAssignment
from models.leave import LeaveRecord
from models.manager_attendance_override import ManagerAttendanceOverride
from models.manager_month_stat import ManagerMonthStat
from models.monthly_report import MonthlyReport
from models.overtime import OvertimeRecord
from models.shift import Shift
from models.user import User
from models.user import UserDepartmentAssignment, UserEmployeeAssignment
from services.manager_attendance_service import (
    ManagerAttendanceOptions,
    build_manager_rows,
    manager_headers,
    normalize_days,
    rows_as_table,
)
from utils.helpers import overlap_duration_days


class NormalizeDaysTests(unittest.TestCase):
    def test_duration_over_three_is_still_treated_as_days(self) -> None:
        self.assertEqual(normalize_days(23.375), 24.0)

    def test_fractional_day_thresholds_still_apply(self) -> None:
        self.assertEqual(normalize_days(0.1), 0.5)
        self.assertEqual(normalize_days(0.25), 1.0)


class OverlapDurationDaysTests(unittest.TestCase):
    def test_splits_cross_month_leave_by_actual_overlap(self) -> None:
        start = datetime(2026, 4, 8, 8, 0, 0)
        end = datetime(2026, 5, 1, 17, 0, 0)

        april_days = overlap_duration_days(
            start,
            end,
            datetime(2026, 4, 1, 0, 0, 0),
            datetime(2026, 5, 1, 0, 0, 0),
        )
        may_days = overlap_duration_days(
            start,
            end,
            datetime(2026, 5, 1, 0, 0, 0),
            datetime(2026, 6, 1, 0, 0, 0),
        )

        self.assertAlmostEqual(april_days, 22.66667, places=5)
        self.assertAlmostEqual(may_days, 0.70833, places=5)
        self.assertEqual(normalize_days(april_days), 23.0)
        self.assertEqual(normalize_days(may_days), 1.0)


class ManagerLateSummaryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmpdir.name, "manager-attendance.db")

        app = Flask(__name__)
        app.config.update(
            TESTING=True,
            SQLALCHEMY_DATABASE_URI=f"sqlite:///{self.db_path}",
            SQLALCHEMY_TRACK_MODIFICATIONS=False,
        )
        db.init_app(app)
        self.app = app

        with self.app.app_context():
            db.create_all()
            dept = Department(dept_no="D001", dept_name="品质部")
            manager = Employee(emp_no="M001", name="吴利蓉", is_manager=True)
            db.session.add_all([dept, manager])
            db.session.flush()
            manager.dept_id = dept.id
            db.session.add(
                MonthlyReport(
                    emp_id=manager.id,
                    report_month="2026-04",
                    manager_raw_data={"出勤天数": 23, "迟到时长": 6},
                )
            )
            db.session.add_all(
                [
                    DailyRecord(
                        emp_id=manager.id,
                        record_date=date(2026, 4, 18),
                        late_minutes=3,
                        raw_data={"上班1打卡结果": "迟到", "迟到时长": 3},
                        manager_payload={
                            "late_minutes": 3,
                            "early_leave_minutes": 0,
                            "raw_data": {"上班1打卡结果": "迟到", "迟到时长": 3},
                        },
                    ),
                    DailyRecord(
                        emp_id=manager.id,
                        record_date=date(2026, 4, 30),
                        late_minutes=3,
                        raw_data={"上班1打卡结果": "迟到", "迟到时长": 3},
                        manager_payload={
                            "late_minutes": 3,
                            "early_leave_minutes": 0,
                            "raw_data": {"上班1打卡结果": "迟到", "迟到时长": 3},
                        },
                    ),
                ]
            )
            db.session.commit()
            self.manager_id = manager.id

    def tearDown(self) -> None:
        with self.app.app_context():
            db.session.remove()
            db.drop_all()
        self.tmpdir.cleanup()

    def test_manager_summary_counts_late_minutes_from_nested_manager_raw_data(self) -> None:
        with self.app.app_context():
            rows = build_manager_rows(
                ManagerAttendanceOptions(month="2026-04", factory_rest_days=7.0),
                [self.manager_id],
            )

        self.assertEqual(rows[0]["late_early_minutes"], 6)
        self.assertEqual(rows[0]["personal_sick_days"], 7.0)
        self.assertEqual(rows[0]["summary"], "扣7天，6元")

    def test_manager_summary_counts_late_minutes_even_when_day_reaches_thirty(self) -> None:
        with self.app.app_context():
            record = DailyRecord.query.filter_by(emp_id=self.manager_id, record_date=date(2026, 4, 18)).first()
            record.late_minutes = 30
            record.raw_data = {"上班1打卡结果": "迟到", "迟到时长": 30}
            record.manager_payload = {
                "late_minutes": 30,
                "early_leave_minutes": 0,
                "raw_data": {"上班1打卡结果": "迟到", "迟到时长": 30},
            }
            monthly = MonthlyReport.query.filter_by(emp_id=self.manager_id, report_month="2026-04").first()
            monthly.manager_raw_data = {"出勤天数": 23, "迟到时长": 33}
            db.session.commit()

            rows = build_manager_rows(
                ManagerAttendanceOptions(month="2026-04", factory_rest_days=7.0),
                [self.manager_id],
            )

        self.assertEqual(rows[0]["late_early_minutes"], 33)
        self.assertEqual(rows[0]["personal_sick_days"], 7.0)
        self.assertEqual(rows[0]["summary"], "扣7天，33元")

    def test_manager_summary_counts_all_late_penalty_when_every_late_day_reaches_thirty(self) -> None:
        with self.app.app_context():
            for record_date in (date(2026, 4, 18), date(2026, 4, 30)):
                record = DailyRecord.query.filter_by(emp_id=self.manager_id, record_date=record_date).first()
                record.late_minutes = 30
                record.raw_data = {"上班1打卡结果": "迟到", "迟到时长": 30}
                record.manager_payload = {
                    "late_minutes": 30,
                    "early_leave_minutes": 0,
                    "raw_data": {"上班1打卡结果": "迟到", "迟到时长": 30},
                }
            monthly = MonthlyReport.query.filter_by(emp_id=self.manager_id, report_month="2026-04").first()
            monthly.manager_raw_data = {"出勤天数": 23, "迟到时长": 60}
            db.session.commit()

            rows = build_manager_rows(
                ManagerAttendanceOptions(month="2026-04", factory_rest_days=7.0),
                [self.manager_id],
            )

        self.assertEqual(rows[0]["late_early_minutes"], 60)
        self.assertEqual(rows[0]["personal_sick_days"], 7.0)
        self.assertEqual(rows[0]["summary"], "扣7天，60元")


class ManagerAttendanceBatchingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmpdir.name, "manager-batching.db")

        app = Flask(__name__)
        app.config.update(
            TESTING=True,
            SQLALCHEMY_DATABASE_URI=f"sqlite:///{self.db_path}",
            SQLALCHEMY_TRACK_MODIFICATIONS=False,
        )
        db.init_app(app)
        self.app = app

        with self.app.app_context():
            db.create_all()
            dept = Department(dept_no="D001", dept_name="行政部")
            db.session.add(dept)
            db.session.flush()
            manager_a = Employee(emp_no="M001", name="经理甲", dept_id=dept.id, is_manager=True)
            manager_b = Employee(emp_no="M002", name="经理乙", dept_id=dept.id, is_manager=True)
            db.session.add_all([manager_a, manager_b])
            db.session.commit()
            self.manager_ids = [manager_a.id, manager_b.id]

    def tearDown(self) -> None:
        with self.app.app_context():
            db.session.remove()
            db.drop_all()
        self.tmpdir.cleanup()

    def test_build_manager_rows_batches_attendance_view_lookup_once_per_month(self) -> None:
        rows_by_employee = {
            self.manager_ids[0]: [
                SimpleNamespace(
                    raw_data={"上班1打卡结果": "迟到", "迟到时长": 5, "刷卡时间数据": "08:35"},
                    late_minutes=5,
                )
            ],
            self.manager_ids[1]: [
                SimpleNamespace(
                    raw_data={"上班1打卡结果": "正常", "刷卡时间数据": "08:01"},
                    late_minutes=0,
                )
            ],
        }

        with self.app.app_context():
            with mock.patch(
                "services.manager_attendance_service.attendance_views_by_employee",
                return_value=rows_by_employee,
            ) as attendance_lookup:
                rows = build_manager_rows(ManagerAttendanceOptions(month="2026-04"), self.manager_ids)

        self.assertEqual(attendance_lookup.call_count, 1)
        attendance_lookup.assert_called_once()
        self.assertEqual(len(rows), 2)

    def test_manager_employee_source_rows_count_employee_punch_data_as_attendance_days(self) -> None:
        with self.app.app_context():
            manager = db.session.get(Employee, self.manager_ids[0])
            manager.manager_stats_attendance_source = "employee"
            db.session.add_all(
                [
                    DailyRecord(
                        emp_id=manager.id,
                        record_date=date(2026, 4, 1),
                        actual_hours=8,
                        raw_data={"刷卡时间数据": "07:25,11:15,11:33,17:12"},
                        employee_payload={
                            "actual_hours": 8,
                            "raw_data": {"刷卡时间数据": "07:25,11:15,11:33,17:12"},
                        },
                    ),
                    DailyRecord(
                        emp_id=manager.id,
                        record_date=date(2026, 4, 2),
                        actual_hours=8,
                        raw_data={"刷卡时间数据": "07:30,11:16,12:59,20:36"},
                        employee_payload={
                            "actual_hours": 8,
                            "raw_data": {"刷卡时间数据": "07:30,11:16,12:59,20:36"},
                        },
                    ),
                ]
            )
            db.session.commit()

            rows = build_manager_rows(ManagerAttendanceOptions(month="2026-04"), [manager.id])

        self.assertEqual(rows[0]["attendance_days"], 2.0)


class ManagerFactoryRestOverlapTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmpdir.name, "manager-factory-rest.db")

        app = Flask(__name__)
        app.config.update(
            TESTING=True,
            SQLALCHEMY_DATABASE_URI=f"sqlite:///{self.db_path}",
            SQLALCHEMY_TRACK_MODIFICATIONS=False,
        )
        db.init_app(app)
        self.app = app

        with self.app.app_context():
            db.create_all()
            dept = Department(dept_no="D001", dept_name="行政部")
            manager = Employee(emp_no="M001", name="练义炜", is_manager=True)
            db.session.add_all([dept, manager])
            db.session.flush()
            manager.dept_id = dept.id

            account_set = AccountSet(month="2026-04", name="2026-04 账套", factory_rest_days=1.5)
            db.session.add(account_set)
            db.session.flush()
            db.session.add_all(
                [
                    AccountSetFactoryRestDay(
                        account_set_id=account_set.id,
                        rest_date=date(2026, 4, 8),
                        rest_period="full",
                    ),
                    AccountSetFactoryRestDay(
                        account_set_id=account_set.id,
                        rest_date=date(2026, 4, 9),
                        rest_period="am",
                    ),
                ]
            )
            db.session.add(
                MonthlyReport(
                    emp_id=manager.id,
                    report_month="2026-04",
                    manager_raw_data={"出勤天数": 2},
                )
            )
            db.session.commit()
            self.manager_id = manager.id

    def tearDown(self) -> None:
        with self.app.app_context():
            db.session.remove()
            db.drop_all()
        self.tmpdir.cleanup()

    def _add_leave(
        self,
        leave_no: str,
        leave_type: str,
        start_time: datetime,
        end_time: datetime,
    ) -> None:
        db.session.add(
            LeaveRecord(
                emp_id=self.manager_id,
                leave_no=leave_no,
                leave_type=leave_type,
                start_time=start_time,
                end_time=end_time,
            )
        )
        db.session.commit()

    def _build_rows(self, month: str = "2026-04", factory_rest_days: float = 1.5) -> list[dict[str, object]]:
        return build_manager_rows(
            ManagerAttendanceOptions(month=month, factory_rest_days=factory_rest_days),
            [self.manager_id],
        )

    def test_business_trip_days_subtracts_full_and_half_day_factory_rest_overlap(self) -> None:
        with self.app.app_context():
            self._add_leave(
                "CC001",
                "出差",
                datetime(2026, 4, 8, 8, 0, 0),
                datetime(2026, 4, 10, 17, 0, 0),
            )

            rows = self._build_rows()

        self.assertEqual(rows[0]["business_trip_days"], 1.5)
        self.assertEqual(rows[0]["attendance_days"], 3.5)

    def test_marriage_leave_afternoon_does_not_subtract_morning_factory_rest(self) -> None:
        with self.app.app_context():
            self._add_leave(
                "HJ001",
                "婚假",
                datetime(2026, 4, 9, 13, 0, 0),
                datetime(2026, 4, 9, 17, 0, 0),
            )

            rows = self._build_rows()

        self.assertEqual(rows[0]["marriage_days"], 0.5)
        self.assertEqual(rows[0]["attendance_days"], 2.5)

    def test_funeral_leave_clamps_to_zero_when_fully_covered_by_factory_rest(self) -> None:
        with self.app.app_context():
            self._add_leave(
                "SJ001",
                "丧假",
                datetime(2026, 4, 8, 8, 0, 0),
                datetime(2026, 4, 8, 17, 0, 0),
            )

            rows = self._build_rows()

        self.assertEqual(rows[0]["funeral_days"], 0.0)
        self.assertEqual(rows[0]["attendance_days"], 2.0)

    def test_business_trip_at_noon_boundary_only_subtracts_matching_half_day(self) -> None:
        with self.app.app_context():
            self._add_leave(
                "CC002",
                "出差",
                datetime(2026, 4, 9, 8, 0, 0),
                datetime(2026, 4, 9, 12, 0, 0),
            )
            morning_rows = self._build_rows()

            LeaveRecord.query.filter_by(leave_no="CC002").delete()
            db.session.commit()

            self._add_leave(
                "CC003",
                "出差",
                datetime(2026, 4, 9, 12, 0, 0),
                datetime(2026, 4, 9, 17, 0, 0),
            )
            afternoon_rows = self._build_rows()

        self.assertEqual(morning_rows[0]["business_trip_days"], 0.0)
        self.assertEqual(afternoon_rows[0]["business_trip_days"], 0.5)

    def test_cross_month_leave_only_subtracts_current_month_factory_rest_overlap(self) -> None:
        with self.app.app_context():
            may_account_set = AccountSet(month="2026-05", name="2026-05 账套", factory_rest_days=1.0)
            db.session.add(may_account_set)
            db.session.flush()
            db.session.add(
                AccountSetFactoryRestDay(
                    account_set_id=may_account_set.id,
                    rest_date=date(2026, 5, 1),
                    rest_period="full",
                )
            )
            db.session.add(
                MonthlyReport(
                    emp_id=self.manager_id,
                    report_month="2026-05",
                    manager_raw_data={"出勤天数": 1},
                )
            )
            db.session.commit()

            self._add_leave(
                "CC004",
                "出差",
                datetime(2026, 4, 30, 8, 0, 0),
                datetime(2026, 5, 2, 17, 0, 0),
            )

            rows = self._build_rows(month="2026-05", factory_rest_days=1.0)

        self.assertEqual(rows[0]["business_trip_days"], 1.0)
        self.assertEqual(rows[0]["attendance_days"], 2.0)

    def test_injury_days_are_not_subtracted_by_factory_rest_overlap(self) -> None:
        with self.app.app_context():
            self._add_leave(
                "GS001",
                "工伤假",
                datetime(2026, 4, 8, 8, 0, 0),
                datetime(2026, 4, 8, 17, 0, 0),
            )

            rows = self._build_rows()

        self.assertEqual(rows[0]["injury_days"], 1.0)
        self.assertEqual(rows[0]["attendance_days"], 2.0)

    def test_business_trip_without_account_set_does_not_subtract_factory_rest_overlap(self) -> None:
        with self.app.app_context():
            AccountSetFactoryRestDay.query.delete()
            AccountSet.query.delete()
            db.session.commit()

            self._add_leave(
                "CC005",
                "出差",
                datetime(2026, 4, 8, 8, 0, 0),
                datetime(2026, 4, 8, 17, 0, 0),
            )

            rows = self._build_rows(factory_rest_days=1.5)

        self.assertEqual(rows[0]["business_trip_days"], 1.0)
        self.assertEqual(rows[0]["attendance_days"], 3.0)

    def test_business_trip_without_factory_rest_entries_does_not_subtract_factory_rest_overlap(self) -> None:
        with self.app.app_context():
            AccountSetFactoryRestDay.query.delete()
            db.session.commit()

            self._add_leave(
                "CC006",
                "出差",
                datetime(2026, 4, 8, 8, 0, 0),
                datetime(2026, 4, 8, 17, 0, 0),
            )

            rows = self._build_rows(factory_rest_days=1.5)

        self.assertEqual(rows[0]["business_trip_days"], 1.0)
        self.assertEqual(rows[0]["attendance_days"], 3.0)

    def test_factory_rest_days_without_factory_rest_entries_do_not_reduce_absence_gap(self) -> None:
        with self.app.app_context():
            AccountSetFactoryRestDay.query.delete()
            db.session.commit()

            rows = self._build_rows(factory_rest_days=1.5)

        self.assertEqual(rows[0]["personal_sick_days"], 28.0)
        self.assertEqual(rows[0]["overtime_change"], 0.0)


class ManagerInjuryDeductionTests(unittest.TestCase):
    """守护「工伤要扣工资、等同普通缺勤」政策。

    与 ManagerFactoryRestOverlapTests 解耦：本类不注入厂休明细，确保工伤天数不被
    厂休重叠干扰，断言聚焦于扣薪缺口与扣减顺序。
    """

    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmpdir.name, "manager-injury-deduction.db")

        app = Flask(__name__)
        app.config.update(
            TESTING=True,
            SQLALCHEMY_DATABASE_URI=f"sqlite:///{self.db_path}",
            SQLALCHEMY_TRACK_MODIFICATIONS=False,
        )
        db.init_app(app)
        self.app = app

        with self.app.app_context():
            db.create_all()
            dept = Department(dept_no="D002", dept_name="安环部")
            manager = Employee(emp_no="M002", name="石含巧", is_manager=True)
            db.session.add_all([dept, manager])
            db.session.flush()
            manager.dept_id = dept.id
            # 月报出勤 5 天，工厂不设厂休明细（factory_rest_days=0）。
            db.session.add(
                MonthlyReport(
                    emp_id=manager.id,
                    report_month="2026-06",
                    manager_raw_data={"出勤天数": 5},
                )
            )
            db.session.commit()
            self.manager_id = manager.id

    def tearDown(self) -> None:
        with self.app.app_context():
            db.session.remove()
            db.drop_all()
        self.tmpdir.cleanup()

    def _build_rows(self) -> list[dict[str, object]]:
        # factory_rest_days=0：本类不测厂休重叠，专注扣薪行为。
        return build_manager_rows(ManagerAttendanceOptions(month="2026-06", factory_rest_days=0.0))

    def _add_injury_leave(self, leave_no: str, day: int = 15) -> None:
        """添加 1 整天工伤假（8:00-17:00），位于 2026-06 当月且不与任何厂休重叠。"""
        db.session.add(
            LeaveRecord(
                emp_id=self.manager_id,
                leave_no=leave_no,
                leave_type="工伤假",
                start_time=datetime(2026, 6, day, 8, 0, 0),
                end_time=datetime(2026, 6, day, 17, 0, 0),
            )
        )
        db.session.commit()

    def test_injury_not_in_attendance_is_deducted_as_absence(self) -> None:
        """工伤不进考勤天数 → 被当成缺勤扣薪。

        固定月报出勤5天（无加班/年假余额，缺勤全额算事/病假）：
        - 无工伤：缺勤 = 本月天数 - 出勤5 = 25 → 事/病假 25。
        - 加工伤1天：工伤不进考勤天数，出勤仍为 5，缺勤仍为 25 → 事/病假 25，
          同时 injury_days=1 被记录。

        工伤通过「不进考勤天数」隐式算作缺勤并被扣薪。若有人误把工伤加进
        attendance_days，出勤会变成 6、事/病假变成 24，本断言会失败。
        """
        with self.app.app_context():
            baseline = self._build_rows()
            self._add_injury_leave("GS-A1", day=15)
            with_injury = self._build_rows()

        # 工伤被记录，但不进考勤天数。
        self.assertEqual(with_injury[0]["injury_days"], 1.0)
        self.assertEqual(with_injury[0]["attendance_days"], 5.0)
        # 工伤那天因「没上班也不算出勤」已隐含在缺勤里被扣薪：扣薪天数与无工伤时相同。
        self.assertEqual(with_injury[0]["personal_sick_days"], baseline[0]["personal_sick_days"])

    def test_injury_absence_consumed_by_annual_leave(self) -> None:
        """有年假余额时，工伤所在的缺勤会被年休吃掉一部分，而非全扣事/病假。

        月报出勤5天 + 工伤1天 → 缺勤25天。年假 remaining=12（可用额度受
        min(remaining,3.0)=3 限制）→ 年休吃 3 天，剩下 22 天算事/病假扣薪。
        工伤那天作为缺勤的一部分，随缺勤一起被年休吃掉 / 剩余扣薪。
        """
        from models.manager_month_stat import ManagerMonthStat
        with self.app.app_context():
            db.session.add(
                ManagerMonthStat(
                    emp_id=self.manager_id,
                    year=2026,
                    stat_type="annual_leave",
                    remaining=12.0,
                )
            )
            db.session.commit()
            self._add_injury_leave("GS-B1", day=16)
            rows = self._build_rows()

        self.assertEqual(rows[0]["injury_days"], 1.0)
        # 年休吃掉 3 天缺勤，剩下 22 天扣薪。
        self.assertEqual(rows[0]["benefit_days"], 3.0)
        self.assertEqual(rows[0]["personal_sick_days"], 22.0)


class ManagerEveningOvertimeTopupTests(unittest.TestCase):
    """晚加班顶班口径：
    - 白班出勤日 + 晚加班条：出勤 = 白班 1 天 + 顶班折算值（2~5 小时 = 0.5 天）
    - 纯晚顶班日（白天无打卡）：考勤机月报已记 1 天，按折算扣减修正（维持原行为）
    """

    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmpdir.name, "manager-evening-topup.db")

        app = Flask(__name__)
        app.config.update(
            TESTING=True,
            SQLALCHEMY_DATABASE_URI=f"sqlite:///{self.db_path}",
            SQLALCHEMY_TRACK_MODIFICATIONS=False,
        )
        db.init_app(app)
        self.app = app

        with self.app.app_context():
            db.create_all()
            dept = Department(dept_no="D001", dept_name="行政部")
            db.session.add(dept)
            db.session.flush()
            manager = Employee(emp_no="M001", name="经理甲", dept_id=dept.id, is_manager=True)
            db.session.add(manager)
            db.session.commit()
            self.manager_id = manager.id

    def tearDown(self) -> None:
        with self.app.app_context():
            db.session.remove()
            db.drop_all()
        self.tmpdir.cleanup()

    def test_day_shift_plus_evening_overtime_adds_topup_days(self) -> None:
        with self.app.app_context():
            db.session.add_all(
                [
                    MonthlyReport(
                        emp_id=self.manager_id,
                        report_month="2026-08",
                        raw_data={"出勤天数": 21},
                    ),
                    DailyRecord(
                        emp_id=self.manager_id,
                        record_date=date(2026, 8, 31),
                        actual_hours=695,
                        raw_data={
                            "出勤天数": "1",
                            "工作时长": "695",
                            "上班1打卡时间": "07:54",
                            "下班2打卡时间": "17:02",
                            "上班3打卡时间": "17:02",
                            "下班3打卡时间": "20:08",
                        },
                    ),
                    OvertimeRecord(
                        overtime_no="OT-EVE-1",
                        emp_id=self.manager_id,
                        start_time=datetime(2026, 8, 31, 17, 0),
                        end_time=datetime(2026, 8, 31, 20, 0),
                        effective_hours=0.125,
                    ),
                ]
            )
            db.session.commit()

            rows = build_manager_rows(ManagerAttendanceOptions(month="2026-08"), [self.manager_id])

        self.assertEqual(rows[0]["attendance_days"], 21.5)
        self.assertEqual(rows[0]["actual_attendance_days"], 21.5)

    def test_pure_evening_topup_keeps_half_day_deduction(self) -> None:
        with self.app.app_context():
            db.session.add_all(
                [
                    MonthlyReport(
                        emp_id=self.manager_id,
                        report_month="2026-07",
                        raw_data={"出勤天数": 24},
                    ),
                    DailyRecord(
                        emp_id=self.manager_id,
                        record_date=date(2026, 7, 31),
                        actual_hours=231,
                        raw_data={
                            "出勤天数": "1",
                            "工作时长": "231",
                            "上班1打卡结果": "缺卡",
                            "上班2打卡结果": "缺卡",
                            "下班1打卡结果": "缺卡",
                            "下班2打卡结果": "缺卡",
                            "上班3打卡时间": "17:55",
                            "上班3打卡结果": "正常",
                            "下班3打卡时间": "21:46",
                            "下班3打卡结果": "正常",
                        },
                    ),
                    OvertimeRecord(
                        overtime_no="OT-EVE-2",
                        emp_id=self.manager_id,
                        start_time=datetime(2026, 7, 31, 17, 55),
                        end_time=datetime(2026, 7, 31, 21, 46),
                        effective_hours=0.1667,
                    ),
                ]
            )
            db.session.commit()

            rows = build_manager_rows(ManagerAttendanceOptions(month="2026-07"), [self.manager_id])

        self.assertEqual(rows[0]["attendance_days"], 23.5)

    def test_fallback_day_view_adds_topup_for_worked_day_shift(self) -> None:
        with self.app.app_context():
            db.session.add_all(
                [
                    DailyRecord(
                        emp_id=self.manager_id,
                        record_date=date(2026, 4, 1),
                        actual_hours=480,
                        raw_data={"刷卡时间数据": "07:55,17:02"},
                    ),
                    DailyRecord(
                        emp_id=self.manager_id,
                        record_date=date(2026, 4, 2),
                        actual_hours=695,
                        raw_data={"刷卡时间数据": "07:54,17:02,20:08"},
                    ),
                    OvertimeRecord(
                        overtime_no="OT-EVE-3",
                        emp_id=self.manager_id,
                        start_time=datetime(2026, 4, 2, 17, 0),
                        end_time=datetime(2026, 4, 2, 20, 0),
                        effective_hours=0.125,
                    ),
                ]
            )
            db.session.commit()

            rows = build_manager_rows(ManagerAttendanceOptions(month="2026-04"), [self.manager_id])

        self.assertEqual(rows[0]["attendance_days"], 2.5)

    def test_manager_payload_nested_punch_still_counts_day_shift(self) -> None:
        """生产结构：管理端打卡位于 manager_payload.raw_data 嵌套层。"""
        with self.app.app_context():
            db.session.add_all(
                [
                    MonthlyReport(
                        emp_id=self.manager_id,
                        report_month="2026-08",
                        raw_data={"出勤天数": 21},
                    ),
                    DailyRecord(
                        emp_id=self.manager_id,
                        record_date=date(2026, 8, 31),
                        actual_hours=695,
                        manager_payload={
                            "actual_hours": 695,
                            "raw_data": {
                                "上班1打卡时间": "07:54",
                                "下班2打卡时间": "17:02",
                                "上班3打卡时间": "17:02",
                                "下班3打卡时间": "20:08",
                            },
                        },
                    ),
                    OvertimeRecord(
                        overtime_no="OT-NEST-1",
                        emp_id=self.manager_id,
                        start_time=datetime(2026, 8, 31, 17, 0),
                        end_time=datetime(2026, 8, 31, 20, 0),
                        effective_hours=0.125,
                    ),
                ]
            )
            db.session.commit()

            rows = build_manager_rows(ManagerAttendanceOptions(month="2026-08"), [self.manager_id])

        self.assertEqual(rows[0]["attendance_days"], 21.5)

    def test_same_day_multiple_evening_overtimes_merge_hours(self) -> None:
        """同日多条晚加班条按合并时长折算（0.125+0.125=0.25 天 → 折 1.0），不逐条叠加。"""
        with self.app.app_context():
            db.session.add_all(
                [
                    MonthlyReport(
                        emp_id=self.manager_id,
                        report_month="2026-08",
                        raw_data={"出勤天数": 21},
                    ),
                    DailyRecord(
                        emp_id=self.manager_id,
                        record_date=date(2026, 8, 31),
                        actual_hours=695,
                        raw_data={
                            "上班1打卡时间": "07:54",
                            "下班2打卡时间": "17:02",
                            "上班3打卡时间": "17:02",
                            "下班3打卡时间": "20:08",
                        },
                    ),
                    OvertimeRecord(
                        overtime_no="OT-MERGE-1",
                        emp_id=self.manager_id,
                        start_time=datetime(2026, 8, 31, 17, 0),
                        end_time=datetime(2026, 8, 31, 18, 30),
                        effective_hours=0.125,
                    ),
                    OvertimeRecord(
                        overtime_no="OT-MERGE-2",
                        emp_id=self.manager_id,
                        start_time=datetime(2026, 8, 31, 18, 30),
                        end_time=datetime(2026, 8, 31, 20, 0),
                        effective_hours=0.125,
                    ),
                ]
            )
            db.session.commit()

            rows = build_manager_rows(ManagerAttendanceOptions(month="2026-08"), [self.manager_id])

        self.assertEqual(rows[0]["attendance_days"], 22.0)

    def test_rejected_evening_overtime_ignored(self) -> None:
        """已拒绝的晚加班条不参与顶班叠加与扣减。"""
        with self.app.app_context():
            db.session.add_all(
                [
                    MonthlyReport(
                        emp_id=self.manager_id,
                        report_month="2026-08",
                        raw_data={"出勤天数": 21},
                    ),
                    DailyRecord(
                        emp_id=self.manager_id,
                        record_date=date(2026, 8, 31),
                        actual_hours=695,
                        raw_data={
                            "上班1打卡时间": "07:54",
                            "下班2打卡时间": "17:02",
                            "上班3打卡时间": "17:02",
                            "下班3打卡时间": "20:08",
                        },
                    ),
                    OvertimeRecord(
                        overtime_no="OT-REJ-1",
                        emp_id=self.manager_id,
                        start_time=datetime(2026, 8, 31, 17, 0),
                        end_time=datetime(2026, 8, 31, 20, 0),
                        effective_hours=0.125,
                        approval_status="已拒绝",
                    ),
                ]
            )
            db.session.commit()

            rows = build_manager_rows(ManagerAttendanceOptions(month="2026-08"), [self.manager_id])

        self.assertEqual(rows[0]["attendance_days"], 21.0)


class ManagerDailyStatusOverrideTests(unittest.TestCase):
    """月报口径下单日状态修正传导：出勤基值按「扣掉该日月报出勤值 + 按状态映射加回」调整。
    假种状态（工伤/出差/婚假/丧假）仍走假种列，不参与该调整。
    """

    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmpdir.name, "manager-daily-status-override.db")

        app = Flask(__name__)
        app.config.update(
            TESTING=True,
            SQLALCHEMY_DATABASE_URI=f"sqlite:///{self.db_path}",
            SQLALCHEMY_TRACK_MODIFICATIONS=False,
        )
        db.init_app(app)
        self.app = app

        with self.app.app_context():
            db.create_all()
            dept = Department(dept_no="D001", dept_name="行政部")
            db.session.add(dept)
            db.session.flush()
            manager = Employee(emp_no="M001", name="经理甲", dept_id=dept.id, is_manager=True)
            db.session.add(manager)
            db.session.commit()
            self.manager_id = manager.id

    def tearDown(self) -> None:
        with self.app.app_context():
            db.session.remove()
            db.drop_all()
        self.tmpdir.cleanup()

    def _seed_reported_day(self, day, reported_days):
        raw = {"工作时长": "240"}
        if reported_days is not None:
            raw["出勤天数"] = reported_days
        db.session.add(
            DailyRecord(emp_id=self.manager_id, record_date=day, actual_hours=240, raw_data=raw)
        )

    def test_half_day_status_override_reduces_report_attendance_days(self) -> None:
        with self.app.app_context():
            db.session.add(MonthlyReport(emp_id=self.manager_id, report_month="2026-08", raw_data={"出勤天数": 24}))
            self._seed_reported_day(date(2026, 8, 31), "1")
            db.session.add(
                DailyAttendanceOverride(
                    emp_id=self.manager_id, record_date=date(2026, 8, 31), status="上午出勤"
                )
            )
            db.session.commit()

            rows = build_manager_rows(ManagerAttendanceOptions(month="2026-08"), [self.manager_id])

        self.assertEqual(rows[0]["attendance_days"], 23.5)
        self.assertEqual(rows[0]["actual_attendance_days"], 23.5)

    def test_absent_status_override_deducts_report_day(self) -> None:
        with self.app.app_context():
            db.session.add(MonthlyReport(emp_id=self.manager_id, report_month="2026-08", raw_data={"出勤天数": 24}))
            self._seed_reported_day(date(2026, 8, 20), "1")
            db.session.add(
                DailyAttendanceOverride(
                    emp_id=self.manager_id, record_date=date(2026, 8, 20), status="缺勤"
                )
            )
            db.session.commit()

            rows = build_manager_rows(ManagerAttendanceOptions(month="2026-08"), [self.manager_id])

        self.assertEqual(rows[0]["attendance_days"], 23.0)

    def test_full_status_override_on_unreported_day_adds_day(self) -> None:
        with self.app.app_context():
            db.session.add(MonthlyReport(emp_id=self.manager_id, report_month="2026-08", raw_data={"出勤天数": 24}))
            self._seed_reported_day(date(2026, 8, 8), None)
            db.session.add(
                DailyAttendanceOverride(
                    emp_id=self.manager_id, record_date=date(2026, 8, 8), status="全勤"
                )
            )
            db.session.commit()

            rows = build_manager_rows(ManagerAttendanceOptions(month="2026-08"), [self.manager_id])

        self.assertEqual(rows[0]["attendance_days"], 25.0)

    def test_leave_status_still_routes_to_leave_buckets(self) -> None:
        with self.app.app_context():
            db.session.add(MonthlyReport(emp_id=self.manager_id, report_month="2026-08", raw_data={"出勤天数": 24}))
            self._seed_reported_day(date(2026, 8, 12), None)
            db.session.add(
                DailyAttendanceOverride(
                    emp_id=self.manager_id, record_date=date(2026, 8, 12), status="出差"
                )
            )
            db.session.commit()

            rows = build_manager_rows(ManagerAttendanceOptions(month="2026-08"), [self.manager_id])

        self.assertEqual(rows[0]["business_trip_days"], 1.0)
        self.assertEqual(rows[0]["attendance_days"], 25.0)

    def test_override_without_daily_record_adds_half_day(self) -> None:
        with self.app.app_context():
            db.session.add(MonthlyReport(emp_id=self.manager_id, report_month="2026-08", raw_data={"出勤天数": 24}))
            db.session.add(
                DailyAttendanceOverride(
                    emp_id=self.manager_id, record_date=date(2026, 8, 15), status="下午出勤"
                )
            )
            db.session.commit()

            rows = build_manager_rows(ManagerAttendanceOptions(month="2026-08"), [self.manager_id])

        self.assertEqual(rows[0]["attendance_days"], 24.5)

    def test_pure_evening_topup_with_status_override_uses_status_only(self) -> None:
        """纯晚顶班日 + 状态修正：该日月报值已按状态替换，顶班折算扣减不再叠加（避免重复扣）。"""
        with self.app.app_context():
            db.session.add_all(
                [
                    MonthlyReport(
                        emp_id=self.manager_id, report_month="2026-07", raw_data={"出勤天数": 24}
                    ),
                    DailyRecord(
                        emp_id=self.manager_id,
                        record_date=date(2026, 7, 31),
                        actual_hours=231,
                        raw_data={
                            "出勤天数": "1",
                            "工作时长": "231",
                            "上班3打卡时间": "17:55",
                            "下班3打卡时间": "21:46",
                        },
                    ),
                    OvertimeRecord(
                        overtime_no="OT-STATUS-1",
                        emp_id=self.manager_id,
                        start_time=datetime(2026, 7, 31, 17, 55),
                        end_time=datetime(2026, 7, 31, 21, 46),
                        effective_hours=0.1667,
                    ),
                    DailyAttendanceOverride(
                        emp_id=self.manager_id, record_date=date(2026, 7, 31), status="缺勤"
                    ),
                ]
            )
            db.session.commit()

            rows = build_manager_rows(ManagerAttendanceOptions(month="2026-07"), [self.manager_id])

        self.assertEqual(rows[0]["attendance_days"], 23.0)

    def test_day_shift_evening_topup_with_status_override_uses_status_only(self) -> None:
        """白班+晚顶班日 + 状态修正：与兜底口径一致，状态裁定当天，顶班叠加不再执行。"""
        with self.app.app_context():
            db.session.add_all(
                [
                    MonthlyReport(
                        emp_id=self.manager_id, report_month="2026-08", raw_data={"出勤天数": 24}
                    ),
                    DailyRecord(
                        emp_id=self.manager_id,
                        record_date=date(2026, 8, 31),
                        actual_hours=695,
                        raw_data={
                            "出勤天数": "1",
                            "工作时长": "695",
                            "上班1打卡时间": "07:54",
                            "下班2打卡时间": "17:02",
                            "上班3打卡时间": "17:02",
                            "下班3打卡时间": "20:08",
                        },
                    ),
                    OvertimeRecord(
                        overtime_no="OT-STATUS-2",
                        emp_id=self.manager_id,
                        start_time=datetime(2026, 8, 31, 17, 0),
                        end_time=datetime(2026, 8, 31, 20, 0),
                        effective_hours=0.125,
                    ),
                    DailyAttendanceOverride(
                        emp_id=self.manager_id, record_date=date(2026, 8, 31), status="上午出勤"
                    ),
                ]
            )
            db.session.commit()

            rows = build_manager_rows(ManagerAttendanceOptions(month="2026-08"), [self.manager_id])

        self.assertEqual(rows[0]["attendance_days"], 23.5)

    def test_daytime_overtime_with_status_override_uses_status_only(self) -> None:
        """白天顶班条日 + 状态修正：状态裁定当天，白天顶班折算扣减不再叠加。"""
        with self.app.app_context():
            db.session.add_all(
                [
                    MonthlyReport(
                        emp_id=self.manager_id, report_month="2026-08", raw_data={"出勤天数": 24}
                    ),
                    DailyRecord(
                        emp_id=self.manager_id,
                        record_date=date(2026, 8, 30),
                        actual_hours=240,
                        raw_data={
                            "出勤天数": "1",
                            "工作时长": "240",
                            "上班1打卡时间": "07:57",
                            "下班1打卡时间": "12:00",
                        },
                    ),
                    OvertimeRecord(
                        overtime_no="OT-STATUS-3",
                        emp_id=self.manager_id,
                        start_time=datetime(2026, 8, 30, 8, 0),
                        end_time=datetime(2026, 8, 30, 12, 0),
                        effective_hours=0.1667,
                    ),
                    DailyAttendanceOverride(
                        emp_id=self.manager_id, record_date=date(2026, 8, 30), status="上午出勤"
                    ),
                ]
            )
            db.session.commit()

            rows = build_manager_rows(ManagerAttendanceOptions(month="2026-08"), [self.manager_id])

        self.assertEqual(rows[0]["attendance_days"], 23.5)

    def test_nested_manager_payload_reported_days_reduce_base(self) -> None:
        """生产结构：管理端出勤天数位于 manager_payload.raw_data 嵌套层。"""
        with self.app.app_context():
            db.session.add(MonthlyReport(emp_id=self.manager_id, report_month="2026-08", raw_data={"出勤天数": 24}))
            db.session.add(
                DailyRecord(
                    emp_id=self.manager_id,
                    record_date=date(2026, 8, 31),
                    actual_hours=257,
                    manager_payload={
                        "actual_hours": 257,
                        "raw_data": {"出勤天数": "1", "工作时长": "257"},
                    },
                )
            )
            db.session.add(
                DailyAttendanceOverride(
                    emp_id=self.manager_id, record_date=date(2026, 8, 31), status="上午出勤"
                )
            )
            db.session.commit()

            rows = build_manager_rows(ManagerAttendanceOptions(month="2026-08"), [self.manager_id])

        self.assertEqual(rows[0]["attendance_days"], 23.5)

    def test_monthly_override_still_takes_precedence_over_daily_status(self) -> None:
        with self.app.app_context():
            db.session.add(MonthlyReport(emp_id=self.manager_id, report_month="2026-08", raw_data={"出勤天数": 24}))
            self._seed_reported_day(date(2026, 8, 31), "1")
            db.session.add_all(
                [
                    DailyAttendanceOverride(
                        emp_id=self.manager_id, record_date=date(2026, 8, 31), status="上午出勤"
                    ),
                    ManagerAttendanceOverride(
                        emp_id=self.manager_id, month="2026-08", attendance_days=21.0
                    ),
                ]
            )
            db.session.commit()

            rows = build_manager_rows(ManagerAttendanceOptions(month="2026-08"), [self.manager_id])

        self.assertEqual(rows[0]["attendance_days"], 21.0)
        self.assertEqual(rows[0]["actual_attendance_days"], 21.0)


class ManagerPunchDaysTests(unittest.TestCase):
    """打卡天数（员工侧实际出勤口径）：单日「实际打卡」修正优先，否则当日有真实刷卡（≥1 次）记 1 天。"""

    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmpdir.name, "manager-punch-days.db")

        app = Flask(__name__)
        app.config.update(
            TESTING=True,
            SQLALCHEMY_DATABASE_URI=f"sqlite:///{self.db_path}",
            SQLALCHEMY_TRACK_MODIFICATIONS=False,
        )
        db.init_app(app)
        self.app = app

        with self.app.app_context():
            db.create_all()
            dept = Department(dept_no="D001", dept_name="行政部")
            db.session.add(dept)
            db.session.flush()
            manager = Employee(emp_no="M001", name="经理甲", dept_id=dept.id, is_manager=True)
            db.session.add(manager)
            db.session.flush()
            db.session.add(
                MonthlyReport(emp_id=manager.id, report_month="2026-08", raw_data={"出勤天数": 24})
            )
            db.session.commit()
            self.manager_id = manager.id

    def tearDown(self) -> None:
        with self.app.app_context():
            db.session.remove()
            db.drop_all()
        self.tmpdir.cleanup()

    def _seed_punch_day(self, day, punch_times: dict) -> None:
        db.session.add(
            DailyRecord(
                emp_id=self.manager_id,
                record_date=day,
                manager_payload={"raw_data": dict(punch_times)},
            )
        )

    def test_punch_days_counts_single_swipe_day(self) -> None:
        with self.app.app_context():
            self._seed_punch_day(date(2026, 8, 10), {"上班1打卡时间": "07:58", "下班1打卡时间": "17:32"})
            self._seed_punch_day(date(2026, 8, 11), {"上班1打卡时间": "07:58"})
            db.session.commit()

            rows = build_manager_rows(ManagerAttendanceOptions(month="2026-08"), [self.manager_id])

        self.assertEqual(rows[0]["punch_days"], 2.0)

    def test_punch_days_actual_attendance_override_takes_priority(self) -> None:
        with self.app.app_context():
            self._seed_punch_day(date(2026, 8, 10), {"上班1打卡时间": "07:58", "下班1打卡时间": "17:32"})
            self._seed_punch_day(date(2026, 8, 11), {"上班1打卡时间": "07:58", "下班1打卡时间": "17:32"})
            db.session.add_all(
                [
                    # 双卡日勾「不算」→ 0 天
                    DailyAttendanceOverride(
                        emp_id=self.manager_id, record_date=date(2026, 8, 10), is_actual_attendance=False
                    ),
                    # 无打卡记录日勾「算」→ 1 天
                    DailyAttendanceOverride(
                        emp_id=self.manager_id, record_date=date(2026, 8, 12), is_actual_attendance=True
                    ),
                ]
            )
            db.session.commit()

            rows = build_manager_rows(ManagerAttendanceOptions(month="2026-08"), [self.manager_id])

        self.assertEqual(rows[0]["punch_days"], 2.0)

    def test_headers_and_rows_toggle_punch_days_column(self) -> None:
        with self.app.app_context():
            self._seed_punch_day(date(2026, 8, 10), {"上班1打卡时间": "07:58", "下班1打卡时间": "17:32"})
            db.session.commit()

            rows = build_manager_rows(ManagerAttendanceOptions(month="2026-08"), [self.manager_id])
            hidden = rows_as_table(rows)
            shown = rows_as_table(rows, include_punch_days=True)

        self.assertNotIn("打卡天数", manager_headers())
        headers = manager_headers(include_punch_days=True)
        self.assertIn("打卡天数", headers)
        self.assertEqual(headers.index("打卡天数"), headers.index("实际出勤天数") + 1)
        self.assertEqual(len(shown[0]), len(hidden[0]) + 1)
        self.assertIn(1.0, shown[0])
        self.assertNotIn(1.0, hidden[0])


if __name__ == "__main__":
    unittest.main()
