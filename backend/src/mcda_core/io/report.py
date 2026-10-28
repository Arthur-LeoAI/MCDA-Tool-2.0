"""Excel report with results, stability intervals and Pareto analysis, plus any extra sheets.

The report also contains the input as a "Decision" sheet, so it can be
imported again with read_problem().
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from typing import Literal

from ..methods import MethodResult
from ..model import DecisionProblem
from ..pareto import DominanceInfo
from ..sensitivity import StabilityScope, WeightInterval
from ._cells import Source, column_letter
from .template import add_template_sheet

UNBOUNDED = "unbounded"
_STABILITY_SHEETS = {
    StabilityScope.FULL_ORDER: "Stability (full order)",
    StabilityScope.TOP1: "Stability (top 1)",
}


def write_report(
    target: Source,
    problem: DecisionProblem,
    results: Sequence[tuple[str, MethodResult]],
    stability: Mapping[StabilityScope, Sequence[WeightInterval]] | None = None,
    pareto: Sequence[DominanceInfo] | None = None,
    decision: DecisionProblem | Literal["same"] | None = "same",
    front: Sequence[tuple[str, Sequence[Sequence[object]]]] = (),
    back: Sequence[tuple[str, Sequence[Sequence[object]]]] = (),
) -> None:
    """Write an .xlsx report. ``results`` pairs a column label with each result.

    ``decision`` is the data written to the re-importable "Decision" sheet:
    by default ``problem`` itself; None leaves the sheet out (for example
    when ``problem`` holds derived value scores rather than raw data).
    ``front`` sheets (title, rows) come before the results, ``back`` sheets
    after Pareto; the first row of every sheet is the bold header.
    """
    # Imported here, not at module level: importing openpyxl is slow in the browser engine (ADR 0009).
    import openpyxl
    from openpyxl.styles import Font

    workbook = openpyxl.Workbook()
    workbook.remove(workbook.worksheets[0])  # drop the default empty sheet

    def add_sheets(sheets: Sequence[tuple[str, Sequence[Sequence[object]]]]) -> None:
        for title, rows in sheets:
            extra = workbook.create_sheet(title)
            for values in rows:
                extra.append(list(values))

    add_sheets(front[:1])  # the conclusion leads

    sheet = workbook.create_sheet("Results")
    header = ["Alternative"]
    for label, result in results:
        direction = "higher is better" if result.higher_is_better else "lower is better"
        header += [f"{label} score ({direction})", f"{label} rank"]
    sheet.append(header)
    for i, name in enumerate(problem.alternatives):
        row: list[object] = [name]
        for _, result in results:
            row += [float(result.scores[i]), int(result.ranks[i])]
        sheet.append(row)
    add_sheets(front[1:])

    for scope, intervals in (stability or {}).items():
        sheet = workbook.create_sheet(_STABILITY_SHEETS[StabilityScope(scope)])
        sheet.append(["Criterion", "Weight", "Lower", "Upper", "Lower (share)", "Upper (share)"])
        for interval in intervals:
            sheet.append(
                [
                    interval.criterion,
                    interval.weight,
                    interval.lower,
                    UNBOUNDED if math.isinf(interval.upper) else interval.upper,
                    interval.lower_normalized,
                    interval.upper_normalized,
                ]
            )

    if pareto is not None:
        sheet = workbook.create_sheet("Pareto")
        sheet.append(["Alternative", "Pareto optimal", "Dominates", "Dominated by"])
        for info in pareto:
            sheet.append(
                [
                    info.alternative,
                    "yes" if info.is_pareto_optimal else "no",
                    ", ".join(info.dominates),
                    ", ".join(info.dominated_by),
                ]
            )

    add_sheets(back)

    decision_data = problem if decision == "same" else decision
    if decision_data is not None:
        add_template_sheet(workbook, decision_data)

    for sheet in workbook.worksheets:
        for cell in sheet[1]:
            cell.font = Font(bold=True)
        for col_index, column in enumerate(sheet.columns, start=1):
            width = max((len(str(cell.value)) for cell in column if cell.value is not None), default=0)
            sheet.column_dimensions[column_letter(col_index)].width = min(max(width + 2, 10), 50)
        sheet.freeze_panes = "B2"

    workbook.save(target)
