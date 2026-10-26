"""Data quality report: what users should look at before trusting results (S2)."""

from __future__ import annotations

import numpy as np

from ..errors import Location, ValidationIssue
from .model import LinearValueFunction, Project

OUTLIER_IQR_FACTOR = 1.5
MIN_VALUES_FOR_OUTLIERS = 4
LOG_SUGGESTION_RATIO = 100.0


def quality_report(project: Project) -> list[ValidationIssue]:
    """Findings per criterion; none of them blocks the analysis."""
    findings: list[ValidationIssue] = []
    names = {a.id: a.name for a in project.alternatives}
    for criterion in project.criteria:
        where = Location("criterion", name=criterion.name)
        raw = {a.id: project.raw(criterion.id, a.id) for a in project.alternatives}
        present = {i: v for i, v in raw.items() if v is not None}
        missing = len(raw) - len(present)
        if missing:
            findings.append(ValidationIssue("quality_missing", {"count": missing, "policy": criterion.missing}, where))
        if len(present) >= 2 and len({str(v) for v in present.values()}) == 1:
            findings.append(ValidationIssue("quality_constant", location=where))
            continue

        if criterion.type == "numeric":
            numbers = {
                i: float(v) for i, v in present.items() if isinstance(v, (int, float)) and not isinstance(v, bool)
            }
            values = np.array(list(numbers.values()))
            if values.size >= MIN_VALUES_FOR_OUTLIERS:
                q1, q3 = np.percentile(values, [25, 75])
                spread = OUTLIER_IQR_FACTOR * (q3 - q1)
                outliers = [i for i, v in numbers.items() if v < q1 - spread or v > q3 + spread]
                if outliers and q3 > q1:
                    params = {"count": len(outliers), "alternatives": ", ".join(names[i] for i in outliers)}
                    findings.append(ValidationIssue("quality_outliers", params, where))
            if (
                values.size
                and isinstance(criterion.value_function, LinearValueFunction)
                and values.min() > 0
                and values.max() / values.min() > LOG_SUGGESTION_RATIO
            ):
                ratio = round(float(values.max() / values.min()))
                findings.append(ValidationIssue("quality_suggest_log", {"ratio": ratio}, where))
        elif criterion.type == "categorical" and criterion.categories and len(criterion.categories) > 1:
            if len({c.score for c in criterion.categories}) == 1:
                findings.append(ValidationIssue("quality_categories_equal", location=where))
    return findings
