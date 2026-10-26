"""Arbitrary tables: reading human-written values, guessing structure, building projects."""

from .build import ColumnSpec, build_project
from .detect import ColumnInfo, describe_columns, guess_header_row, guess_name_column
from .parse import column_decimal_mark, is_blank, parse_boolean, parse_number

__all__ = [
    "ColumnInfo",
    "ColumnSpec",
    "build_project",
    "column_decimal_mark",
    "describe_columns",
    "guess_header_row",
    "guess_name_column",
    "is_blank",
    "parse_boolean",
    "parse_number",
]
