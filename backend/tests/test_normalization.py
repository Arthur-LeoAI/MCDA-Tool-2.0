import numpy as np
import pytest

from mcda_core import Direction, McdaError, Normalization, normalize

B, C = Direction.BENEFIT, Direction.COST


def test_min_max_orients_cost_criteria():
    matrix = np.array([[0.0, 10.0], [5.0, 20.0], [10.0, 30.0]])
    result = normalize(matrix, [B, C], Normalization.MIN_MAX)
    np.testing.assert_allclose(result, [[0.0, 1.0], [0.5, 0.5], [1.0, 0.0]])


def test_constant_column_scores_best():
    result = normalize(np.array([[3.0, 1.0], [3.0, 2.0]]), [B, B], Normalization.MIN_MAX)
    np.testing.assert_allclose(result[:, 0], [1.0, 1.0])


def test_fixed_range_uses_bounds_not_data():
    matrix = np.array([[25.0, 25.0], [50.0, 75.0]])
    result = normalize(matrix, [B, C], Normalization.FIXED_RANGE, bounds=(0, 100))
    np.testing.assert_allclose(result, [[0.25, 0.75], [0.5, 0.25]])
    per_criterion = normalize(matrix, [B, B], Normalization.FIXED_RANGE, bounds=[(0, 50), (0, 100)])
    np.testing.assert_allclose(per_criterion[:, 0], [0.5, 1.0])


def test_fixed_range_rejects_values_outside_bounds():
    with pytest.raises(ValueError, match="outside the fixed range"):
        normalize(np.array([[120.0], [50.0]]), [B], Normalization.FIXED_RANGE, bounds=(0, 100))


def test_none_requires_benefit_criteria():
    matrix = np.array([[1.0, 2.0], [3.0, 4.0]])
    np.testing.assert_array_equal(normalize(matrix, [B, B], Normalization.NONE), matrix)
    with pytest.raises(ValueError, match="benefit criteria only"):
        normalize(matrix, [B, C], Normalization.NONE)


def test_vector_is_reserved_for_topsis():
    with pytest.raises(McdaError, match="TOPSIS") as excinfo:
        normalize(np.ones((2, 1)), [B], Normalization.VECTOR)
    assert excinfo.value.code == "vector_needs_topsis"
