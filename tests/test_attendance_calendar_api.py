import tempfile
import unittest
from datetime import date, datetime, timedelta

from flask import Flask

from models import db
from models.department import Department
from models.daily_record import DailyRecord
from models.employee import Employee
from models.leave import LeaveRecord
from models.monthly_report import MonthlyReport
from models.overtime import OvertimeRecord
from models.user import User, UserEmployeeAssignment
from routes import register_routes
from routes.auth_helpers import issue_slider_verified_token
from tests.csrf_helper import attach_origin


class AttendanceCalendarApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmpdir.cleanup)
        self.app = Flask(__name__)
        self.app.config.update(
            TESTING=True,
            SECRET_KEY="test-secret",
            SQLALCHEMY_DATABASE_URI=f"sqlite:///{self.tmpdir.name}/cal.db",
            SQLALCHEMY_TRACK_MODIFICATIONS=False,
            JWT_EXPIRES_DELTA=timedelta(hours=12),
            FRONTEND_ORIGIN="http://localhost:5173",
            SESSION_COOKIE_NAME="api_access_token",
            SESSION_COOKIE_SAMESITE="None",
            SESSION_COOKIE_SECURE=False,
        )
        db.init_app(self.app)
        register_routes(self.app)

        with self.app.app_context():
            db.create_all()
            dept = Department(dept_no="D001", dept_name="制造一部")
            db.session.add(dept)
            db.session.flush()
            emp = Employee(emp_no="E001", name="员工甲", dept_id=dept.id, is_manager=False)
            manager = Employee(emp_no="M001", name="经理甲", dept_id=dept.id, is_manager=True)
            db.session.add_all([emp, manager])
            db.session.flush()
            # 登录与权限授予方式与 test_api_query.py 一致：
            # page_permissions 授予 attendance_calendar + UserEmployeeAssignment 绑定可见员工。
            viewer = User(username="viewer", role="readonly", page_permissions={"attendance_calendar": True})
            viewer.set_password("viewer123")
            db.session.add(viewer)
            db.session.flush()
            db.session.add(UserEmployeeAssignment(user_id=viewer.id, emp_id=emp.id))
            db.session.add(UserEmployeeAssignment(user_id=viewer.id, emp_id=manager.id))
            db.session.commit()
            self.emp_id = emp.id
            self.manager_id = manager.id

        self.client = attach_origin(self.app.test_client())
        self._login("viewer", "viewer123")

    def tearDown(self) -> None:
        with self.app.app_context():
            db.session.remove()
            db.drop_all()

    def _login(self, username: str, password: str):
        with self.app.app_context():
            captcha_token = issue_slider_verified_token()
        return self.client.post(
            "/api/auth/login",
            json={"username": username, "password": password, "captcha_token": captcha_token},
        )

    def _get(self, query: str):
        return self.client.get(f"/api/query/attendance-calendar{query}")

    def _add_daily(self, **kwargs):
        # 员工侧视图字段取自 employee_payload（与 test_api_query.py 的构造模式一致），
        # 并从刷卡时间合成嵌套 raw_data["刷卡时间数据"]，供 _raw_punch_count 识别真实刷卡次数。
        tokens = [*(kwargs.get("check_in_times") or []), *(kwargs.get("check_out_times") or [])]
        payload = {k: v for k, v in kwargs.items() if k != "record_date"}
        payload["raw_data"] = {"刷卡时间数据": ",".join(str(t) for t in tokens)}
        with self.app.app_context():
            db.session.add(DailyRecord(emp_id=self.emp_id, employee_payload=payload, **kwargs))
            db.session.commit()

    def _add_manager_daily(self, record_date: date, raw_data=None):
        with self.app.app_context():
            db.session.add(
                DailyRecord(
                    emp_id=self.manager_id,
                    record_date=record_date,
                    manager_payload={"raw_data": raw_data or {}},
                )
            )
            db.session.commit()

    def test_complete_manager_daily_records_override_monthly_report_attendance(self):
        """管理人员逐日数据覆盖全月后，日历与统计不再读取月报出勤天数。"""
        with self.app.app_context():
            db.session.add(MonthlyReport(
                emp_id=self.manager_id, report_month="2026-07", manager_raw_data={"出勤天数": 20}
            ))
            db.session.commit()
        for day_no in range(1, 32):
            raw = {"上班1打卡时间": "08:00", "下班1打卡时间": "17:00"} if day_no == 1 else {}
            self._add_manager_daily(date(2026, 7, day_no), raw)

        data = self._get(f"?emp_id={self.manager_id}&month=2026-07").get_json()
        self.assertEqual(data["attendance_source"], "daily")
        self.assertEqual(data["summary"]["attendance_days"], 1.0)
        self.assertEqual(sum(day["attendance_days"] for day in data["days"]), 1.0)
        with self.app.app_context():
            from services.manager_attendance_service import ManagerAttendanceOptions, build_manager_rows

            rows = build_manager_rows(ManagerAttendanceOptions(month="2026-07"), [self.manager_id])
        self.assertEqual(rows[0]["attendance_days"], 1.0)

    def test_manager_calendar_half_day_marker_uses_final_attendance_value(self):
        """管理人员两次短时打卡若结算为全天，日历不应标为半勤。"""
        for day_no in range(1, 32):
            raw = {"上班1打卡时间": "08:00", "下班1打卡时间": "17:00"}
            if day_no == 30:
                raw = {"上班1打卡时间": "08:00", "下班1打卡时间": "12:03"}
            self._add_manager_daily(date(2026, 7, day_no), raw)

        data = self._get(f"?emp_id={self.manager_id}&month=2026-07").get_json()
        day = {item["date"]: item for item in data["days"]}["2026-07-30"]
        self.assertEqual(day["attendance_days"], 1.0)
        self.assertFalse(day["is_half_day"])

    def test_synthetic_half_day_override_marks_calendar_day_as_half_day(self):
        """无原始记录的上午/下午出勤修正，应与最终 0.5 天口径一致。"""
        from models.daily_attendance_override import DailyAttendanceOverride

        with self.app.app_context():
            db.session.add(DailyAttendanceOverride(
                emp_id=self.emp_id,
                record_date=date(2026, 7, 30),
                status="上午出勤",
            ))
            db.session.commit()

        data = self._get(f"?emp_id={self.emp_id}&month=2026-07").get_json()
        day = {item["date"]: item for item in data["days"]}["2026-07-30"]
        self.assertEqual(day["attendance_days"], 0.5)
        self.assertTrue(day["is_half_day"])

    def test_evening_overtime_threshold(self):
        """17:00 边界：16:59 非晚间，17:00 晚间；hours 为小时（effective_hours 天 ×24）。"""
        with self.app.app_context():
            db.session.add_all([
                OvertimeRecord(overtime_no="OT001", emp_id=self.emp_id,
                               start_time=datetime(2026, 7, 1, 16, 59),
                               end_time=datetime(2026, 7, 1, 18, 0), effective_hours=0.125),
                OvertimeRecord(overtime_no="OT002", emp_id=self.emp_id,
                               start_time=datetime(2026, 7, 2, 17, 0),
                               end_time=datetime(2026, 7, 2, 19, 30), effective_hours=0.25),
            ])
            db.session.commit()
        data = self._get(f"?emp_id={self.emp_id}&month=2026-07").get_json()
        ot = {o["date"]: o for o in data["overtimes"]}
        self.assertFalse(ot["2026-07-01"]["is_evening"])
        self.assertTrue(ot["2026-07-02"]["is_evening"])
        self.assertAlmostEqual(ot["2026-07-01"]["hours"], 3.0)   # 0.125 天 × 24
        self.assertAlmostEqual(ot["2026-07-02"]["hours"], 6.0)   # 0.25 天 × 24
        self.assertAlmostEqual(data["summary"]["evening_overtime_hours"], 6.0)
        self.assertAlmostEqual(data["summary"]["other_overtime_hours"], 3.0)

    def test_cross_day_overtime_split(self):
        """4/1 08:00 → 4/4 17:00 共 3.4 天：每天 20.4h（0.85 天），合计 81.6h 守恒。"""
        with self.app.app_context():
            db.session.add(OvertimeRecord(overtime_no="OT001", emp_id=self.emp_id,
                                          start_time=datetime(2026, 4, 1, 8, 0),
                                          end_time=datetime(2026, 4, 4, 17, 0), effective_hours=3.4))
            db.session.commit()
        data = self._get(f"?emp_id={self.emp_id}&month=2026-04").get_json()
        ot = {o["date"]: o["hours"] for o in data["overtimes"]}
        self.assertEqual(len(ot), 4)
        self.assertTrue(all(abs(h - 20.4) < 0.01 for h in ot.values()))
        self.assertAlmostEqual(sum(ot.values()), 3.4 * 24, places=1)

    def test_same_day_overtime_merged_and_rejected_excluded(self):
        """同日同属性两条累并；已拒绝的不计入。"""
        with self.app.app_context():
            db.session.add_all([
                OvertimeRecord(overtime_no="OT001", emp_id=self.emp_id,
                               start_time=datetime(2026, 7, 3, 17, 0),
                               end_time=datetime(2026, 7, 3, 19, 0), effective_hours=1.0),
                OvertimeRecord(overtime_no="OT002", emp_id=self.emp_id,
                               start_time=datetime(2026, 7, 3, 18, 0),
                               end_time=datetime(2026, 7, 3, 20, 0), effective_hours=1.5),
                OvertimeRecord(overtime_no="OT003", emp_id=self.emp_id,
                               start_time=datetime(2026, 7, 4, 17, 0),
                               end_time=datetime(2026, 7, 4, 19, 0), effective_hours=2.0,
                               approval_status="已拒绝"),
            ])
            db.session.commit()
        data = self._get(f"?emp_id={self.emp_id}&month=2026-07").get_json()
        ot = [o for o in data["overtimes"] if o["date"] == "2026-07-03"]
        self.assertEqual(len(ot), 1)
        self.assertAlmostEqual(ot[0]["hours"], 60.0)  # (1.0 + 1.5) 天 × 24
        self.assertAlmostEqual(data["summary"]["evening_overtime_hours"], 60.0)

    def test_leave_split_and_summary_keeps_raw_type(self):
        """跨天请假按天拆分；出差等假种在汇总中原样保留。"""
        with self.app.app_context():
            db.session.add_all([
                LeaveRecord(leave_no="L001", emp_id=self.emp_id, leave_type="事假",
                            start_time=datetime(2026, 7, 6, 0, 0), end_time=datetime(2026, 7, 8, 0, 0),
                            duration=2.0),
                LeaveRecord(leave_no="L002", emp_id=self.emp_id, leave_type="出差",
                            start_time=datetime(2026, 7, 8, 0, 0), end_time=datetime(2026, 7, 9, 0, 0),
                            duration=1.0),
            ])
            db.session.commit()
        data = self._get(f"?emp_id={self.emp_id}&month=2026-07").get_json()
        leaves = {(l["date"], l["leave_type"]): l["duration"] for l in data["leaves"]}
        self.assertEqual(leaves[("2026-07-06", "事假")], 1.0)
        self.assertEqual(leaves[("2026-07-07", "事假")], 1.0)
        self.assertEqual(leaves[("2026-07-08", "出差")], 1.0)
        by_type = {x["leave_type"]: x for x in data["summary"]["leave_by_type"]}
        self.assertIn("出差", by_type)
        self.assertEqual(by_type["出差"]["days"], 1.0)

    def test_leave_entries_carry_oa_fields_and_merge_in_summary(self):
        """leaves 为单据级明细（附 OA 字段）；同日同假种多单时汇总仍按天数与时长合计。"""
        with self.app.app_context():
            db.session.add_all([
                LeaveRecord(leave_no="L101", emp_id=self.emp_id, leave_type="事假",
                            start_time=datetime(2026, 7, 10, 8, 0), end_time=datetime(2026, 7, 10, 12, 0),
                            duration=0.5, reason="家中有事", approval_status="已审批"),
                LeaveRecord(leave_no="L102", emp_id=self.emp_id, leave_type="事假",
                            start_time=datetime(2026, 7, 10, 13, 0), end_time=datetime(2026, 7, 10, 17, 0),
                            duration=0.5, reason="下午外出", approval_status="已审批"),
            ])
            db.session.commit()
        data = self._get(f"?emp_id={self.emp_id}&month=2026-07").get_json()
        day_entries = [l for l in data["leaves"] if l["date"] == "2026-07-10"]
        self.assertEqual(len(day_entries), 2)  # 每张 OA 单一条明细
        by_no = {l["leave_no"]: l for l in day_entries}
        self.assertEqual(by_no["L101"]["reason"], "家中有事")
        self.assertEqual(by_no["L101"]["approval_status"], "已审批")
        self.assertEqual(by_no["L101"]["start_time"], "2026-07-10 08:00")
        self.assertEqual(by_no["L102"]["end_time"], "2026-07-10 17:00")
        sick = [x for x in data["summary"]["leave_by_type"] if x["leave_type"] == "事假"][0]
        self.assertEqual(sick["count"], 1)      # 汇总次数 = 覆盖天数（1 天）
        self.assertAlmostEqual(sick["days"], 0.34, places=2)  # 时长 = 两单 overlap 折算合计（0.17+0.17，逐日两位舍入）

    def test_half_day_and_attendance_summary(self):
        """半勤（2 次刷卡 + 工时∈[2,5.1)）与出勤天数口径。"""
        self._add_daily(record_date=date(2026, 7, 1), check_in_times=["07:30"],
                        check_out_times=["11:30"], actual_hours=4.0)
        self._add_daily(record_date=date(2026, 7, 2), check_in_times=["07:30"],
                        check_out_times=["17:00"], actual_hours=8.0)
        data = self._get(f"?emp_id={self.emp_id}&month=2026-07").get_json()
        days = {d["date"]: d for d in data["days"]}
        self.assertTrue(days["2026-07-01"]["is_half_day"])
        self.assertFalse(days["2026-07-02"]["is_half_day"])
        self.assertEqual(data["summary"]["half_days"], 1)
        self.assertAlmostEqual(data["summary"]["attendance_days"], 1.5)

    def test_manager_source_minutes_hours_marks_half_day(self):
        """manager 来源 actual_hours 存分钟（导入原始值）：半勤/天数按刷卡重算口径，
        不被 278 这类分钟值污染（吴冬冬 2026-08-07 场景）。"""
        with self.app.app_context():
            dept = Department.query.first()
            emp = Employee(emp_no="E002", name="员工乙", dept_id=dept.id, is_manager=False,
                           employee_stats_attendance_source="manager")
            db.session.add(emp)
            db.session.flush()
            viewer = User.query.filter_by(username="viewer").first()
            db.session.add(UserEmployeeAssignment(user_id=viewer.id, emp_id=emp.id))
            db.session.add(DailyRecord(
                emp_id=emp.id,
                record_date=date(2026, 8, 7),
                check_in_times=[],
                check_out_times=[],
                raw_data={},
                manager_payload={
                    "actual_hours": 278.0,
                    "check_in_times": [],
                    "check_out_times": [],
                    "raw_data": {"上班1打卡时间": "07:31", "下班1打卡时间": "12:09"},
                },
            ))
            db.session.commit()
            emp_id = emp.id

        data = self._get(f"?emp_id={emp_id}&month=2026-08").get_json()
        day = data["days"][0]
        self.assertTrue(day["is_half_day"])
        self.assertTrue(data["summary"]["half_days"], 1)
        self.assertAlmostEqual(data["summary"]["attendance_days"], 0.5)

    def test_sub_two_hours_day_counts_as_half_day(self):
        """真实刷卡只覆盖 <2 小时（非漏卡）按 0.5 天计：格子与汇总都标半勤。"""
        self._add_daily(record_date=date(2026, 8, 23), check_in_times=["08:00", "08:01"],
                        check_out_times=["08:02"], actual_hours=1.0)
        data = self._get(f"?emp_id={self.emp_id}&month=2026-08").get_json()
        day = data["days"][0]
        self.assertTrue(day["is_half_day"])
        self.assertEqual(data["summary"]["half_days"], 1)
        self.assertAlmostEqual(data["summary"]["attendance_days"], 0.5)

    def test_missed_punch_backfilled_from_shift_counts_full_day(self):
        """漏卡天按班次补齐（吴冬冬 2026-08-23 场景）：下班1/上班2 缺卡导致配对工时
        仅 1 分钟，按首末刷卡跨距（07:31→17:00）减班次午休（11:20~12:00）计 8.82h，
        全天 1 天、非半勤。"""
        with self.app.app_context():
            from models.shift import Shift
            from models.employee_shift import EmployeeShiftAssignment

            dept = Department.query.first()
            emp = Employee(emp_no="E003", name="员工丙", dept_id=dept.id, is_manager=False,
                           employee_stats_attendance_source="manager")
            db.session.add(emp)
            db.session.flush()
            shift = Shift(shift_no="S002", shift_name="员工通用班次",
                          time_slots=[["08:00", "11:20"], ["12:00", "17:00"]])
            db.session.add(shift)
            db.session.flush()
            db.session.add(EmployeeShiftAssignment(emp_id=emp.id, shift_id=shift.id))
            viewer = User.query.filter_by(username="viewer").first()
            db.session.add(UserEmployeeAssignment(user_id=viewer.id, emp_id=emp.id))
            db.session.add(DailyRecord(
                emp_id=emp.id,
                record_date=date(2026, 8, 23),
                check_in_times=[],
                check_out_times=[],
                raw_data={},
                manager_payload={
                    "actual_hours": 1.0,
                    "check_in_times": [],
                    "check_out_times": [],
                    "raw_data": {
                        "上班1打卡时间": "07:31", "上班1打卡结果": "正常",
                        "上班2打卡时间": "16:59", "上班2打卡结果": "迟到",
                        "下班2打卡时间": "17:00", "下班2打卡结果": "正常",
                    },
                },
            ))
            db.session.commit()
            emp_id = emp.id

        data = self._get(f"?emp_id={emp_id}&month=2026-08").get_json()
        day = data["days"][0]
        self.assertAlmostEqual(day["actual_hours"], 8.82, places=2)
        self.assertFalse(day["is_half_day"])
        self.assertEqual(data["summary"]["half_days"], 0)
        self.assertAlmostEqual(data["summary"]["attendance_days"], 1.0)

    def test_half_day_grid_matches_summary(self):
        """方案 B 验收：日历半勤格数与汇总半勤天数一致，且每个半勤格恰计 0.5 天。"""
        self._add_daily(record_date=date(2026, 7, 1), check_in_times=["07:30"],
                        check_out_times=["11:30"], actual_hours=4.0)          # 半勤
        self._add_daily(record_date=date(2026, 7, 2), check_in_times=["08:00", "08:01"],
                        check_out_times=["08:02"], actual_hours=1.0)          # <2h 半天
        self._add_daily(record_date=date(2026, 7, 3), check_in_times=["07:30"],
                        check_out_times=["17:00"], actual_hours=8.0)          # 全天
        self._add_daily(record_date=date(2026, 7, 4), check_in_times=[],
                        check_out_times=[], actual_hours=0.0)                 # 无刷卡 0 天
        data = self._get(f"?emp_id={self.emp_id}&month=2026-07").get_json()
        grid_half_days = sum(1 for d in data["days"] if d["is_half_day"])
        self.assertEqual(data["summary"]["half_days"], grid_half_days)
        # 出勤天数 = 非半勤的有卡天各计 1.0 + 半勤天各计 0.5（无卡天不计）
        punched_days = sum(
            1 for d in data["days"] if d["punch_count"] > 0 or d["check_in_times"] or d["check_out_times"]
        )
        self.assertAlmostEqual(
            data["summary"]["attendance_days"],
            grid_half_days * 0.5 + (punched_days - grid_half_days) * 1.0,
        )

    def test_actual_attendance_days_field(self):
        """红点派生口径：days.actual_attendance_days 表示当日是否计入实际出勤天数——
        刷卡 ≥2 次计 1；无刷卡计 0；「算」修正强制 1；「不算」修正强制 0。"""
        from models.daily_attendance_override import DailyAttendanceOverride

        self._add_daily(record_date=date(2026, 7, 1), check_in_times=["07:30"],
                        check_out_times=["17:00"], actual_hours=8.0)          # 2 次卡 → 1
        self._add_daily(record_date=date(2026, 7, 2), check_in_times=[],
                        check_out_times=[], actual_hours=0.0)                 # 无刷卡 → 0
        self._add_daily(record_date=date(2026, 7, 4), check_in_times=["07:30"],
                        check_out_times=["17:00"], actual_hours=8.0)          # 有卡但修正不算 → 0
        with self.app.app_context():
            db.session.add_all([
                DailyAttendanceOverride(emp_id=self.emp_id, record_date=date(2026, 7, 3),
                                        is_actual_attendance=True),   # 无记录日修正算 → 1
                DailyAttendanceOverride(emp_id=self.emp_id, record_date=date(2026, 7, 4),
                                        is_actual_attendance=False),  # 有卡日修正不算 → 0
            ])
            db.session.commit()
        data = self._get(f"?emp_id={self.emp_id}&month=2026-07").get_json()
        days = {d["date"]: d["actual_attendance_days"] for d in data["days"]}
        self.assertEqual(days["2026-07-01"], 1.0)
        self.assertEqual(days["2026-07-02"], 0.0)
        self.assertEqual(days["2026-07-03"], 1.0)
        self.assertEqual(days["2026-07-04"], 0.0)

    def test_days_fields_serialized(self):
        """days 序列化：HH:MM 数组、punch_count、迟到、异常。"""
        self._add_daily(record_date=date(2026, 7, 3), check_in_times=["07:45", "2026-07-03 12:00"],
                        check_out_times=["16:44", "2026-07-03 19:28"], actual_hours=8.0,
                        late_minutes=15, exception_reason="忘打卡")
        data = self._get(f"?emp_id={self.emp_id}&month=2026-07").get_json()
        day = data["days"][0]
        self.assertEqual(day["check_in_times"], ["07:45", "12:00"])
        self.assertEqual(day["check_out_times"], ["16:44", "19:28"])
        self.assertGreaterEqual(day["punch_count"], 4)
        self.assertEqual(day["late_minutes"], 15)
        self.assertEqual(day["exception_reason"], "忘打卡")
        self.assertEqual(data["summary"]["late_minutes_total"], 15)

    def test_manager_punch_times_from_raw_data(self):
        """管理人员的结构化刷卡为空时，从 raw_data 的钉钉原始键提取上/下班时间。"""
        with self.app.app_context():
            db.session.add(DailyRecord(
                emp_id=self.emp_id,
                record_date=date(2026, 7, 3),
                check_in_times=[],
                check_out_times=[],
                actual_hours=0.0,
                raw_data={"上班1打卡时间": "08:03", "下班1打卡时间": "17:32"},
            ))
            db.session.commit()
        data = self._get(f"?emp_id={self.emp_id}&month=2026-07").get_json()
        day = data["days"][0]
        self.assertEqual(day["check_in_times"], ["08:03"])
        self.assertEqual(day["check_out_times"], ["17:32"])
        self.assertEqual(day["punch_count"], 2)

    def test_invalid_params(self):
        """缺 emp_id / 非法 month 返回 4xx。"""
        self.assertEqual(self._get("?month=2026-07").status_code, 400)
        self.assertEqual(self._get(f"?emp_id={self.emp_id}&month=bad").status_code, 400)
        self.assertEqual(self._get(f"?emp_id=99999&month=2026-07").status_code, 400)

    def test_manager_employee_allowed(self):
        """考勤日历可查询管理人员（可见范围内不再被非管理人员过滤拦截）。"""
        resp = self._get(f"?emp_id={self.manager_id}&month=2026-07")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get_json()["employee"]["emp_no"], "M001")


