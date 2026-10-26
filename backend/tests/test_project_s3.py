"""S3: hard constraints and value curves."""

import pytest

from mcda_core import Location, McdaError
from mcda_core.project import parse_project, prepare
from mcda_core.project.curve import value_curve


def products(constraints=(), vf=None, missing="worst") -> dict:
    """Four products; margin in %, compliance as levels."""
    return {
        "format": "mcda-project",
        "version": 2,
        "alternatives": [{"id": f"a{i}", "name": n} for i, n in enumerate(["Mat", "Box", "Lamp", "Brush"])],
        "criteria": [
            {
                "id": "margin",
                "name": "Margin",
                "unit": "%",
                "missing": missing,
                "value_function": vf or {"kind": "linear", "direction": "benefit"},
            },
            {
                "id": "compliance",
                "name": "Compliance",
                "type": "ordinal",
                "categories": [
                    {"label": "certified", "score": 0},
                    {"label": "some", "score": 0.5},
                    {"label": "none", "score": 1},
                ],
            },
        ],
        "data": {
            "margin": {"a0": 32, "a1": 18, "a2": 41, "a3": None},
            "compliance": {"a0": "none", "a1": "some", "a2": "certified", "a3": "none"},
        },
        "constraints": list(constraints),
        "weighting": {"within": {"_root": {"weights": {"margin": 1, "compliance": 1}}}},
    }


def excluded(document) -> dict[str, list[tuple[str, dict]]]:
    prepared = prepare(parse_project(document))
    return {e.alternative_id: [(r.code, dict(r.params)) for r in e.reasons] for e in prepared.excluded}


def test_compare_constraint_with_missing_value():
    result = excluded(products([{"id": "k1", "criterion_id": "margin", "op": ">=", "value": 20}]))
    assert result == {
        "a1": [
            (
                "constraint_failed_compare",
                {"criterion": "Margin", "unit": "%", "op": ">=", "value": 20.0, "actual": 18.0},
            )
        ],
        "a3": [("constraint_missing", {"criterion": "Margin", "unit": "%"})],
    }


def test_allow_missing_lets_gaps_pass():
    constraint = {"id": "k1", "criterion_id": "margin", "op": ">=", "value": 20, "allow_missing": True}
    assert set(excluded(products([constraint]))) == {"a1"}


@pytest.mark.parametrize(
    ("constraint", "expected"),
    [
        ({"op": "between", "low": 20, "high": 40}, {"a1", "a2"}),
        ({"op": "<", "value": 41}, {"a2"}),
        ({"op": ">", "value": 18, "allow_missing": True}, {"a1"}),
    ],
)
def test_numeric_conditions(constraint, expected):
    document = products([{"id": "k", "criterion_id": "margin", "allow_missing": True, **constraint}])
    assert set(excluded(document)) == expected


def test_in_constraint_and_several_reasons():
    document = products(
        [
            {"id": "k1", "criterion_id": "compliance", "op": "in", "labels": ["none", "some"]},
            {"id": "k2", "criterion_id": "margin", "op": "<=", "value": 40, "allow_missing": True},
        ]
    )
    result = excluded(document)
    assert [code for code, _ in result["a2"]] == ["constraint_failed_in", "constraint_failed_compare"]
    assert result["a2"][0][1]["labels"] == "none, some"


def test_constraint_and_missing_policy_reasons_are_merged():
    document = products(
        [{"id": "k1", "criterion_id": "compliance", "op": "in", "labels": ["none", "certified"]}], missing="exclude"
    )
    result = excluded(document)
    assert [code for code, _ in result["a3"]] == ["missing_value"]  # Brush: compliance ok, margin missing
    assert [code for code, _ in result["a1"]] == ["constraint_failed_in"]


def test_data_range_uses_eligible_alternatives_only():
    # Without Box (18) the margin range is 32..41, so Mat scores (32-32)/(41-32) = 0.
    prepared = prepare(
        parse_project(
            products([{"id": "k1", "criterion_id": "margin", "op": ">=", "value": 20, "allow_missing": True}])
        )
    )
    assert prepared.eligible == ("a0", "a2", "a3")
    assert prepared.values[:, 0].tolist() == [0.0, 1.0, 0.0]  # Brush missing -> worst


def test_too_many_exclusions():
    with pytest.raises(McdaError) as excinfo:
        prepare(parse_project(products([{"id": "k1", "criterion_id": "margin", "op": ">", "value": 100}])))
    assert excinfo.value.code == "too_few_eligible"


def test_exclusion_location_points_at_the_constraint():
    prepared = prepare(parse_project(products([{"id": "k9", "criterion_id": "margin", "op": ">=", "value": 20}])))
    assert prepared.excluded[0].reasons[0].location == Location("constraint", ref="k9")


# --- Value curves ------------------------------------------------------------------------


def test_linear_curve_and_positions():
    curve = value_curve(parse_project(products()), "margin")
    assert len(curve.points) == 101
    assert curve.low == pytest.approx(18 - 23 * 0.05) and curve.high == pytest.approx(41 + 23 * 0.05)
    positions = {p.alternative_id: (p.x, p.value) for p in curve.alternatives}
    assert positions == {"a0": (32.0, pytest.approx(14 / 23)), "a1": (18.0, 0.0), "a2": (41.0, 1.0)}
    assert curve.points[0][1] == 0.0 and curve.points[-1][1] == 1.0  # clipped outside the data range


def test_curve_marks_excluded_alternatives_and_shows_function_parameters():
    vf = {"kind": "target", "lower": 10, "ideal_low": 25, "ideal_high": 35, "upper": 60}
    document = products([{"id": "k1", "criterion_id": "margin", "op": ">=", "value": 20, "allow_missing": True}], vf)
    curve = value_curve(parse_project(document), "margin")
    assert curve.low < 10 and curve.high > 60  # the whole trapezoid is in view
    assert {p.alternative_id: p.value for p in curve.alternatives}["a1"] is None
    peak = [v for x, v in curve.points if 25 <= x <= 35]
    assert peak and all(v == 1.0 for v in peak)


def test_curve_needs_a_numeric_criterion():
    with pytest.raises(McdaError, match="numeric"):
        value_curve(parse_project(products()), "compliance")


def test_curve_api(client):
    response = client.post("/api/v1/projects/curve", json={"project": products(), "criterion_id": "margin"})
    body = response.json()
    assert response.status_code == 200
    assert len(body["points"]) == 101
    assert {a["id"] for a in body["alternatives"]} == {"a0", "a1", "a2"}
