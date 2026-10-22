import numpy as np

from mcda_core import rank_scores


def test_competition_ranking_with_ties():
    assert rank_scores(np.array([0.2, 0.9, 0.5, 0.9])).tolist() == [4, 1, 3, 1]


def test_lower_is_better():
    assert rank_scores(np.array([3.0, 1.0, 2.0]), higher_is_better=False).tolist() == [3, 1, 2]


def test_floating_point_noise_counts_as_tie():
    scores = np.array([0.1 + 0.2, 0.3, 0.1])
    assert rank_scores(scores).tolist() == [1, 1, 3]
