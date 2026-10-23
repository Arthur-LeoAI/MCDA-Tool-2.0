"""Errors with machine-readable codes, so clients can show them in any language.

Every problem has a ``code`` (stable identifier), ``params`` (values to fill
into a message) and optionally a structured ``Location``. ``message`` is an
English rendering for logs, tests and clients without translations.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from typing import Any, Literal

# English templates; clients translate by code and may ignore these.
MESSAGES: dict[str, str] = {
    # data model
    "matrix_not_numeric": "matrix is not numeric: {detail}",
    "too_few_alternatives": "need at least {minimum} alternative(s), got {count}",
    "too_few_criteria": "need at least {minimum} criterion/criteria, got {count}",
    "empty_name": "name must be non-empty text",
    "duplicate_name": "duplicate name",
    "invalid_direction": "direction must be 'benefit' or 'cost', found {value!r}",
    "weight_not_finite": "weight must be a finite number, got {value!r}",
    "weight_negative": "weight must not be negative, got {value}",
    "no_positive_weight": "at least one criterion needs a positive weight",
    "matrix_shape": "matrix is {rows}x{cols}, expected {expected_rows}x{expected_cols} (alternatives x criteria)",
    "value_not_finite": "value must be a finite number",
    "weights_length": "expected {expected} weights, got {count}",
    # spreadsheet import
    "template_too_short": "expected the rows Criterion, Direction, Weight followed by alternatives",
    "label_expected": "expected label {expected!r}, found {found!r}",
    "weight_not_number": "weight must be a number, found {value!r}",
    "value_not_number": "value must be a number, found {value!r}",
    "not_legacy_workbook": "no 'Criteria Weight' row found; not a legacy V7 workbook",
    "legacy_goal_invalid": "goal must be 1 (max) or 0 (min), found {value!r}",
    "legacy_rank_invalid": "rank entry must be an alternative number, found {value!r}",
    "unsupported_file_type": "unsupported file type {suffix!r}; use .xlsx or .csv",
    "suffix_required": "a file suffix is required when reading or writing a stream",
    # calculation settings
    "normalization_none_cost": "normalization 'none' needs benefit criteria only; use min_max or fixed_range",
    "out_of_fixed_range": "{count} value(s) lie outside the fixed range, e.g. {value} not in [{low}, {high}]",
    "vector_needs_topsis": "vector normalization does not orient cost criteria; it is only available in TOPSIS",
    "cp_normalization": "compromise programming needs min_max or fixed_range normalization",
    "cp_p_invalid": "p must be >= 1 (or infinity), got {p}",
    "bounds_shape": "bounds must be (low, high) or one pair per criterion ({criteria})",
    "bounds_order": "each bound needs low <= high",
    # HTTP API
    "invalid_problem": "Invalid decision problem",
    "invalid_request": "Invalid request",
    "request_invalid": "{detail}",
    "ragged_row": "row has {count} values, expected {expected}",
    "invalid_criteria_selection": "Invalid criteria selection",
    "unknown_criterion": "unknown criterion",
    "empty_selection": "select at least one criterion",
    "file_too_large": "file is larger than {max_mb} MB",
    "file_unreadable": "could not read {filename} as a {suffix} file",
    "invalid_value": "{detail}",
    "internal_error": "Internal server error",
}

LocationKind = Literal["cell", "alternative", "criterion", "value", "row", "field"]


@dataclass(frozen=True)
class Location:
    """Where a problem is.

    - ``cell``: spreadsheet cell, ``ref`` such as ``"B4"``
    - ``alternative`` / ``criterion``: by ``name``, or by 1-based ``index`` when unnamed
    - ``value``: one matrix entry, by ``alternative`` and ``criterion`` names
    - ``row``: 1-based ``index`` of a matrix row in a request
    - ``field``: request field path in ``ref``, e.g. ``"problem.matrix.0.1"``
    """

    kind: LocationKind
    ref: str | None = None
    name: str | None = None
    index: int | None = None
    alternative: str | None = None
    criterion: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {key: value for key, value in self.__dict__.items() if value is not None}

    def __str__(self) -> str:
        if self.kind in ("cell", "field"):
            return str(self.ref)
        if self.kind == "value":
            return f"alternative '{self.alternative}', criterion '{self.criterion}'"
        if self.kind == "row":
            return f"matrix row {self.index}"
        return f"{self.kind} '{self.name}'" if self.name is not None else f"{self.kind} #{self.index}"


def render(code: str, params: Mapping[str, Any]) -> str:
    try:
        return MESSAGES[code].format(**params)
    except (KeyError, IndexError, ValueError):
        return code


@dataclass(frozen=True)
class ValidationIssue:
    """A single problem found in user-supplied data."""

    code: str
    params: Mapping[str, Any] = field(default_factory=dict)
    location: Location | None = None

    @property
    def message(self) -> str:
        return render(self.code, self.params)

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "params": dict(self.params),
            "location": self.location.to_dict() if self.location else None,
            "message": self.message,
        }

    def __str__(self) -> str:
        return f"{self.location}: {self.message}" if self.location else self.message


class ProblemValidationError(ValueError):
    """Raised when input data cannot form a valid decision problem."""

    code = "invalid_problem"

    def __init__(self, issues: Iterable[ValidationIssue]):
        self.issues = tuple(issues)
        lines = "\n".join(f"- {issue}" for issue in self.issues)
        super().__init__(f"Invalid decision problem ({len(self.issues)} issue(s)):\n{lines}")


class McdaError(ValueError):
    """An invalid request or setting, e.g. a normalisation that does not fit the data."""

    def __init__(self, code: str, **params: Any):
        self.code = code
        self.params = params
        super().__init__(render(code, params))
