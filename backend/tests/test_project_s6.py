"""S6: conclusion points and the report v2 sheets."""

import io

import openpyxl
import pytest

from mcda_core.project import parse_project, prepare, run_method
from mcda_core.project.conclusions import conclude
from mcda_core.project.model import TopsisMethod, WeightedSumMethod


def project(data: dict[str, list], weights: dict[str, float], **extra) -> dict:
    """Alternatives A, B, ...; benefit criteria on a fixed [0, 1] range, so value = raw value."""
    m = len(next(iter(data.values())))
    ids = [chr(ord("A") + i) for i in range(m)]
    return {
        "format": "mcda-project",
        "version": 2,
        "alternatives": [{"id": i, "name": f"Alt {i}"} for i in ids],
        "criteria": [
            {"id": c, "name": c.upper(), "value_function": {"kind": "linear", "direction": "benefit", "bounds": [0, 1]}}
            for c in data
        ],
        "data": {c: dict(zip(ids, column, strict=True)) for c, column in data.items()},
        "weighting": {"within": {"_root": {"weights": weights}}},
        **extra,
    }


def conclusion_of(document: dict, others=()):
    prepared = prepare(parse_project(document))
    weighted = run_method(prepared, WeightedSumMethod())
    return conclude(prepared, weighted, [(label, run_method(prepared, spec)) for label, spec in others])


DATA = {"q": [0.9, 0.6, 0.1], "c": [0.2, 0.8, 0.3], "r": [0.5, 0.5, 0.5]}
WEIGHTS = {"q": 0.5, "c": 0.3, "r": 0.2}


def test_winner_runner_up_and_gap():
    c = conclusion_of(project(DATA, WEIGHTS))
    # A: 45 + 6 + 10 = 61; B: 30 + 24 + 10 = 64; C: 5 + 9 + 10 = 24
    assert (c.winner.alternative_id, c.runner_up.alternative_id) == ("B", "A")
    assert c.winner.score == pytest.approx(64)
    assert c.score_gap == pytest.approx(3)
    assert c.tied == ()


def test_contributions_advantages_and_disadvantages():
    c = conclusion_of(project(DATA, WEIGHTS))
    assert [(s.criterion_id, round(s.points, 6)) for s in c.top_contributions] == [("q", 30), ("c", 24), ("r", 10)]
    assert [(s.criterion_id, round(s.points, 6)) for s in c.advantages] == [("c", 18)]
    assert [(s.criterion_id, round(s.points, 6)) for s in c.disadvantages] == [("q", -15)]


def test_constant_criterion_caveat_and_no_disadvantage():
    c = conclusion_of(project({"q": [0.9, 0.1], "r": [0.5, 0.5]}, {"q": 1, "r": 1}))
    assert c.disadvantages == ()
    assert [(k.code, k.params) for k in c.caveats] == [("caveat_constant", {"criterion": "R"})]


def test_tied_first():
    c = conclusion_of(project({"q": [0.8, 0.8, 0.1]}, {"q": 1}))
    assert c.tied == ("B",)
    assert c.score_gap == 0
    assert c.caveats[0].code == "caveat_tied_first"
    assert c.caveats[0].params == {"alternatives": "Alt A, Alt B"}


def test_excluded_and_imputed_caveats():
    document = project({"q": [0.9, 0.6, 0.1, None], "c": [0.2, 0.8, 0.3, 0.4]}, {"q": 1, "c": 1})
    document["constraints"] = [{"id": "k1", "criterion_id": "c", "op": ">=", "value": 0.25}]
    codes = {k.code: k.params for k in conclusion_of(document).caveats}
    assert codes["caveat_excluded"] == {"count": 1}  # A fails c >= 0.25
    assert codes["caveat_imputed"] == {"count": 1, "criteria": "Q"}


def test_inconsistent_ahp_caveat():
    comparisons = {"q|c": 9, "c|r": 9, "q|r": 1 / 9}
    document = project(DATA, WEIGHTS)
    document["weighting"] = {"within": {"_root": {"method": "ahp", "comparisons": comparisons}}}
    caveat = next(k for k in conclusion_of(document).caveats if k.code.startswith("caveat_ahp"))
    assert caveat.code == "caveat_ahp_inconsistent_criteria"
    assert caveat.params["cr"] > 0.1


def test_methods_disagree():
    # Weighted sum prefers the balanced C; TOPSIS on value scores prefers A or B.
    data = {"x": [1.0, 0.0, 0.55], "y": [0.0, 1.0, 0.55]}
    c = conclusion_of(project(data, {"x": 1, "y": 1}), [("TOPSIS", TopsisMethod())])
    assert c.winner.alternative_id == "C"
    disagree = [k for k in c.caveats if k.code == "caveat_methods_disagree"]
    assert [k.params for k in disagree] in ([], [{"methods": "TOPSIS"}])


def test_evaluate_returns_conclusion(client):
    body = client.post("/api/v1/projects/evaluate", json=project(DATA, WEIGHTS)).json()
    conclusion = body["conclusion"]
    assert conclusion["winner"] == {"id": "B", "score": pytest.approx(64)}
    assert conclusion["advantages"] == [{"criterion_id": "c", "points": pytest.approx(18)}]
    assert [k["code"] for k in conclusion["caveats"]] == ["caveat_constant"]  # r is 0.5 everywhere


def test_report_v2_sheets(client):
    document = project(DATA, WEIGHTS)
    document["constraints"] = [{"id": "k1", "criterion_id": "q", "op": ">=", "value": 0.05}]
    text = ["Recommended: Alt B.", "Main reason: C."]
    response = client.post("/api/v1/projects/report", json={"project": document, "conclusion": text})
    assert response.status_code == 200
    workbook = openpyxl.load_workbook(io.BytesIO(response.content))
    conclusion = [row for row in workbook["Conclusion"].iter_rows(values_only=True)]
    assert conclusion[1][0] == "Recommended: Alt B."
    assert ("Top choice", "Alt B", 64) in [row[:3] for row in conclusion]  # rows are padded to the sheet width
    assert any(row[0] == "Confidence" for row in conclusion)

    handling = [row for row in workbook["Data handling"].iter_rows(values_only=True)]
    assert handling[1][:5] == ("Q", None, "numeric", None, "linear, benefit, [0.0, 1.0]")
    assert ("k1", "Q", ">= 0.05", "no") in [row[:4] for row in handling]

    weights = [row for row in workbook["Weights"].iter_rows(values_only=True)]
    assert weights[1][:4] == ("Criteria", "direct", "Q", 0.5)

    robustness = [row for row in workbook["Robustness"].iter_rows(values_only=True)]
    assert robustness[0][0] == "Sampling"
    assert robustness[2][:3] == ("Alternative", "P(first)", "Mean rank")
