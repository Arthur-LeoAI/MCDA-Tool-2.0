import json
import math

import numpy as np
import pytest

from mcda_core import StabilityScope, compromise_programming, topsis, weight_stability_intervals, weighted_sum


def issues(response) -> list[tuple[str, dict | None]]:
    return [(issue["code"], issue["location"]) for issue in response.json()["issues"]]


def evaluate(client, project: dict, methods: list[dict]):
    return client.post("/api/v1/projects/evaluate", json={**project, "analysis": {"methods": methods}})


def test_health(client):
    assert client.get("/api/v1/health").json()["status"] == "ok"


def test_methods_describe_options(client):
    methods = {m["method"]: m for m in client.get("/api/v1/methods").json()}
    assert set(methods) == {"weighted_sum", "topsis", "compromise_programming"}
    assert methods["topsis"]["default_normalization"] == "vector"
    assert methods["compromise_programming"]["higher_is_better"] is False
    assert methods["compromise_programming"]["parameters"]["p"] == 2.0


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/problems/validate",
        "/api/v1/evaluate",
        "/api/v1/pareto",
        "/api/v1/sensitivity/stability",
        "/api/v1/problems/import",
        "/api/v1/export/problem",
        "/api/v1/export/report",
    ],
)
def test_removed_problem_endpoints_are_gone(client, path):
    assert client.post(path, json={}).status_code in (404, 405)


def test_evaluate_matches_core(client, cars, cars_project):
    response = evaluate(
        client,
        cars_project,
        [
            {"method": "weighted_sum"},
            {"method": "topsis", "basis": "raw"},
            {"method": "compromise_programming", "p": "inf"},
        ],
    )
    assert response.status_code == 200
    results = response.json()["results"]
    expected = [weighted_sum(cars), topsis(cars), compromise_programming(cars, p=math.inf)]
    names = {"a1": "A", "a2": "B", "a3": "C"}
    for got, want in zip(results, expected, strict=True):
        assert got["method"] == want.method
        np.testing.assert_allclose([a["score"] for a in got["alternatives"]], want.scores)
        assert [a["rank"] for a in got["alternatives"]] == want.ranks.tolist()
        assert [names[i] for i in got["order"]] == list(want.order)


def test_invalid_project_lists_all_issues(client, cars_project):
    cars_project["alternatives"][1]["name"] = "A"
    cars_project["weighting"]["within"]["_root"]["weights"]["c2"] = -1
    response = client.post("/api/v1/projects/evaluate", json=cars_project)
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "invalid_problem"
    assert body["request_id"] == response.headers["x-request-id"]
    assert ("duplicate_name", {"kind": "alternative", "name": "A"}) in issues(response)
    negative = next(i for i in body["issues"] if i["code"] == "weight_negative")
    assert negative["params"] == {"value": -1.0}
    assert negative["location"] == {"kind": "field", "ref": "weighting.within._root.weights.c2"}
    assert negative["message"] == "weight must not be negative, got -1.0"


def test_non_finite_numbers_are_rejected(client, cars_project):
    cars_project["weighting"]["within"]["_root"]["weights"]["c1"] = "__nan__"
    body = json.dumps(cars_project).replace('"__nan__"', "NaN")
    response = client.post("/api/v1/projects/validate", content=body, headers={"content-type": "application/json"})
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_request"
    assert ("request_invalid", {"kind": "field", "ref": "weighting.within._root.weights.c1"}) in issues(response)


@pytest.mark.parametrize(
    "method",
    [
        {"method": "electre"},
        {"method": "compromise_programming", "p": 0.5},
        {"method": "topsis", "basis": "z_score"},
    ],
)
def test_invalid_method_settings(client, cars_project, method):
    response = evaluate(client, cars_project, [method])
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_request"
    assert response.json()["detail"] == "Invalid request"


def test_needs_at_least_one_method(client, cars_project):
    assert evaluate(client, cars_project, []).status_code == 422


@pytest.mark.parametrize("scope", list(StabilityScope))
def test_stability_matches_core(client, cars, cars_project, scope):
    response = client.post("/api/v1/projects/stability", json={"project": cars_project, "scope": scope.value})
    assert response.status_code == 200
    body = response.json()
    assert body["scope"] == scope.value
    for got, want in zip(body["intervals"], weight_stability_intervals(cars, scope), strict=True):
        assert got["criterion"] == want.criterion
        assert got["lower"] == pytest.approx(want.lower)
        assert got["upper"] == (None if math.isinf(want.upper) else pytest.approx(want.upper))
        assert got["upper_share"] == pytest.approx(want.upper_normalized)


def test_unbounded_interval_is_null(client, cars_project):
    # X is best on c1, Y on c2; c1 carries the larger weight, so it can grow without limit.
    cars_project["alternatives"] = [{"id": "a1", "name": "X"}, {"id": "a2", "name": "Y"}]
    cars_project["data"] = {"c1": {"a1": 1.0, "a2": 0.0}, "c2": {"a1": 0.0, "a2": 1.0}}
    cars_project["criteria"][1]["value_function"]["direction"] = "benefit"
    cars_project["weighting"]["within"]["_root"]["weights"] = {"c1": 0.6, "c2": 0.4}
    body = client.post("/api/v1/projects/stability", json={"project": cars_project}).json()
    c1 = body["intervals"][0]
    assert c1["lower"] == pytest.approx(0.4) and c1["upper"] is None and c1["upper_share"] == 1.0


def test_cors_allows_configured_origin(client):
    response = client.get("/api/v1/health", headers={"Origin": "http://localhost:5173"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    other = client.get("/api/v1/health", headers={"Origin": "https://example.org"})
    assert "access-control-allow-origin" not in other.headers


def test_only_weighted_sum_returns_contributions(client, cars_project):
    results = evaluate(client, cars_project, [{"method": "weighted_sum"}, {"method": "topsis"}]).json()["results"]
    c = next(a for a in results[0]["alternatives"] if a["id"] == "a3")
    assert c["contributions"] == pytest.approx({"c1": 0.2, "c2": 0.5})
    assert all(a["contributions"] is None for a in results[1]["alternatives"])
