import unittest
from unittest import mock

from services.import_pipeline import classify_import_file, normalize_import_rows


class ImportPipelineTests(unittest.TestCase):
    def test_classify_import_file_prefers_manager_monthly(self) -> None:
        self.assertEqual(classify_import_file("2026年05月管理人员月报.xlsx"), "manager_monthly")

    def test_xls_fallback_returns_cleanup_dir_to_caller(self) -> None:
        with mock.patch("services.import_pipeline.ExcelParser.read_rows", side_effect=[[], [["header"]]]):
            with mock.patch(
                "services.import_pipeline.convert_xls_to_xlsx",
                return_value=("converted.xlsx", "tmpdir"),
            ):
                with mock.patch("services.import_pipeline.shutil.rmtree") as cleanup:
                    normalized = normalize_import_rows("sample.xls")

        self.assertEqual(normalized.rows, [["header"]])
        self.assertEqual(normalized.cleanup_dir, "tmpdir")
        cleanup.assert_not_called()

    def test_xls_fallback_cleans_tempdir_when_converted_read_fails(self) -> None:
        with mock.patch("services.import_pipeline.ExcelParser.read_rows", side_effect=[[], ValueError("boom")]):
            with mock.patch(
                "services.import_pipeline.convert_xls_to_xlsx",
                return_value=("converted.xlsx", "tmpdir"),
            ):
                with mock.patch("services.import_pipeline.os.path.isdir", return_value=True):
                    with mock.patch("services.import_pipeline.shutil.rmtree") as cleanup:
                        with self.assertRaisesRegex(ValueError, "boom"):
                            normalize_import_rows("sample.xls")

        cleanup.assert_called_once_with("tmpdir", ignore_errors=True)

    def test_manager_files_use_csv_fallback_when_primary_rows_lack_headers(self) -> None:
        primary_rows = [["导出时间"], ["经理甲"]]
        converted_rows = [["部门", "姓名"], ["行政部", "经理甲"]]

        with mock.patch("services.import_pipeline.ExcelParser.read_rows", return_value=primary_rows):
            with mock.patch("services.import_pipeline.convert_to_csv_rows", return_value=converted_rows) as convert:
                normalized = normalize_import_rows("/tmp/2026-05-管理人员考勤.xlsx")

        self.assertEqual(normalized.rows, converted_rows)
        self.assertIsNone(normalized.cleanup_dir)
        convert.assert_called_once_with("/tmp/2026-05-管理人员考勤.xlsx")

    def test_manager_files_keep_primary_rows_when_headers_are_present(self) -> None:
        rows = [["部门", "姓名"], ["行政部", "经理甲"]]

        with mock.patch("services.import_pipeline.ExcelParser.read_rows", return_value=rows):
            with mock.patch("services.import_pipeline.convert_to_csv_rows") as convert:
                normalized = normalize_import_rows("/tmp/2026-05-管理人员考勤.xlsx")

        self.assertEqual(normalized.rows, rows)
        convert.assert_not_called()

    def test_manager_xls_cleanup_runs_when_csv_fallback_raises(self) -> None:
        primary_rows = [["导出时间"], ["经理甲"]]

        with mock.patch("services.import_pipeline.ExcelParser.read_rows", side_effect=[[], primary_rows]):
            with mock.patch(
                "services.import_pipeline.convert_xls_to_xlsx",
                return_value=("converted.xlsx", "tmpdir"),
            ):
                with mock.patch("services.import_pipeline.convert_to_csv_rows", side_effect=ValueError("csv fail")):
                    with mock.patch("services.import_pipeline.os.path.isdir", return_value=True):
                        with mock.patch("services.import_pipeline.shutil.rmtree") as cleanup:
                            with self.assertRaisesRegex(ValueError, "csv fail"):
                                normalize_import_rows("/tmp/2026-05-管理人员考勤.xls")

        cleanup.assert_called_once_with("tmpdir", ignore_errors=True)
