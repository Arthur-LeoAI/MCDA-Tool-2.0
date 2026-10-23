"""Check the new core against results stored in the legacy V7 Excel workbooks.

Those workbooks hold values already on a 0-100 benefit scale, rank the
alternatives with a plain weighted sum and list the weight stability
intervals Excel computed. Excel writes 0/0 for criteria with zero weight
(they are not analysed there), so only weighted criteria are compared.
"""

import itertools
import math

import pytest
from conftest import LEGACY_DIR

from mcda_core import Normalization, StabilityScope, weight_stability_intervals, weighted_sum
from mcda_core.io import read_legacy_workbook
from mcda_core.ranking import scores_tied

WORKBOOKS = sorted(LEGACY_DIR.glob("*.xlsx"))


def test_reference_workbooks_present():
    assert len(WORKBOOKS) == 10


@pytest.fixture(params=WORKBOOKS, ids=lambda p: p.stem.removeprefix("MCDA ELT V7_"))
def workbook(request):
    return read_legacy_workbook(request.param)


def test_reads_layout(workbook):
    problem = workbook.problem
    assert problem.matrix.shape == (7, 34)
    assert len(workbook.reference_order) == 7
    assert sorted(workbook.reference_order) == sorted(problem.alternatives)
    assert problem.weights.sum() == pytest.approx(1.0)


def test_weighted_sum_matches_excel_order(workbook):
    result = weighted_sum(workbook.problem, Normalization.NONE)
    scores = [result.score_of(name) for name in workbook.reference_order]
    for better, worse in itertools.pairwise(scores):
        assert better > worse or scores_tied(better, worse)
    assert result.rank_of(workbook.reference_order[0]) == 1


@pytest.mark.parametrize("scope", list(StabilityScope))
def test_stability_intervals_match_excel(workbook, scope):
    computed = weight_stability_intervals(workbook.problem, scope, Normalization.NONE)
    raw = workbook.intervals[(scope.value, False)]
    normalised = workbook.intervals[(scope.value, True)]
    compared = 0
    for interval in computed:
        if interval.weight == 0:
            continue
        expected, expected_norm = raw[interval.criterion], normalised[interval.criterion]
        assert_close(interval.lower, expected.lower)
        assert_close(interval.upper, expected.upper)
        assert_close(interval.lower_normalized, expected_norm.lower)
        assert_close(interval.upper_normalized, expected_norm.upper)
        compared += 1
    assert compared == int((workbook.problem.weights > 0).sum())


def assert_close(actual, expected):
    if math.isinf(expected):
        assert math.isinf(actual)
    else:
        assert actual == pytest.approx(expected, rel=1e-6, abs=1e-9)
