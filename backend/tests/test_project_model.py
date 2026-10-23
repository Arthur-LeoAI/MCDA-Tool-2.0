"""Project model v2: structure, validation and value functions."""

import math

import numpy as np
import pytest

from mcda_core import Direction, Location, ProblemValidationError
from mcda_core.project import Project, parse_project, project_issues
from mcda_core.project.model import (
    LinearValueFunction,
    LogValueFunction,
    PiecewiseValueFunction,
    TargetValueFunction,
)
from mcda_core.project.values import value_scores


def base(**overrides) -> dict:
    """A small valid project document; overrides replace top-level fields."""
    document = {
        "format": "mcda-project",
        "version": 2,
        "alternatives": [{"id": "a1", "name": "A"}, {"id": "a2", "name": "B"}],
        "criteria": [
            {"id": "price", "name": "Price", "value_function": {"kind": "linear", "direction": "cost"}},
            {
                "id": "level",
                "name": "Support",
                "type": "ordinal",
                "categories": [{"label": "low", "score": 0}, {"label": "high", "score": 1}],
            },
            {"id": "eco", "name": "Eco label", "type": "boolean", "direction": "benefit"},
        ],
        "data": {"price": {"a1": 10, "a2": 20}, "level": {"a1": "high", "a2": "low"}, "eco": {"a1": True, "a2": False}},
        "weighting": {"within": {"_root": {"weights": {"price": 2, "level": 1, "eco": 1}}}},
    }
    document.update(overrides)
    return document


def issues_of(document: dict) -> set[tuple[str, Location | None]]:
    return {(i.code, i.location) for i in project_issues(parse_project(document))}


def test_valid_project_has_no_issues():
    assert issues_of(base()) == set()


def test_defaults_are_filled_in():
    project = parse_project(base())
    assert project.analysis.methods[0].method == "weighted_sum"
    assert project.criteria[0].missing == "worst"
    assert project.weighting.within["_root"].method == "direct"


def test_structure_errors_are_coded_issues():
    with pytest.raises(ProblemValidationError) as excinfo:
        parse_project(base(version=2, unknown_field=1, alternatives=[{"id": "bad id!", "name": "A"}]))
    refs = {i.location.ref for i in excinfo.value.issues if i.location}
    assert {"unknown_field", "alternatives.0.id"} <= refs
    assert all(i.code == "request_invalid" for i in excinfo.value.issues)


def test_raw_values_keep_their_type():
    project = parse_project(base())
    assert project.raw("eco", "a1") is True
    assert project.raw("price", "a1") == 10.0
    assert project.raw("level", "a1") == "high"
    assert project.raw("price", "nobody") is None


def test_names_ids_and_references():
    document = base(
        alternatives=[{"id": "a1", "name": "A"}, {"id": "a1", "name": "A"}, {"id": "a3", "name": " "}],
    )
    document["criteria"][0]["group_id"] = "missing-group"
    found = issues_of(document)
    assert ("duplicate_id", Location("alternative", name="A", index=2)) in found
    assert ("duplicate_name", Location("alternative", name="A")) in found
    assert ("empty_name", Location("alternative", index=3)) in found
    assert ("unknown_reference", Location("criterion", name="Price")) in found


def test_criterion_settings_must_fit_the_type():
    document = base()
    document["criteria"][0]["value_function"] = None
    document["criteria"][1]["categories"] = [{"label": "x", "score": 2}, {"label": "x", "score": 0}]
    document["criteria"][2]["direction"] = None
    codes = {code for code, _ in issues_of(document)}
    assert {"value_function_missing", "categories_invalid", "direction_missing"} <= codes


@pytest.mark.parametrize(
    ("value_function", "reason"),
    [
        ({"kind": "linear", "bounds": [5, 5]}, "bounds_order"),
        ({"kind": "log", "bounds": [-1, 5]}, "log_bounds_negative"),
        ({"kind": "target", "lower": 0, "ideal_low": 5, "ideal_high": 4, "upper": 9}, "target_order"),
        ({"kind": "piecewise", "points": [[1, 0], [1, 1]]}, "points_order"),
        ({"kind": "piecewise", "points": [[1, 0], [2, 1.5]]}, "points_range"),
    ],
)
def test_invalid_value_functions(value_function, reason):
    document = base()
    document["criteria"][0]["value_function"] = value_function
    (issue,) = project_issues(parse_project(document))
    assert (issue.code, issue.params) == ("value_function_invalid", {"reason": reason})


