from __future__ import annotations

from datetime import datetime, date
from typing import Any, Optional


DATETIME_FORMATS = [
    "%Y-%m-%d %H:%M:%S",
    "%Y/%m/%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%Y/%m/%d %H:%M",
    "%Y-%m-%d",
    "%Y/%m/%d",
]


def parse_datetime(value: Any) -> Optional[datetime]:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time())

    text = str(value).strip()
    for fmt in DATETIME_FORMATS:
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def parse_date(value: Any) -> Optional[date]:
    dt = parse_datetime(value)
    return dt.date() if dt else None


def parse_float(value: Any, default: float = 0.0) -> float:
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (ValueError, TypeError):
        return default


def parse_int(value: Any, default: int = 0) -> int:
    if value is None or value == "":
        return default
    try:
        return int(float(value))
    except (ValueError, TypeError):
        return default


def parse_bool_zh(value: Any) -> bool:
    if value is None:
        return False
    text = str(value).strip().lower()
    return text in {"是", "y", "yes", "true", "1", "周末", "法定"}


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def split_time_cells(raw: str) -> list[str]:
    if not raw:
        return []
    raw = str(raw).replace("；", ";").replace("，", ",")
    for sep in [";", ",", " ", "\n", "|"]:
        raw = raw.replace(sep, "|")
    return [p.strip() for p in raw.split("|") if p.strip()]
