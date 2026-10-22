"""Small helpers shared by the spreadsheet readers."""

from __future__ import annotations

import math
from pathlib import Path

import openpyxl
from openpyxl.utils import get_column_letter

Rows = list[list[object]]


def cell_ref(row: int, col: int) -> str:
    """Excel-style reference for 0-based indices, e.g. (2, 1) -> 'B3'."""
    return f"{get_column_letter(col + 1)}{row + 1}"


def is_blank(value: object) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


def parse_number(value: object) -> float | None:
    """Return a finite float, or None if the cell is not a usable number."""
    if isinstance(value, bool) or is_blank(value):
        return None
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def read_xlsx_rows(path: Path, sheet: str | None = None) -> Rows:
    """Read cell values (formulas resolved to cached results), padded to equal width."""
    workbook = openpyxl.load_workbook(path, data_only=True, read_only=True)
    try:
        worksheet = workbook[sheet] if sheet else workbook.worksheets[0]
        rows = [list(row) for row in worksheet.iter_rows(values_only=True)]
    finally:
        workbook.close()
    width = max((len(row) for row in rows), default=0)
    return [row + [None] * (width - len(row)) for row in rows]
