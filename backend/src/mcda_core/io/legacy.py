"""Reader for the legacy "MCDA ELT V7" workbooks (sheet "Stability Interval").

Layout, by row (column A holds the labels):

1. criterion goal per column: 1 = maximise (benefit), 0 = minimise (cost)
2. whether the column was rescaled to Max = 100 / Min = 0 (1 = yes)
3. header: "No.", criterion names..., "Rank"
4+. one row per alternative, followed by a "Criteria Weight" row
then the stability intervals Excel computed for the weighted sum, e.g.
"Maximum Criteria Weight (Full Order)" / "Minimum Criteria Weight - Top:1"
and their "Normalised" variants.

The "Rank" column is an ordering, not per-alternative ranks: its k-th entry
is the 1-based number of the alternative placed at position k.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from ..errors import ProblemValidationError, ValidationIssue
from ..model import Criterion, DecisionProblem, Direction
from ._cells import Rows, Source, cell_ref, is_blank, parse_number, read_xlsx_rows

WEIGHT_LABEL = "Criteria Weight"
RANK_HEADER = "Rank"
# Excel's interval calculation writes huge finite numbers (about 4e15) where a
# weight can grow without bound; treat those as infinity.
UNBOUNDED_THRESHOLD = 1e12

_INTERVAL_LABELS = {
    ("full_order", False): "Criteria Weight (Full Order)",
    ("top1", False): "Criteria Weight - Top:1",
    ("full_order", True): "Criteria Weight Normalised (Full Order)",
    ("top1", True): "Criteria Weight Normalised - Top:1",
}


@dataclass(frozen=True)
class LegacyInterval:
    lower: float
    upper: float  # math.inf when unbounded


@dataclass(frozen=True)
class LegacyWorkbook:
    problem: DecisionProblem
    prescaled: tuple[bool, ...]
    reference_order: tuple[str, ...]
    # keyed by (scope, normalised) with scope in {"full_order", "top1"},
    # then by criterion name
    intervals: dict[tuple[str, bool], dict[str, LegacyInterval]]


def read_legacy_workbook(source: Source) -> LegacyWorkbook:
    return parse_legacy_rows(read_xlsx_rows(source))


def looks_like_legacy(rows: Rows) -> bool:
    """True for sheets in the legacy layout rather than the standard template."""
    labels = _labels(rows)
    return len(rows) >= 4 and WEIGHT_LABEL in labels and labels[0].lower() != "criterion"


def _labels(rows: Rows) -> list[str]:
    return [str(row[0]).strip() if row and not is_blank(row[0]) else "" for row in rows]


def parse_legacy_rows(rows: Rows) -> LegacyWorkbook:
    issues: list[ValidationIssue] = []
    labels = _labels(rows)

    if not looks_like_legacy(rows):
        raise ProblemValidationError([ValidationIssue(f"no '{WEIGHT_LABEL}' row found; not a legacy V7 workbook")])
    weight_row = labels.index(WEIGHT_LABEL)

    header = rows[2]
    end = next((c for c in range(1, len(header)) if str(header[c]).strip() == RANK_HEADER), len(header))
    while end > 1 and is_blank(header[end - 1]):
        end -= 1
    columns = range(1, end)
    rank_col = end if end < len(header) and str(header[end]).strip() == RANK_HEADER else None

    criteria: list[Criterion] = []
    prescaled: list[bool] = []
    for col in columns:
        try:
            direction = Direction.parse(rows[0][col])
        except ValueError:
            issues.append(ValidationIssue(f"goal must be 1 (max) or 0 (min), found {rows[0][col]!r}", cell_ref(0, col)))
            direction = Direction.BENEFIT
        weight = parse_number(rows[weight_row][col])
        if weight is None:
            issues.append(ValidationIssue("weight must be a number", cell_ref(weight_row, col)))
            weight = 0.0
        criteria.append(Criterion(str(header[col]).strip(), direction, weight))
        prescaled.append(parse_number(rows[1][col]) == 1)

    alternatives: list[str] = []
    matrix: list[list[float]] = []
    for r in range(3, weight_row):
        if is_blank(rows[r][0]):
            continue
        values = []
        for col in columns:
            value = parse_number(rows[r][col])
            if value is None:
                issues.append(ValidationIssue("value must be a number", cell_ref(r, col)))
                value = 0.0
            values.append(value)
        alternatives.append(str(rows[r][0]).strip())
        matrix.append(values)

    reference_order: list[str] = []
    if rank_col is not None:
        for r in range(3, 3 + len(alternatives)):
            number = parse_number(rows[r][rank_col])
            if number is None or not number.is_integer() or not 1 <= number <= len(alternatives):
                issues.append(ValidationIssue("rank entry must be an alternative number", cell_ref(r, rank_col)))
                continue
            reference_order.append(alternatives[int(number) - 1])

    intervals: dict[tuple[str, bool], dict[str, LegacyInterval]] = {}
    for key, suffix in _INTERVAL_LABELS.items():
        try:
            upper_row = labels.index(f"Maximum {suffix}")
            lower_row = labels.index(f"Minimum {suffix}")
        except ValueError:
            continue
        intervals[key] = {
            criterion.name: LegacyInterval(
                lower=parse_number(rows[lower_row][col]) or 0.0,
                upper=_upper(parse_number(rows[upper_row][col])),
            )
            for criterion, col in zip(criteria, columns, strict=True)
        }

    if issues:
        raise ProblemValidationError(issues)
    return LegacyWorkbook(
        problem=DecisionProblem(tuple(alternatives), tuple(criteria), matrix),
        prescaled=tuple(prescaled),
        reference_order=tuple(reference_order),
        intervals=intervals,
    )


def _upper(value: float | None) -> float:
    if value is None or value >= UNBOUNDED_THRESHOLD:
        return math.inf
    return value