def test_data_values_must_fit_the_type():
    document = base()
    document["data"] = {
        "price": {"a1": "ten", "a2": None},
        "level": {"a1": "medium", "a2": "low"},
        "eco": {"a1": "yes", "a2": False},
        "ghost": {"a1": 1},
    }
    document["criteria"][0]["missing"] = "require"
    found = issues_of(document)
    assert ("value_not_number", Location("value", alternative="A", criterion="Price")) in found
    assert ("missing_value", Location("value", alternative="B", criterion="Price")) in found
    assert ("unknown_category", Location("value", alternative="A", criterion="Support")) in found
    assert ("value_not_boolean", Location("value", alternative="A", criterion="Eco label")) in found
    assert ("unknown_reference", Location("field", ref="data.ghost")) in found


def test_log_needs_non_negative_values():
    document = base()
    document["criteria"][0]["value_function"] = {"kind": "log"}
    document["data"]["price"]["a1"] = -3
    assert ("log_negative_value", Location("value", alternative="A", criterion="Price")) in issues_of(document)


def test_constraints_and_weighting_references():
    document = base(
        constraints=[
            {"id": "k1", "criterion_id": "level", "op": ">=", "value": 1},
            {"id": "k1", "criterion_id": "price", "op": "between", "low": 5, "high": 1},
            {"id": "k3", "criterion_id": "nope", "op": "present"},
        ],
        weighting={"within": {"_root": {"weights": {"price": -1, "ghost": 1}}, "g9": {}}},
    )
    found = issues_of(document)
    assert ("constraint_criterion_type", Location("constraint", ref="k1")) in found
    assert ("duplicate_id", Location("constraint", ref="k1")) in found
    assert ("constraint_invalid", Location("constraint", ref="k1")) in found
    assert ("unknown_reference", Location("constraint", ref="k3")) in found
    assert ("unknown_reference", Location("field", ref="weighting.within.g9")) in found
    assert ("unknown_reference", Location("field", ref="weighting.within._root")) in found
    assert ("weight_negative", Location("field", ref="weighting.within._root.weights.price")) in found


def test_project_round_trips_through_json():
    project = parse_project(base())
    again = Project.model_validate_json(project.model_dump_json())
    assert again == project


# --- Value functions ------------------------------------------------------------------


def scores(vf, values, data_range=None):
    return value_scores(vf, np.array(values, dtype=float), data_range).tolist()


def test_linear_data_and_fixed_bounds():
    assert scores(LinearValueFunction(), [10, 15, 20], (10, 20)) == [0, 0.5, 1]
    assert scores(LinearValueFunction(direction=Direction.COST), [10, 15, 20], (10, 20)) == [1, 0.5, 0]
    assert scores(LinearValueFunction(bounds=(0, 100)), [-5, 50, 120]) == [0, 0.5, 1]  # clipped


def test_constant_criterion_scores_one():
    assert scores(LinearValueFunction(), [3, 3], (3, 3)) == [1, 1]


def test_log_has_diminishing_returns():
    low, mid, high = scores(LogValueFunction(), [0, 9, 99], (0, 99))
    assert (low, high) == (0, 1)
    assert mid == pytest.approx(math.log(10) / math.log(100))


def test_target_trapezoid_and_steps():
    vf = TargetValueFunction(lower=0, ideal_low=4, ideal_high=6, upper=10)
    assert scores(vf, [-1, 0, 2, 4, 5, 6, 8, 10, 11]) == [0, 0, 0.5, 1, 1, 1, 0.5, 0, 0]
    step = TargetValueFunction(lower=0, ideal_low=0, ideal_high=5, upper=10)
    assert scores(step, [-0.1, 0, 5]) == [0, 1, 1]


def test_piecewise_threshold():
    vf = PiecewiseValueFunction(points=[(20, 0), (40, 1)])
    assert scores(vf, [10, 20, 30, 40, 50]) == [0, 0, 0.5, 1, 1]


def test_missing_stays_missing():
    assert math.isnan(scores(LinearValueFunction(), [math.nan, 1], (0, 2))[0])
