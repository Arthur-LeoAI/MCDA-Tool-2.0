"""Expected values below are worked out by hand from the method definitions."""

import math

import numpy as np
import pytest

from mcda_core import (
    Criterion,
    DecisionProblem,
    Direction,
    Normalization,
    compromise_programming,
    topsis,
    weighted_sum,
)

B, C = Direction.BENEFIT, Direction.COST


def problem(matrix, directions, weights=None, names=("A", "B", "C")):
    weights = weights or [1.0] * len(directions)
    criteria = tuple(Criterion(f"c{j}", d, w) for j, (d, w) in enumerate(zip(directions, weights, strict=True)))
    return DecisionProblem(names[: len(matrix)], criteria, matrix)


def test_weighted_sum_min_max(cars):
    # power -> A 0, B 1, C 0.4; price (cost) -> A 1, B 0, C 1
    result = weighted_sum(cars)
    np.testing.assert_allclose(result.scores, [0.5, 0.5, 0.7])
    assert result.ranks.tolist() == [2, 2, 1]
    assert result.order == ("C", "A", "B")
    assert result.higher_is_better


def test_weighted_sum_uses_weight_shares():
    p = problem([[10.0, 0.0], [0.0, 10.0]], [B, B], weights=[3.0, 1.0], names=("A", "B"))
    result = weighted_sum(p, Normalization.NONE)
    np.testing.assert_allclose(result.scores, [7.5, 2.5])
    assert result.rank_of("A") == 1
    assert result.score_of("B") == pytest.approx(2.5)


def test_topsis_vector_benefit():
    p = problem([[1.0, 0.0], [0.0, 1.0], [1.0, 1.0]], [B, B])
    np.testing.assert_allclose(topsis(p).scores, [0.5, 0.5, 1.0])


def test_topsis_vector_with_cost_criterion():
    # weighted: A (s, 0.5), B (0, 0), C (s, 0) with s = 0.5/sqrt(2);
    # ideal (s, 0), anti-ideal (0, 0.5)
    p = problem([[1.0, 1.0], [0.0, 0.0], [1.0, 0.0]], [B, C])
    result = topsis(p)
    np.testing.assert_allclose(result.scores, [math.sqrt(2) - 1, 2 - math.sqrt(2), 1.0])
    assert result.order == ("C", "B", "A")


def test_topsis_fixed_range_is_independent_of_other_alternatives():
    # weighted: A (0.4, 0.1), B (0.1, 0.4), C (0.3, 0.3); ideal (0.5, 0.5), anti-ideal (0, 0)
    p = problem([[80.0, 20.0], [20.0, 80.0], [60.0, 60.0]], [B, B])
    result = topsis(p, Normalization.FIXED_RANGE)
    np.testing.assert_allclose(result.scores, [0.5, 0.5, 0.6])

    # D widens the observed range, which moves min-max scores but not fixed-range ones
    extended = problem([[80.0, 20.0], [20.0, 80.0], [60.0, 60.0], [0.0, 100.0]], [B, B], names=("A", "B", "C", "D"))
    np.testing.assert_allclose(topsis(extended, Normalization.FIXED_RANGE).scores[:3], result.scores)
    assert not np.allclose(topsis(extended, Normalization.MIN_MAX).scores[:3], topsis(p, Normalization.MIN_MAX).scores)


def test_topsis_all_identical_alternatives_tie():
    p = problem([[5.0, 5.0], [5.0, 5.0]], [B, C], names=("A", "B"))
    assert topsis(p).ranks.tolist() == [1, 1]


@pytest.mark.parametrize(("p", "expected"), [(1, [0.5, 0.5, 0.3]), (2, [0.5, 0.5, 0.3]), (math.inf, [0.5, 0.5, 0.3])])
def test_compromise_programming(cars, p, expected):
    # weighted regrets: A (0.5, 0), B (0, 0.5), C (0.3, 0)
    result = compromise_programming(cars, p=p)
    np.testing.assert_allclose(result.scores, expected)
    assert result.ranks.tolist() == [2, 2, 1]
    assert not result.higher_is_better


def test_compromise_programming_p_changes_balance():
    # A is balanced, B is extreme; larger p penalises the extreme regret more
    p = problem([[50.0, 50.0], [100.0, 10.0], [0.0, 100.0]], [B, B])
    l1 = compromise_programming(p, p=1, normalization=Normalization.FIXED_RANGE)
    linf = compromise_programming(p, p=math.inf, normalization=Normalization.FIXED_RANGE)
    np.testing.assert_allclose(l1.scores, [0.5, 0.45, 0.5])
    np.testing.assert_allclose(linf.scores, [0.25, 0.45, 0.5])
    assert l1.order[0] == "B"
    assert linf.order[0] == "A"


def test_compromise_programming_p1_is_weighted_sum_complement(cars):
    np.testing.assert_allclose(compromise_programming(cars, p=1).scores, 1 - weighted_sum(cars).scores)


def test_compromise_programming_rejects_bad_arguments(cars):
    with pytest.raises(ValueError, match="p must be"):
        compromise_programming(cars, p=0.5)
    with pytest.raises(ValueError, match="normalization"):
        compromise_programming(cars, normalization=Normalization.VECTOR)


def test_cost_direction_mirrors_benefit_under_min_max():
    benefit = problem([[1.0, 0.0], [3.0, 0.0], [2.0, 0.0]], [B, B])
    cost = problem([[-1.0, 0.0], [-3.0, 0.0], [-2.0, 0.0]], [C, B])
    for method in (weighted_sum, compromise_programming):
        np.testing.assert_allclose(method(benefit).scores, method(cost).scores)


def test_weighted_sum_contributions_add_up(cars):
    result = weighted_sum(cars)
    assert result.contributions is not None
    # weight share 0.5 x normalised values: power (0, 1, 0.4), price (1, 0, 1)
    np.testing.assert_allclose(result.contributions, [[0.0, 0.5], [0.5, 0.0], [0.2, 0.5]])
    np.testing.assert_allclose(result.contributions.sum(axis=1), result.scores)
    assert topsis(cars).contributions is None
