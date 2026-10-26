"""S5: robustness of the ranking under uncertain weights (Monte Carlo)."""

import time

import numpy as np
import pytest

from mcda_core.project import parse_project, prepare
from mcda_core.project.model import RobustnessSettings
from mcda_core.project.robustness import robustness, sample_weights


def project(data: dict[str, list[float]], weights: dict[str, float], **settings) -> dict:
    """Alternatives A, B, ... (a0, a1, ... beyond 26); benefit criteria on [0, 1], so value = raw value."""
    m = len(next(iter(data.values())))
    ids = [chr(ord("A") + i) if m <= 26 else f"a{i}" for i in range(m)]
    return {
        "format": "mcda-project",
        "version": 2,
        "alternatives": [{"id": i, "name": i} for i in ids],
        "criteria": [
            {"id": c, "name": c, "value_function": {"kind": "linear", "direction": "benefit", "bounds": [0, 1]}}
            for c in data
        ],
        "data": {c: dict(zip(ids, column, strict=True)) for c, column in data.items()},
        "weighting": {"within": {"_root": {"weights": weights}}},
        "analysis": {"robustness": {"samples": 2000, **settings}},
    }


CLOSE = {"c1": [0.9, 0.5, 0.1, 0.0], "c2": [0.2, 0.7, 0.9, 0.0], "c3": [0.5, 0.5, 0.6, 0.1]}
WEIGHTS = {"c1": 0.4, "c2": 0.4, "c3": 0.2}


def run(document: dict):
    return robustness(prepare(parse_project(document)))


def test_same_seed_same_result_other_seed_differs():
    first, again = run(project(CLOSE, WEIGHTS, seed=7)), run(project(CLOSE, WEIGHTS, seed=7))
    other = run(project(CLOSE, WEIGHTS, seed=8))
    np.testing.assert_array_equal(first.rank_probabilities, again.rank_probabilities)
    assert not np.array_equal(first.rank_probabilities, other.rank_probabilities)


def test_unknown_weights_are_uniform_on_average():
    settings = RobustnessSettings(mode="unknown", samples=20_000, seed=3)
    samples = sample_weights(np.array([0.7, 0.2, 0.1, 0.0]), settings, np.random.default_rng(settings.seed))
    np.testing.assert_allclose(samples.sum(axis=1), 1)
    np.testing.assert_allclose(samples.mean(axis=0), [1 / 3, 1 / 3, 1 / 3, 0], atol=0.01)


def test_around_keeps_zero_weights_and_stays_near_the_current_weights():
    settings = RobustnessSettings(mode="around", spread=0.2, samples=20_000, seed=3)
    samples = sample_weights(np.array([0.5, 0.3, 0.2, 0.0]), settings, np.random.default_rng(settings.seed))
    assert (samples[:, 3] == 0).all()
    np.testing.assert_allclose(samples.mean(axis=0), [0.5, 0.3, 0.2, 0], atol=0.02)


def test_dominated_alternative_is_never_first():
    result = run(project(CLOSE, WEIGHTS, mode="unknown"))
    d = result.alternative_ids.index("D")  # D is worse than A on every criterion
    assert result.p_best[d] == 0
    assert result.alternative_ids[-1] == "D"


def test_probabilities_add_up():
    result = run(project(CLOSE, WEIGHTS, mode="unknown"))
    np.testing.assert_allclose(result.rank_probabilities.sum(axis=1), 1)
    np.testing.assert_allclose(result.rank_probabilities.sum(axis=0), 1)  # no ties in this data
    np.testing.assert_allclose(result.wins + result.wins.T + np.eye(4), 1)
    np.testing.assert_allclose(result.mean_rank, result.rank_probabilities @ np.arange(1, 5))
    assert list(result.mean_rank) == sorted(result.mean_rank)


def test_ties_share_first_place():
    tied = {"c1": [0.8, 0.8, 0.1], "c2": [0.3, 0.3, 0.2]}
    result = run(project(tied, {"c1": 1, "c2": 1}))
    assert list(result.p_best[:2]) == [1, 1]
    assert result.wins[0, 1] == result.wins[1, 0] == 0


def test_confidence_levels():
    clear = {"c1": [0.9, 0.1, 0.2], "c2": [0.8, 0.2, 0.1]}
    result = run(project(clear, {"c1": 1, "c2": 1}))
    assert (result.confidence.alternative_id, result.confidence.level, result.confidence.p_best) == ("A", "high", 1)
    close = run(project(CLOSE, WEIGHTS, mode="unknown"))
    assert close.confidence.level in ("medium", "low")
    assert close.confidence.p_best < 0.8


def test_hundred_by_twenty_in_under_two_seconds():
    rng = np.random.default_rng(0)
    data = {f"c{j}": list(rng.random(100)) for j in range(20)}
    prepared = prepare(parse_project(project(data, {c: 1 for c in data}, samples=5000)))
    start = time.perf_counter()
    result = robustness(prepared)
    assert time.perf_counter() - start < 2.0
    assert result.rank_probabilities.shape == (100, 100)


def test_robustness_endpoint(client):
    response = client.post("/api/v1/projects/robustness", json=project(CLOSE, WEIGHTS, samples=500))
    assert response.status_code == 200
    body = response.json()
    assert body["settings"]["samples"] == 500
    assert [a["id"] for a in body["alternatives"]][-1] == "D"
    assert len(body["wins"]) == 4
    assert body["alternatives"][0]["rank_probabilities"][0] == pytest.approx(body["alternatives"][0]["p_best"])
    assert body["confidence"]["level"] in ("high", "medium", "low")


def test_robustness_needs_a_positive_weight(client):
    response = client.post("/api/v1/projects/robustness", json=project(CLOSE, {"c1": 0}))
    assert response.status_code == 422
    assert response.json()["code"] == "no_positive_weight"
