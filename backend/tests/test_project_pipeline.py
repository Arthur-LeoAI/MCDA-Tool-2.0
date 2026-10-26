"""Project pipeline and migration, checked against the version-3 problem model."""

import math

import numpy as np
import pytest
from conftest import LEGACY_DIR

from mcda_core import (
    McdaError,
    Normalization,
    ProblemValidationError,
    StabilityScope,
    compromise_programming,
    rank_scores,
    topsis,
    weight_stability_intervals,
    weighted_sum,
)
from mcda_core.io import read_legacy_workbook
from mcda_core.project import migrate, pareto, parse_project, prepare, project_from_problem, run_method, stability
from mcda_core.project.model import CompromiseProgrammingMethod, LinearValueFunction, TopsisMethod, WeightedSumMethod


def v1_document(cars, normalization="min_max", bounds=None, methods=None) -> dict:
    document = {
        "alternatives": list(cars.alternatives),
        "criteria": [{"name": c.name, "direction": c.direction.value, "weight": c.weight} for c in cars.criteria],
        "matrix": cars.matrix.tolist(),
        "normalization": normalization,
    }
    if bounds is not None:
        document["bounds"] = bounds
    if methods is not None:
        document["methods"] = methods
    return document


def linear_bounds(project, index: int):
    vf = project.criteria[index].value_function
    assert isinstance(vf, LinearValueFunction)
    return vf.bounds


# --- Migration: same results as the old model ---------------------------------------


def test_v1_min_max_gives_identical_scores(cars):
    prepared = prepare(migrate(v1_document(cars)))
    old, new = weighted_sum(cars), run_method(prepared, WeightedSumMethod())
    np.testing.assert_allclose(new.scores, old.scores, atol=1e-12)
    assert new.ranks.tolist() == old.ranks.tolist()


def test_v1_fixed_range_gives_identical_scores(cars):
    project = migrate(v1_document(cars, "fixed_range", [0, 200]))
    assert linear_bounds(project, 0) == (0.0, 200.0)
    old = weighted_sum(cars, Normalization.FIXED_RANGE, (0, 200))
    np.testing.assert_allclose(run_method(prepare(project), WeightedSumMethod()).scores, old.scores, atol=1e-12)


def test_v1_none_keeps_the_ranking():
    document = {
        "alternatives": ["A", "B", "C"],
        "criteria": [{"name": "x", "weight": 0.7}, {"name": "y", "weight": 0.3}],
        "matrix": [[80, 10], [20, 95], [55, 60]],
        "normalization": "none",
    }
    project = migrate(document)
    assert linear_bounds(project, 0) == (0.0, 95.0)  # one range for all criteria
    raw_scores = np.array(document["matrix"], dtype=float) @ np.array([0.7, 0.3])  # old "none": raw values
    new = run_method(prepare(project), WeightedSumMethod())
    assert new.ranks.tolist() == rank_scores(raw_scores).tolist()


def test_v1_methods_are_mapped(cars):
    methods = [
        {"method": "topsis", "normalization": "vector"},
        {"method": "topsis", "normalization": "fixed_range"},
        {"method": "compromise_programming", "p": "inf", "normalization": "min_max"},
    ]
    project = migrate(v1_document(cars, methods=methods))
    assert project.analysis.methods == [
        TopsisMethod(basis="raw"),
        TopsisMethod(basis="values", ideal="fixed"),
        CompromiseProgrammingMethod(p="inf", ideal="data"),
    ]


def test_v1_draft_with_gaps_is_kept_for_validation():
    project = migrate({"alternatives": ["A", ""], "criteria": [{"name": "x", "weight": 1}], "matrix": [[1], [None]]})
    assert project.raw("c1", "a2") is None
    with pytest.raises(ProblemValidationError):
        prepare(
            project.model_copy(update={"criteria": [project.criteria[0].model_copy(update={"missing": "require"})]})
        )


def test_current_projects_pass_through_and_newer_ones_are_rejected(cars):
    project = migrate(v1_document(cars))
    assert migrate(project.model_dump(mode="json")) == project
    with pytest.raises(McdaError) as excinfo:
        migrate({"format": "mcda-project", "version": 99})
    assert (excinfo.value.code, excinfo.value.params) == (
        "project_version_unsupported",
        {"version": 99, "supported": 2},
    )


@pytest.mark.parametrize("document", [[], {"something": 1}, {"format": "mcda-project", "version": "2"}])
def test_unreadable_documents(document):
    with pytest.raises(McdaError, match="not a project"):
        migrate(document)


# --- Methods on value scores ----------------------------------------------------------


