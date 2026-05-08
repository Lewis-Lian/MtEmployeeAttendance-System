import unittest

from datetime import datetime

from services.manager_attendance_service import normalize_days
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


if __name__ == "__main__":
    unittest.main()
