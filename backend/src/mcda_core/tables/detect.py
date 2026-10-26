"""Guessing the structure of an arbitrary table (docs/design/s2-data-preparation.md)."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Literal

from .parse import as_label, column_decimal_mark, is_blank, parse_boolean, parse_number

ColumnType = Literal["numeric", "ordinal", "categorical", "boolean", "text", "empty"]
Rows = Sequence[Sequence[object]]

NUMERIC_SHARE = 0.9
MAX_CATEGORIES = 10
HEADER_SEARCH_ROWS = 10

# Known ordered vocabularies, worst/lowest first. Matching ignores case.
ORDERED_VOCABULARIES: tuple[tuple[str, ...], ...] = (
    ("very low", "low", "medium", "high", "very high"),
    ("low", "mid", "high"),
    ("poor", "fair", "good", "very good", "excellent"),
    ("bad", "ok", "good"),
    ("small", "medium", "large"),
    ("s", "m", "l", "xl", "xxl"),
    ("niedrig", "mittel", "hoch"),
    ("很低", "低", "中", "高", "很高"),
    ("低", "中等", "高"),
    ("小", "中", "大"),
    ("差", "一般", "好", "很好"),
    ("差", "中", "良", "优"),
    ("无", "一般", "需认证"),
)


@dataclass(frozen=True)
class ColumnInfo:
    index: int
    header: str
    detected_type: ColumnType
    present: int
    """Non-empty cells."""
    numeric_share: float
    """Share of non-empty cells that read as numbers."""
    percent: bool = False
    categories: tuple[str, ...] = ()
    """Distinct values in order (vocabulary order for ordinal, first appearance otherwise)."""
    examples: tuple[str, ...] = field(default=())


def cell(row: Sequence[object], index: int) -> object:
    return row[index] if index < len(row) else None


def guess_header_row(rows: Rows) -> int:
    """First of the top rows that is mostly text and is followed by a row with numbers."""
    for r in range(min(HEADER_SEARCH_ROWS, len(rows) - 1)):
        filled = [v for v in rows[r] if not is_blank(v)]
        width = max(len(rows[r]), 1)
        mostly_text = len(filled) * 2 >= width and all(isinstance(v, str) and parse_number(v) is None for v in filled)
        next_has_number = any(parse_number(v) is not None for v in rows[r + 1])
        if filled and mostly_text and next_has_number:
            return r
    return 0


def _vocabulary_order(values: list[str]) -> tuple[str, ...] | None:
    wanted = {v.lower() for v in values}
    for vocabulary in ORDERED_VOCABULARIES:
        if wanted <= set(vocabulary):
            lookup = {v.lower(): v for v in values}
            return tuple(lookup[word] for word in vocabulary if word in lookup)
    return None


def describe_column(index: int, header: object, values: Sequence[object]) -> ColumnInfo:
    present = [v for v in values if not is_blank(v)]
    name = as_label(header) if not is_blank(header) else ""
    examples = tuple(as_label(v) for v in present[:3])
    if not present:
        return ColumnInfo(index, name, "empty", 0, 0.0, examples=examples)

    mark = column_decimal_mark(present)
    numbers = [parse_number(v, mark) for v in present]
    numeric_share = sum(n is not None for n in numbers) / len(present)
    percent = any(n is not None and n.percent for n in numbers)
    distinct = list(dict.fromkeys(as_label(v) for v in present))

    if all(parse_boolean(v) is not None for v in present) and not all(n is not None for n in numbers):
        column_type: ColumnType = "boolean"
    elif numeric_share >= NUMERIC_SHARE:
        column_type = "numeric"
    elif len(distinct) <= MAX_CATEGORIES:
        order = _vocabulary_order(distinct)
        return ColumnInfo(
            index,
            name,
            "ordinal" if order else "categorical",
            len(present),
            numeric_share,
            categories=order or tuple(distinct),
            examples=examples,
        )
    else:
        column_type = "text"
    return ColumnInfo(index, name, column_type, len(present), numeric_share, percent, examples=examples)


def describe_columns(rows: Rows, header_row: int) -> list[ColumnInfo]:
    header = rows[header_row] if header_row < len(rows) else []
    body = rows[header_row + 1 :]
    width = max([len(header), *(len(r) for r in body)], default=0)
    return [describe_column(j, cell(header, j), [cell(r, j) for r in body]) for j in range(width)]


def guess_name_column(columns: Sequence[ColumnInfo], rows: int) -> int | None:
    """First text-like column whose values are (nearly) all different."""
    for column in columns:
        if column.detected_type in ("text", "categorical") and column.present:
            distinct = len(column.categories) if column.categories else column.present
            if column.detected_type == "text" or distinct >= max(2, 0.9 * rows):
                return column.index
    return None
