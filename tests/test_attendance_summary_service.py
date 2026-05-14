import unittest
from types import SimpleNamespace
from unittest import mock

from services.attendance_service import AttendanceService
from services.attendance_source_service import EMPLOYEE_STATS_CONTEXT
from services.attendance_summary_service import batch_monthly_summaries


def monthly_totals(**overrides) -> SimpleNamespace:
    defaults = {
        "expected_hours": 0,
        "actual_hours": 0,
        "absent_hours": 0,
        "leave_hours": 0,
        "overtime_hours": 0,
        "late_minutes": 0,
        "early_leave_minutes": 0,
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


class BatchMonthlySummariesTests(unittest.TestCase):
    def test_requires_explicit_context(self) -> None:
        with self.assertRaises(TypeError):
            batch_monthly_summaries("2026-05", [])

    def test_batches_employee_month_lookup_once_and_aggregates_totals(self) -> None:
        employees = [SimpleNamespace(id=1), SimpleNamespace(id=2)]
        rows_by_employee = {
            1: [
                monthly_totals(
                    expected_hours=8,
                    actual_hours=7.5,
                    absent_hours=0.5,
                    leave_hours=1.0,
                    overtime_hours=0.5,
                    late_minutes=15,
                    early_leave_minutes=5,
                ),
                monthly_totals(
                    expected_hours=8,
                    actual_hours=8,
                    overtime_hours=1.5,
                    late_minutes=5,
                ),
            ]
        }

        with mock.patch("services.attendance_summary_service.attendance_views_by_employee", return_value=rows_by_employee) as lookup:
            summaries = batch_monthly_summaries("2026-05", employees, EMPLOYEE_STATS_CONTEXT)

        lookup.assert_called_once_with("2026-05", employees, EMPLOYEE_STATS_CONTEXT)
        self.assertEqual(
            summaries[1],
            {
                "expected_hours": 16.0,
                "actual_hours": 15.5,
                "absent_hours": 0.5,
                "leave_hours": 1.0,
                "overtime_hours": 2.0,
                "late_minutes": 20,
                "early_leave_minutes": 5,
            },
        )
        self.assertEqual(
            summaries[2],
            {
                "expected_hours": 0.0,
                "actual_hours": 0.0,
                "absent_hours": 0.0,
                "leave_hours": 0.0,
                "overtime_hours": 0.0,
                "late_minutes": 0,
                "early_leave_minutes": 0,
            },
        )


class AttendanceServiceMonthlySummaryTests(unittest.TestCase):
    def test_monthly_summary_uses_batched_lookup_and_preserves_summary_shape(self) -> None:
        employee = SimpleNamespace(id=7)
        employee_model = mock.Mock()
        employee_model.query.get.return_value = employee
        rows_by_employee = {
            7: [
                monthly_totals(
                    expected_hours=8,
                    actual_hours=7.5,
                    absent_hours=0.5,
                    leave_hours=1.0,
                    overtime_hours=0.5,
                    late_minutes=15,
                    early_leave_minutes=5,
                ),
                monthly_totals(
                    expected_hours=2,
                    actual_hours=1.5,
                    absent_hours=0.5,
                    overtime_hours=0.0,
                    late_minutes=0,
                    early_leave_minutes=1,
                ),
            ]
        }

        with mock.patch("services.attendance_service.Employee", employee_model):
            with mock.patch("services.attendance_summary_service.attendance_views_by_employee", return_value=rows_by_employee) as lookup:
                summary = AttendanceService.monthly_summary(7, "2026-05")

        lookup.assert_called_once_with("2026-05", [employee], EMPLOYEE_STATS_CONTEXT)
        self.assertEqual(
            summary,
            {
                "expected_hours": 10.0,
                "actual_hours": 9.0,
                "absent_hours": 1.0,
                "leave_hours": 1.0,
                "overtime_hours": 0.5,
                "late_minutes": 15,
                "early_leave_minutes": 6,
            },
        )

    def test_monthly_summary_returns_zeroes_when_employee_does_not_exist(self) -> None:
        employee_model = mock.Mock()
        employee_model.query.get.return_value = None

        with mock.patch("services.attendance_service.Employee", employee_model):
            with mock.patch("services.attendance_service.batch_monthly_summaries") as batch_lookup:
                summary = AttendanceService.monthly_summary(99, "2026-05")

        batch_lookup.assert_not_called()
        self.assertEqual(
            summary,
            {
                "expected_hours": 0.0,
                "actual_hours": 0.0,
                "absent_hours": 0.0,
                "leave_hours": 0.0,
                "overtime_hours": 0.0,
                "late_minutes": 0,
                "early_leave_minutes": 0,
            },
        )


if __name__ == "__main__":
    unittest.main()
