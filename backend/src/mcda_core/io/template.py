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
from ._cells import Rows, Source, cell_ref, is_blank, parse_number, read_xlsx_rows

TEMPLATE_SHEET = "Decision"
HEADER_LABELS = ("Criterion", "Direction", "Weight")


def read_problem(source: Source, suffix: str | None = None) -> DecisionProblem:
    """Read a decision problem from a template file (.xlsx or .csv).

    ``source`` is a path or a binary stream; streams need ``suffix``
    (e.g. ``".xlsx"``) since they carry no file name.
    """
    if suffix is None:
        if not isinstance(source, (str, Path)):
            raise ValueError("suffix is required when reading from a stream")
        suffix = Path(source).suffix
    suffix = suffix.lower()
    if suffix == ".csv":
        data = Path(source).read_bytes() if isinstance(source, (str, Path)) else source.read()
        rows: Rows = _parse_csv(_decode(data))
    elif suffix in (".xlsx", ".xlsm"):
        rows = read_xlsx_rows(source, prefer_sheet=TEMPLATE_SHEET)
    else:
        raise ValueError(f"unsupported file type {suffix!r} (use .xlsx or .csv)")
    return parse_rows(rows)


_DECIMAL_COMMA = re.compile(r"^\s*[-+]?\d+,\d+\s*$")


def _decode(data: bytes) -> str:
    # Excel's plain "CSV" export uses the Windows code page, not UTF-8.
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return data.decode("cp1252")


def _parse_csv(text: str) -> Rows:
    """Parse CSV with ',' or ';' delimiters.

    Semicolon files (common in German/European Excel exports) may use a
    decimal comma, so "0,6" is read as 0.6 there.
    """
    try:
        delimiter = csv.Sniffer().sniff(text[:4096], delimiters=",;\t").delimiter
    except csv.Error:
        delimiter = ","
    rows: Rows = [list(row) for row in csv.reader(io.StringIO(text), delimiter=delimiter)]
    if delimiter == ";":
        rows = [
            [v.replace(",", ".") if isinstance(v, str) and _DECIMAL_COMMA.match(v) else v for v in row] for row in rows
        ]
    return rows


def parse_rows(rows: Rows) -> DecisionProblem:
    """Build a problem from raw cell rows, collecting every issue found."""
    issues: list[ValidationIssue] = []
    if len(rows) < len(HEADER_LABELS):
        raise ProblemValidationError(
            [ValidationIssue(f"expected the rows {', '.join(HEADER_LABELS)} followed by alternatives")]
        )

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
            issues.append(
                ValidationIssue(f"direction must be 'benefit' or 'cost', found {direction_raw!r}", cell_ref(1, col))
            )
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
                issues.append(
                    ValidationIssue(f"value must be a number, found {cell(row, col)!r}", cell_ref(row_index, col))
                )
                value = 0.0
            values.append(value)
        alternatives.append(str(name).strip() if not is_blank(name) else "")
        matrix.append(values)

    if issues:
        raise ProblemValidationError(issues)
    return DecisionProblem(tuple(alternatives), tuple(criteria), matrix)


def template_rows(problem: DecisionProblem) -> Rows:
    return [
        ["Criterion", *problem.criterion_names],
        ["Direction", *(d.value for d in problem.directions)],
        ["Weight", *(c.weight for c in problem.criteria)],
        *([name, *map(float, values)] for name, values in zip(problem.alternatives, problem.matrix, strict=True)),
    ]


def add_template_sheet(workbook: openpyxl.Workbook, problem: DecisionProblem) -> None:
    """Add a "Decision" sheet, which read_problem() can read back."""
    worksheet = workbook.create_sheet(TEMPLATE_SHEET)
    for row in template_rows(problem):
        worksheet.append(row)


def write_problem(problem: DecisionProblem, target: Source, suffix: str | None = None) -> None:
    """Write a problem in the template layout (.xlsx or .csv) to a path or binary stream."""
    if suffix is None:
        if not isinstance(target, (str, Path)):
            raise ValueError("suffix is required when writing to a stream")
        suffix = Path(target).suffix
    suffix = suffix.lower()
    if suffix == ".csv":
        text = io.StringIO()
        csv.writer(text, lineterminator="\n").writerows(template_rows(problem))
        data = text.getvalue().encode("utf-8")
        if isinstance(target, (str, Path)):
            Path(target).write_bytes(data)
        else:
            target.write(data)
    elif suffix == ".xlsx":
        workbook = openpyxl.Workbook()
        workbook.remove(workbook.worksheets[0])  # drop the default empty sheet
        add_template_sheet(workbook, problem)
        workbook.save(target)
    else:
        raise ValueError(f"unsupported file type {suffix!r} (use .xlsx or .csv)")
