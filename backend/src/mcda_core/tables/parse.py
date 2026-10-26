"""Reading cell values written by people: "$1,234.50", "15%", "1.234,5", "(300)", "yes"."""

from __future__ import annotations

import math
import re
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Literal

DecimalMark = Literal[".", ","]

_SPACES = re.compile("[\\s\u00a0\u202f\u2009']")  # incl. no-break and thin spaces
_CURRENCY = re.compile(r"^[$€£¥]|[$€£¥]$|^(USD|EUR|GBP|CNY|RMB)\s*|\s*(USD|EUR|GBP|CNY|RMB)$", re.IGNORECASE)
_NUMBER = re.compile(r"^[+-]?(\d[\d.,]*|[.,]\d+)$")
_THOUSANDS_COMMA = re.compile(r"^\d{1,3}(,\d{3})+$")
_THOUSANDS_DOT = re.compile(r"^\d{1,3}(\.\d{3}){2,}$")

TRUE_WORDS = {"yes", "y", "true", "1", "ja", "j", "是", "有", "x", "✓", "✔"}
FALSE_WORDS = {"no", "n", "false", "0", "nein", "否", "无", "没有", "✗", "✘"}
# Placeholders people type for "no value".
MISSING_WORDS = {"-", "\u2013", "\u2014", "n/a", "na", "n.a.", "null", "none", "?", "/"}  # incl. en/em dash


@dataclass(frozen=True)
class ParsedNumber:
    value: float
    percent: bool = False


def _clean(text: str) -> tuple[str, bool, bool]:
    """Strip spaces, currency and %; return (core, negative, percent)."""
    core = _SPACES.sub("", text.strip())
    negative = core.startswith("(") and core.endswith(")")
    if negative:
        core = core[1:-1]
    core = _CURRENCY.sub("", core)
    percent = core.endswith("%")
    if percent:
        core = core[:-1]
    core = _CURRENCY.sub("", core)  # "$12%" is unusual, but "12 USD" after % removal is not
    return core, negative, percent


def decimal_mark_hint(text: str) -> DecimalMark | None:
    """The decimal mark this text proves, if any ("1.234,5" proves ",")."""
    core, _, _ = _clean(text)
    if "." in core and "," in core:
        return "," if core.rfind(",") > core.rfind(".") else "."
    return None


def column_decimal_mark(values: Iterable[object]) -> DecimalMark | None:
    """A decimal mark proven by any text value of a column (first proof wins)."""
    for value in values:
        if isinstance(value, str):
            hint = decimal_mark_hint(value)
            if hint:
                return hint
    return None


def parse_number(value: object, decimal_mark: DecimalMark | None = None) -> ParsedNumber | None:
    """A finite number from a cell, or None. Booleans are not numbers."""
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return ParsedNumber(float(value)) if math.isfinite(value) else None
    if not isinstance(value, str):
        return None
    core, negative, percent = _clean(value)
    if core.startswith(("+", "-")) and negative:
        return None
    if not core or not _NUMBER.match(core):
        return None
    sign = -1.0 if core.startswith("-") or negative else 1.0
    digits = core.lstrip("+-")
    mark = decimal_mark or decimal_mark_hint(digits)
    if mark is None:
        if "," in digits and "." not in digits:
            mark = "." if _THOUSANDS_COMMA.match(digits) else ","
        elif "." in digits and "," not in digits and _THOUSANDS_DOT.match(digits):
            mark = ","
        else:
            mark = "."
    thousands = "," if mark == "." else "."
    normalised = digits.replace(thousands, "").replace(mark, ".")
    if normalised.count(".") > 1:
        return None
    try:
        number = sign * float(normalised)
    except ValueError:
        return None
    return ParsedNumber(number, percent) if math.isfinite(number) else None


def parse_boolean(value: object) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and value in (0, 1):
        return bool(value)
    if isinstance(value, str):
        word = value.strip().lower()
        if word in TRUE_WORDS:
            return True
        if word in FALSE_WORDS:
            return False
    return None


def is_blank(value: object) -> bool:
    """Empty cells and placeholders such as "-" or "n/a"."""
    return value is None or (isinstance(value, str) and (not value.strip() or value.strip().lower() in MISSING_WORDS))


def as_label(value: object) -> str:
    """Text label for ordinal/categorical values (numbers without trailing .0)."""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()
