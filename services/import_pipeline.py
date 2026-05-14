from __future__ import annotations

import csv
import glob
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from typing import Any

from utils.excel_parser import ExcelParser
from utils.helpers import clean_text


@dataclass(frozen=True)
class NormalizedImportRows:
    rows: list[list[Any]]
    cleanup_dir: str | None = None


def classify_import_file(filename: str) -> str:
    if "加班" in filename:
        return "overtime"
    if "请假" in filename:
        return "leave"
    if "管理人员" in filename and "月报" in filename:
        return "manager_monthly"
    if "管理人员" in filename:
        return "manager_daily"
    if "月报" in filename:
        return "monthly"
    return "daily"


def normalize_import_rows(file_path: str, file_type: str | None = None) -> NormalizedImportRows:
    rows = _read_primary_rows(file_path)
    cleanup_dir: str | None = None

    try:
        if (not rows) and file_path.lower().endswith(".xls"):
            converted_path, cleanup_dir = convert_xls_to_xlsx(file_path)
            if converted_path:
                rows = ExcelParser.read_rows(converted_path)

        resolved_type = file_type or classify_import_file(os.path.basename(file_path))
        if resolved_type in {"manager_daily", "manager_monthly"}:
            rows = normalize_manager_rows(file_path, rows)

        return NormalizedImportRows(rows=rows, cleanup_dir=cleanup_dir)
    except Exception:
        _cleanup_dir(cleanup_dir)
        raise


def convert_xls_to_xlsx(file_path: str) -> tuple[str | None, str | None]:
    tmpdir = tempfile.mkdtemp(prefix="attendance_xls_")
    try:
        profile_dir = os.path.join(tmpdir, "lo-profile")
        os.makedirs(profile_dir, exist_ok=True)
        env = os.environ.copy()
        env["HOME"] = tmpdir
        env["XDG_CONFIG_HOME"] = tmpdir
        subprocess.run(
            [
                "libreoffice",
                f"-env:UserInstallation=file://{profile_dir}",
                "--headless",
                "--convert-to",
                "xlsx",
                "--outdir",
                tmpdir,
                file_path,
            ],
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=env,
        )
        basename = os.path.splitext(os.path.basename(file_path))[0]
        converted_path = os.path.join(tmpdir, f"{basename}.xlsx")
        if os.path.exists(converted_path):
            return converted_path, tmpdir
        _cleanup_dir(tmpdir)
        return None, None
    except Exception:
        _cleanup_dir(tmpdir)
        return None, None


def read_csv_rows(file_path: str) -> list[list[Any]]:
    with open(file_path, newline="", encoding="utf-8-sig") as handle:
        return [list(row) for row in csv.reader(handle)]


def convert_to_csv_rows(file_path: str) -> list[list[Any]]:
    tmpdir = tempfile.mkdtemp(prefix="attendance_csv_")
    try:
        profile_dir = os.path.join(tmpdir, "lo-profile")
        os.makedirs(profile_dir, exist_ok=True)
        env = os.environ.copy()
        env["HOME"] = tmpdir
        env["XDG_CONFIG_HOME"] = tmpdir
        subprocess.run(
            [
                "libreoffice",
                f"-env:UserInstallation=file://{profile_dir}",
                "--headless",
                "--convert-to",
                "csv",
                "--outdir",
                tmpdir,
                file_path,
            ],
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=env,
        )
        basename = os.path.splitext(os.path.basename(file_path))[0]
        converted_path = os.path.join(tmpdir, f"{basename}.csv")
        if os.path.exists(converted_path):
            return read_csv_rows(converted_path)
        candidates = glob.glob(os.path.join(tmpdir, "*.csv"))
        if candidates:
            return read_csv_rows(candidates[0])
        return []
    finally:
        _cleanup_dir(tmpdir)


def normalize_manager_rows(file_path: str, rows: list[list[Any]]) -> list[list[Any]]:
    if _has_manager_header(rows):
        return rows
    converted = convert_to_csv_rows(file_path)
    return converted or rows


def _read_primary_rows(file_path: str) -> list[list[Any]]:
    try:
        return ExcelParser.read_rows(file_path)
    except Exception:
        return []


def _has_manager_header(rows: list[list[Any]]) -> bool:
    return any(
        "姓名" in {clean_text(value) for value in row if clean_text(value)}
        and "部门" in {clean_text(value) for value in row if clean_text(value)}
        for row in rows[:8]
    )


def _cleanup_dir(path: str | None) -> None:
    if path and os.path.isdir(path):
        shutil.rmtree(path, ignore_errors=True)
