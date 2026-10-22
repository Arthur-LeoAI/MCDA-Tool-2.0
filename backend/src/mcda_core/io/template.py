"""Reader and writer for the standard input template (see docs/data-format.md).

Layout (same for .xlsx and .csv)::

    Criterion | <criterion 1> | <criterion 2> | ...
    Direction | benefit       | cost          | ...
    Weight    | 0.6           | 0.4           | ...
    <alt 1>   | 12.5          | 300           | ...
    <alt 2>   | ...
"""

from __future__ import annotations

import csv
import io
import re
from pathlib import Path

import openpyxl

from ..errors import ProblemValidationError, ValidationIssue
from ..model import Criterion, DecisionProblem, Direction
from ._cells import Rows, cell_ref, is_blank, parse_number, read_xlsx_rows

TEMPLATE_SHEET = "Decision"
HEADER_LABELS = ("Criterion", "Direction", "Weight")


def read_problem(path: str | Path) -> DecisionProblem:
    """Read a decision problem from a template file (.xlsx or .csv)."""
    path = Path(path)
    suffix = path.suffix.lower()
    if suffix == ".csv":
        rows: Rows = _read_csv_rows(path)
    elif suffix in (".xlsx", ".xlsm"):
        sheets = openpyxl.load_workbook(path, read_only=True).sheetnames
        rows = read_xlsx_rows(path, TEMPLATE_SHEET if TEMPLATE_SHEET in sheets else None)
    else:
        raise ValueError(f"unsupported file type {suffix!r} (use .xlsx or .csv)")
    return parse_rows(rows)


_DECIMAL_COMMA = re.compile(r"^\s*[-+]?\d+,\d+\s*$")


def _read_csv_rows(path: Path) -> Rows:
    """Read CSV with ',' or ';' delimiters.

    Semicolon files (common in German/European Excel exports) may use a
    decimal comma, so "0,6" is read as 0.6 there.
    """
    text = path.read_text(encoding="utf-8-sig")
    try:
        delimiter = csv.Sniffer().sniff(text[:4096], delimiters=",;\t").delimiter
    except csv.Error:
        delimiter = ","
    rows: Rows = [list(row) for row in csv.reader(io.StringIO(text), delimiter=delimiter)]
    if delimiter == ";":
        rows = [
            [v.replace(",", ".") if isinstance(v, str) and _DECIMAL_COMMA.match(v) else v for v in row]
            for row in rows
        ]
    return rows


def parse_rows(rows: Rows) -> DecisionProblem:
    """Build a problem from raw cell rows, collecting every issue found."""
    issues: list[ValidationIssue] = []
    if len(rows) < len(HEADER_LABELS):
        raise ProblemValidationError([ValidationIssue(
            f"expected the rows {', '.join(HEADER_LABELS)} followed by alternatives"
        )])

    for row_index, label in enumerate(HEADER_LABELS):
        found = rows[row_index][0] if rows[row_index] else None
        if str(found or "").strip().lower() != label.lower():
            issues.append(ValidationIssue(f"expected label '{label}', found {found!r}", cell_ref(row_index, 0)))

    header = rows[0]
    n_criteria = len(header) - 1
    while n_criteria > 0 and is_blank(header[n_criteria]):
        n_criteria -= 1
    columns = range(1, n_criteria + 1)

    def cell(row: list[object], col: int) -> object:
        return row[col] if col < len(row) else None

    criteria: list[Criterion] = []
    for col in columns:
        name = cell(header, col)
        direction_raw = cell(rows[1], col)
        weight = parse_number(cell(rows[2], col))
        if is_blank(name):
            issues.append(ValidationIssue("criterion name is empty", cell_ref(0, col)))
        try:
            direction = Direction.parse(direction_raw)
        except ValueError:
            issues.append(ValidationIssue(f"direction must be 'benefit' or 'cost', found {direction_raw!r}", cell_ref(1, col)))
            direction = Direction.BENEFIT
        if weight is None:
            issues.append(ValidationIssue(f"weight must be a number, found {cell(rows[2], col)!r}", cell_ref(2, col)))
            weight = 0.0
        criteria.append(Criterion(str(name).strip() if not is_blank(name) else "", direction, weight))

    alternatives: list[str] = []
    matrix: list[list[float]] = []
    for row_index in range(len(HEADER_LABELS), len(rows)):
        row = rows[row_index]
        if all(is_blank(v) for v in row):
            continue
        name = cell(row, 0)
        if is_blank(name):
            issues.append(ValidationIssue("alternative name is empty", cell_ref(row_index, 0)))
        values: list[float] = []
        for col in columns:
            value = parse_number(cell(row, col))
            if value is None:
                issues.append(ValidationIssue(f"value must be a number, found {cell(row, col)!r}", cell_ref(row_index, col)))
                value = 0.0
            values.append(value)
        alternatives.append(str(name).strip() if not is_blank(name) else "")
        matrix.append(values)

    if issues:
        raise ProblemValidationError(issues)
    return DecisionProblem(tuple(alternatives), tuple(criteria), matrix)


def write_problem(problem: DecisionProblem, path: str | Path) -> None:
    """Write a problem in the template layout (.xlsx or .csv)."""
    path = Path(path)
    rows: Rows = [
        ["Criterion", *problem.criterion_names],
        ["Direction", *(d.value for d in problem.directions)],
        ["Weight", *(c.weight for c in problem.criteria)],
        *([name, *map(float, values)] for name, values in zip(problem.alternatives, problem.matrix)),
    ]
    suffix = path.suffix.lower()
    if suffix == ".csv":
        with path.open("w", newline="", encoding="utf-8") as handle:
            csv.writer(handle).writerows(rows)
    elif suffix == ".xlsx":
        workbook = openpyxl.Workbook()
        worksheet = workbook.active
        worksheet.title = TEMPLATE_SHEET
        for row in rows:
            worksheet.append(row)
        workbook.save(path)
    else:
        raise ValueError(f"unsupported file type {suffix!r} (use .xlsx or .csv)")