class HomeOnlyUserCalendarApiTests(unittest.TestCase):
    """纯首页权限（仅 query_home）用户可以在首页查看本人考勤日历，且范围限定为本人。"""

    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmpdir.cleanup)
        self.app = Flask(__name__)
        self.app.config.update(
            TESTING=True,
            SECRET_KEY="test-secret",
            SQLALCHEMY_DATABASE_URI=f"sqlite:///{self.tmpdir.name}/cal_home_only.db",
            SQLALCHEMY_TRACK_MODIFICATIONS=False,
            JWT_EXPIRES_DELTA=timedelta(hours=12),
            FRONTEND_ORIGIN="http://localhost:5173",
            SESSION_COOKIE_NAME="api_access_token",
            SESSION_COOKIE_SAMESITE="None",
            SESSION_COOKIE_SECURE=False,
        )
        db.init_app(self.app)
        register_routes(self.app)

        with self.app.app_context():
            db.create_all()
            dept = Department(dept_no="D001", dept_name="制造一部")
            db.session.add(dept)
            db.session.flush()
            emp = Employee(emp_no="E001", name="员工甲", dept_id=dept.id, is_manager=False)
            mgr = Employee(emp_no="M001", name="经理甲", dept_id=dept.id, is_manager=True)
            db.session.add_all([emp, mgr])
            db.session.flush()
            home_user = User(
                username="homeuser",
                role="readonly",
                page_permissions={"query_home": True},
                profile_emp_no="M001",
            )
            home_user.set_password("home123")
            db.session.add(home_user)
            db.session.flush()
            # 即使员工分配让 E001 进入可见范围，纯首页用户也不应查出他人日历
            db.session.add(UserEmployeeAssignment(user_id=home_user.id, emp_id=emp.id))
            db.session.commit()
            self.emp_id = emp.id
            self.mgr_id = mgr.id

        self.client = attach_origin(self.app.test_client())
        with self.app.app_context():
            captcha_token = issue_slider_verified_token()
        self.client.post(
            "/api/auth/login",
            json={"username": "homeuser", "password": "home123", "captcha_token": captcha_token},
        )

    def tearDown(self) -> None:
        with self.app.app_context():
            db.session.remove()
            db.drop_all()

    def _get(self, query: str):
        return self.client.get(f"/api/query/attendance-calendar{query}")

    def test_home_only_user_views_self_calendar(self):
        """仅首页权限的账号可按绑定管理人员工号查看本人考勤日历。"""
        resp = self._get(f"?emp_id={self.mgr_id}&month=2026-07")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get_json()["employee"]["emp_no"], "M001")

    def test_home_only_user_cannot_view_other_employees(self):
        """仅首页权限的账号即使有员工分配，也不能查看他人考勤日历。"""
        resp = self._get(f"?emp_id={self.emp_id}&month=2026-07")
        self.assertEqual(resp.status_code, 400)

    def test_home_only_user_without_profile_emp_no_gets_400(self):
        """未绑定管理人员工号的纯首页账号查任何员工都返回 400。"""
        with self.app.app_context():
            home_user = User.query.filter_by(username="homeuser").first()
            home_user.profile_emp_no = None
            db.session.commit()

        resp = self._get(f"?emp_id={self.mgr_id}&month=2026-07")
        self.assertEqual(resp.status_code, 400)

    def test_home_only_user_with_non_manager_profile_gets_400(self):
        """绑定工号不是管理人员时，纯首页账号不能借其查看普通员工日历。"""
        with self.app.app_context():
            home_user = User.query.filter_by(username="homeuser").first()
            home_user.profile_emp_no = "E001"
            db.session.commit()

        resp = self._get(f"?emp_id={self.emp_id}&month=2026-07")
        self.assertEqual(resp.status_code, 400)


if __name__ == "__main__":
    unittest.main()