def test_methods_match_the_old_model_on_linear_data(cars):
    prepared = prepare(project_from_problem(cars))
    pairs = [
        (TopsisMethod(basis="raw"), topsis(cars)),
        (TopsisMethod(ideal="data"), topsis(cars, Normalization.MIN_MAX)),
        (CompromiseProgrammingMethod(p=2), compromise_programming(cars, p=2)),
        (CompromiseProgrammingMethod(p="inf"), compromise_programming(cars, p=math.inf)),
    ]
    for spec, old in pairs:
        np.testing.assert_allclose(run_method(prepared, spec).scores, old.scores, atol=1e-12)


def test_pareto_and_stability_on_value_scores(cars):
    prepared = prepare(project_from_problem(cars))
    assert {i.alternative for i in pareto(prepared) if i.is_pareto_optimal} == {"B", "C"}
    for new, old in zip(
        stability(prepared, StabilityScope.TOP1), weight_stability_intervals(cars, StabilityScope.TOP1), strict=True
    ):
        assert (new.lower, new.upper) == pytest.approx((old.lower, old.upper))


@pytest.mark.parametrize("path", sorted(LEGACY_DIR.glob("*.xlsx")), ids=lambda p: p.stem.removeprefix("MCDA ELT V7_"))
@pytest.mark.parametrize("scope", list(StabilityScope))
def test_legacy_reference_via_projects(path, scope):
    """Legacy data as a project (linear, fixed [0, 100]) reproduces the Excel stability intervals."""
    workbook = read_legacy_workbook(path)
    prepared = prepare(project_from_problem(workbook.problem, bounds=(0.0, 100.0)))
    reference = workbook.intervals[(scope.value, False)]
    checked = 0
    for interval in stability(prepared, scope):
        if interval.weight == 0:
            continue  # Excel does not analyse zero-weight criteria
        expected = reference[interval.criterion]
        assert interval.lower == pytest.approx(expected.lower, rel=1e-9, abs=1e-12)
        if math.isinf(expected.upper):
            assert math.isinf(interval.upper)
        else:
            assert interval.upper == pytest.approx(expected.upper, rel=1e-9)
        checked += 1
    assert checked == int((workbook.problem.weights > 0).sum())


# --- Data handling ----------------------------------------------------------------------


def mixed_project(missing_policy: str) -> dict:
    return {
        "format": "mcda-project",
        "version": 2,
        "alternatives": [{"id": f"a{i}", "name": n} for i, n in enumerate("ABCD")],
        "criteria": [
            {"id": "x", "name": "x", "value_function": {"kind": "linear"}, "missing": missing_policy},
            {
                "id": "lvl",
                "name": "level",
                "type": "ordinal",
                "categories": [
                    {"label": "low", "score": 0},
                    {"label": "mid", "score": 0.5},
                    {"label": "high", "score": 1},
                ],
            },
            {"id": "ok", "name": "ok", "type": "boolean", "direction": "cost"},
        ],
        "data": {
            "x": {"a0": 0, "a1": 10, "a2": None, "a3": 5},
            "lvl": {"a0": "low", "a1": "mid", "a2": "high", "a3": "high"},
            "ok": {"a0": True, "a1": False, "a2": False, "a3": True},
        },
        "weighting": {"within": {"_root": {"weights": {"x": 1, "lvl": 1, "ok": 1}}}},
    }


def test_categories_booleans_and_worst_case_missing():
    prepared = prepare(parse_project(mixed_project("worst")))
    np.testing.assert_allclose(prepared.values, [[0, 0, 0], [1, 0.5, 1], [0, 1, 1], [0.5, 1, 0]])
    assert [(i.alternative_id, i.criterion_id) for i in prepared.imputed] == [("a2", "x")]


def test_mean_imputation_uses_value_scores():
    prepared = prepare(parse_project(mixed_project("mean")))
    assert prepared.values[2, 0] == pytest.approx(0.5)  # mean of 0, 1, 0.5


def test_exclusion_and_data_range_of_eligible_alternatives():
    prepared = prepare(parse_project(mixed_project("exclude")))
    assert prepared.eligible == ("a0", "a1", "a3")
    (exclusion,) = prepared.excluded
    assert exclusion.alternative_id == "a2"
    assert exclusion.reasons[0].code == "missing_value"
    np.testing.assert_allclose(prepared.values[:, 0], [0, 1, 0.5])


def test_too_few_eligible_alternatives():
    document = mixed_project("exclude")
    document["data"]["x"].update({"a0": None, "a1": None})
    with pytest.raises(McdaError) as excinfo:
        prepare(parse_project(document))
    assert excinfo.value.code == "too_few_eligible"


def test_classic_topsis_needs_linear_numeric_criteria():
    with pytest.raises(McdaError) as excinfo:
        run_method(prepare(parse_project(mixed_project("worst"))), TopsisMethod(basis="raw"))
    assert excinfo.value.code == "raw_basis_needs_linear_numeric"
