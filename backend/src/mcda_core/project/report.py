"""Report v2 sheets for projects (S6, PRD F6.2): conclusion, data handling, weights, robustness.

Each function returns rows (header first) for ``io.report.write_report``.
Labels are English like the rest of the report; the conclusion text comes
from the client in the interface language.
"""

from __future__ import annotations

from collections.abc import Sequence

from ..errors import render
from .conclusions import Conclusion
from .model import (
    ROOT_LEVEL,
    BetweenConstraint,
    CompareConstraint,
    InConstraint,
    LinearValueFunction,
    LogValueFunction,
    PiecewiseValueFunction,
    Project,
    TargetValueFunction,
)
from .pipeline import PreparedProject
from .robustness import Robustness
from .weighting import Weights

Rows = list[list[object]]


def _names(project: Project) -> dict[str, str]:
    return (
        {a.id: a.name for a in project.alternatives}
        | {c.id: c.name for c in project.criteria}
        | {g.id: g.name for g in project.groups}
    )


def conclusion_rows(
    project: Project, conclusion: Conclusion, text: Sequence[str], robustness: Robustness | None
) -> Rows:
    names = _names(project)
    rows: Rows = [["Conclusion"], *([line] for line in text)]
    if text:
        rows.append([])
    rows += [
        ["Top choice", names[conclusion.winner.alternative_id], round(conclusion.winner.score, 2)],
        ["Runner-up", names[conclusion.runner_up.alternative_id], round(conclusion.runner_up.score, 2)],
        ["Score gap (points of 100)", round(conclusion.score_gap, 2)],
    ]
    if robustness is not None:
        confidence = robustness.confidence
        rows.append(["Confidence", confidence.level, f"first in {confidence.p_best:.1%} of samples"])
    for label, shares in (
        ("Largest contributions", conclusion.top_contributions),
        ("Advantages over runner-up", conclusion.advantages),
        ("Disadvantages vs runner-up", conclusion.disadvantages),
    ):
        rows.append([label, *(f"{names[s.criterion_id]} ({s.points:+.1f})" for s in shares)])
    for caveat in conclusion.caveats:
        rows.append(["Note", render(caveat.code, caveat.params)])
    return rows


def describe_value_function(vf: object) -> str:
    if isinstance(vf, (LinearValueFunction, LogValueFunction)):
        bounds = "range of the data" if vf.bounds == "data" else f"[{vf.bounds[0]}, {vf.bounds[1]}]"
        return f"{vf.kind}, {vf.direction.value}, {bounds}"
    if isinstance(vf, TargetValueFunction):
        return f"target: 0 at {vf.lower}, 1 from {vf.ideal_low} to {vf.ideal_high}, 0 at {vf.upper}"
    if isinstance(vf, PiecewiseValueFunction):
        return "piecewise: " + ", ".join(f"({x}, {v})" for x, v in vf.points)
    return ""


def data_handling_rows(prepared: PreparedProject) -> Rows:
    project = prepared.project
    names = _names(project)
    rows: Rows = [["Criterion", "Group", "Type", "Unit", "Scoring", "Missing values"]]
    for c in project.criteria:
        if c.type == "numeric":
            scoring = describe_value_function(c.value_function)
        elif c.type == "boolean":
            scoring = f"yes/no, {c.direction.value if c.direction else ''}"
        else:
            scoring = ", ".join(f"{cat.label} = {cat.score:g}" for cat in c.categories or [])
        group = names.get(c.group_id, "") if c.group_id else ""
        rows.append([c.name, group, c.type, c.unit or "", scoring, c.missing])

    rows += [[], ["Condition", "Criterion", "Rule", "Missing values pass"]]
    for k in project.constraints:
        if isinstance(k, CompareConstraint):
            rule = f"{k.op} {k.value:g}"
        elif isinstance(k, BetweenConstraint):
            rule = f"between {k.low:g} and {k.high:g}"
        elif isinstance(k, InConstraint):
            rule = "one of: " + ", ".join(k.labels)
        else:
            rule = "must not be missing"
        rows.append([k.id, names.get(k.criterion_id, k.criterion_id), rule, "yes" if k.allow_missing else "no"])

    rows += [[], ["Excluded alternative", "Reasons"]]
    for e in prepared.excluded:
        rows.append([names[e.alternative_id], "; ".join(render(r.code, r.params) for r in e.reasons)])

    rows += [[], ["Filled-in value: alternative", "Criterion", "Policy"]]
    for i in prepared.imputed:
        rows.append([names[i.alternative_id], names[i.criterion_id], i.policy])
    return rows


def weights_rows(project: Project, weights: Weights) -> Rows:
    names = _names(project)
    rows: Rows = [["Level", "Method", "Item", "Local weight", "Overall weight", "Note"]]
    settings = project.weighting
    for level in weights.levels:
        key = level.key.removeprefix("within.")
        if level.key == "groups":
            title, stored = "Between groups", settings.groups
        else:
            title = "Ungrouped" if key == ROOT_LEVEL and project.groups else names.get(key, "Criteria")
            stored = settings.within.get(key)
        method = level.method
        if method == "rank" and stored is not None:
            method = f"rank ({'ROC' if stored.formula == 'roc' else 'rank sum'})"
        note = ""
        if level.ahp is not None:
            verdict = "consistent" if level.ahp.consistent else "inconsistent"
            note = f"CR = {level.ahp.cr:.3f} ({verdict})"
        for k, (item, local) in enumerate(zip(level.items, level.weights, strict=True)):
            overall = weights.global_weights.get(item, "") if level.key != "groups" else ""
            label = "Ungrouped" if item == ROOT_LEVEL else names.get(item, item)
            rows.append(
                [title if k == 0 else "", method if k == 0 else "", label, local, overall, note if k == 0 else ""]
            )
    return rows


def robustness_rows(project: Project, robustness: Robustness) -> Rows:
    names = _names(project)
    s = robustness.settings
    m = len(robustness.alternative_ids)
    spread = f", spread {s.spread:g}" if s.mode == "around" else ""
    rows: Rows = [
        ["Sampling", f"{s.mode}{spread}, {s.samples} samples, seed {s.seed}"],
        [],
        ["Alternative", "P(first)", "Mean rank", *(f"P(rank {r})" for r in range(1, m + 1))],
    ]
    for k, alternative_id in enumerate(robustness.alternative_ids):
        rows.append(
            [
                names[alternative_id],
                float(robustness.p_best[k]),
                float(robustness.mean_rank[k]),
                *(float(p) for p in robustness.rank_probabilities[k]),
            ]
        )
    return rows
