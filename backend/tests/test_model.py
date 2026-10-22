import math

import numpy as np
import pytest

from mcda_core import Criterion, DecisionProblem, Direction, ProblemValidationError


def make(alternatives=("A", "B"), criteria=None, matrix=None):
    criteria = criteria or (Criterion("c1", Direction.BENEFIT, 1.0),)
    matrix = [[1.0] * len(criteria) for _ in alternatives] if matrix is None else matrix
    return DecisionProblem(alternatives, criteria, matrix)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("benefit", Direction.BENEFIT), ("MAX", Direction.BENEFIT), (1, Direction.BENEFIT), (1.0, Direction.BENEFIT),
        ("cost", Direction.COST), (" min ", Direction.COST), (0, Direction.COST), ("0", Direction.COST),
    ],
)
def test_direction_parse_accepts_aliases(raw, expected):
    assert Direction.parse(raw) is expected


def test_direction_parse_rejects_unknown():
    with pytest.raises(ValueError):
        Direction.parse("higher")


def test_matrix_is_read_only_copy():
    source = np.array([[1.0], [2.0]])
    problem = make(matrix=source)
    source[0, 0] = 99
    assert problem.matrix[0, 0] == 1.0
    with pytest.raises(ValueError):
        problem.matrix[0, 0] = 5


def test_reports_all_issues_at_once():
    with pytest.raises(ProblemValidationError) as excinfo:
        make(
            alternatives=("A", "A", ""),
            criteria=(Criterion("c1", Direction.BENEFIT, -1.0), Criterion("c1", Direction.BENEFIT, math.nan)),
            matrix=[[1, 2], [3, 4], [5, 6]],
        )
    messages = [str(i) for i in excinfo.value.issues]
    assert any("duplicate alternative" in m for m in messages)
    assert any("alternative #3" in m for m in messages)
    assert any("duplicate criterion" in m for m in messages)
    assert any("must not be negative" in m for m in messages)
    assert any("finite number" in m for m in messages)


def test_rejects_zero_total_weight():
    with pytest.raises(ProblemValidationError, match="positive weight"):
        make(criteria=(Criterion("c1", Direction.BENEFIT, 0.0),))


def test_rejects_wrong_shape_and_non_finite_values():
    with pytest.raises(ProblemValidationError, match="shape"):
        make(matrix=[[1.0, 2.0], [3.0, 4.0]])
    with pytest.raises(ProblemValidationError, match="alternative 'B', criterion 'c1'"):
        make(matrix=[[1.0], [math.inf]])


def test_needs_two_alternatives():
    with pytest.raises(ProblemValidationError, match="at least 2 alternative"):
        make(alternatives=("A",))


def test_normalized_weights_and_with_weights(cars):
    assert cars.normalized_weights.tolist() == [0.5, 0.5]
    changed = cars.with_weights({"power": 3.0})
    assert changed.weights.tolist() == [3.0, 0.5]
    assert changed.normalized_weights.sum() == pytest.approx(1.0)
    assert cars.weights.tolist() == [0.5, 0.5]  # original untouched
    assert cars.with_weights([1, 2]).weights.tolist() == [1.0, 2.0]
    with pytest.raises(KeyError):
        cars.with_weights({"speed": 1.0})
