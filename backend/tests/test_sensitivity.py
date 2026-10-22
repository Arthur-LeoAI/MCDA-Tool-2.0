import math

import pytest

from mcda_core import (
    Criterion,
    DecisionProblem,
    Direction,
    Normalization,
    StabilityScope,
    weight_stability_intervals,
)


def problem(matrix, weights, names=("X", "Y", "Z")):
    criteria = tuple(Criterion(f"c{j}", Direction.BENEFIT, w) for j, w in enumerate(weights))
    return DecisionProblem(names[: len(matrix)], criteria, matrix)


def intervals(p, scope=StabilityScope.FULL_ORDER):
    return {i.criterion: i for i in weight_stability_intervals(p, scope, Normalization.NONE)}


def test_two_alternatives():
    # scores X = w0, Y = w1; X wins while w0 > 0.4 (w1 fixed) and w1 < 0.6 (w0 fixed)
    result = intervals(problem([[1.0, 0.0], [0.0, 1.0]], [0.6, 0.4], names=("X", "Y")))
    c0, c1 = result["c0"], result["c1"]
    assert (c0.lower, c0.upper) == pytest.approx((0.4, math.inf))
    assert (c0.lower_normalized, c0.upper_normalized) == pytest.approx((0.5, 1.0))
    assert (c1.lower, c1.upper) == pytest.approx((0.0, 0.6))
    assert (c1.lower_normalized, c1.upper_normalized) == pytest.approx((0.0, 0.5))
    assert c0.weight == 0.6


def test_full_order_is_narrower_than_top1():
    # at w0 = t: X = t, Y = 0.4, Z = 0.5 t + 0.08 -> order X > Y > Z at t = 0.6
    # X/Y cross at 0.4, Y/Z at 0.64, X/Z at 0.16
    p = problem([[1.0, 0.0], [0.0, 1.0], [0.5, 0.2]], [0.6, 0.4])
    full = intervals(p, StabilityScope.FULL_ORDER)["c0"]
    top1 = intervals(p, StabilityScope.TOP1)["c0"]
    assert (full.lower, full.upper) == pytest.approx((0.4, 0.64))
    assert (top1.lower, top1.upper) == pytest.approx((0.4, math.inf))


def test_tie_collapses_interval():
    p = problem([[1.0, 0.0], [0.0, 1.0]], [0.5, 0.5], names=("X", "Y"))
    for scope in StabilityScope:
        c0 = intervals(p, scope)["c0"]
        assert c0.lower == c0.upper == 0.5


def test_parallel_lines_never_cross():
    # Y is X shifted down on c1, so changing w0 can never reorder them
    p = problem([[1.0, 1.0], [1.0, 0.0]], [0.5, 0.5], names=("X", "Y"))
    c0 = intervals(p)["c0"]
    assert (c0.lower, c0.upper) == (0.0, math.inf)


def test_zero_weight_criterion_gets_a_real_interval():
    # X = 0.5 + t, Y = 1.0 -> X overtakes Y once t > 0.5
    p = problem([[1.0, 0.5, 1.0], [0.0, 1.0, 0.0]], [0.0, 1.0, 0.0], names=("X", "Y"))
    c0 = intervals(p)["c0"]
    assert (c0.lower, c0.upper) == pytest.approx((0.0, 0.5))
