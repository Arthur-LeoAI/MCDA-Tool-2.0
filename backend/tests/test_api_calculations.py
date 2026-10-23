import math

import numpy as np
import pytest

from mcda_core import StabilityScope, compromise_programming, topsis, weight_stability_intervals, weighted_sum


def issues(response) -> list[tuple[str, dict | None]]:
    return [(issue["code"], issue["location"]) for issue in response.json()["issues"]]


def test_health(client):
    assert client.get("/api/v1/health").json()["status"] == "ok"


def test_methods_describe_options(client):
    methods = {m["method"]: m for m in client.get("/api/v1/methods").json()}
    assert set(methods) == {"weighted_sum", "topsis", "compromise_programming"}
    assert methods["topsis"]["default_normalization"] == "vector"
    assert methods["compromise_programming"]["higher_is_better"] is False
    assert methods["compromise_programming"]["parameters"]["p"] == 2.0


def test_evaluate_matches_core(client, cars, cars_json):
    response = client.post(
        "/api/v1/evaluate",
        json={
            "problem": cars_json,
            "methods": [
                {"method": "weighted_sum"},
                {"method": "topsis"},
                {"method": "compromise_programming", "p": "inf"},
            ],
        },
    )
    assert response.status_code == 200
    results = response.json()["results"]
    expected = [weighted_sum(cars), topsis(cars), compromise_programming(cars, p=math.inf)]
    for got, want in zip(results, expected, strict=True):
        assert got["method"] == want.method
        np.testing.assert_allclose([a["score"] for a in got["alternatives"]], want.scores)
        assert [a["rank"] for a in got["alternatives"]] == want.ranks.tolist()
        assert got["order"] == list(want.order)
    assert [r["label"] for r in results] == ["Weighted sum (min_max)", "TOPSIS (vector)", "CP p=∞ (min_max)"]
    assert results[1]["spec"] == {"method": "topsis", "normalization": "vector", "bounds": [0.0, 100.0]}


def test_validate_returns_problem(client, cars_json):
    response = client.post("/api/v1/problems/validate", json=cars_json)
    assert response.status_code == 200
    assert response.json() == cars_json


def test_invalid_problem_lists_all_issues(client, cars_json):
    cars_json["alternatives"] = ["A", "A", "C"]
    cars_json["criteria"][1]["weight"] = -1
    response = client.post("/api/v1/evaluate", json={"problem": cars_json, "methods": [{"method": "topsis"}]})
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "invalid_problem"
    assert body["request_id"] == response.headers["x-request-id"]
    assert ("duplicate_name", {"kind": "alternative", "name": "A"}) in issues(response)
    assert ("weight_negative", {"kind": "criterion", "name": "price"}) in issues(response)
    negative = next(i for i in body["issues"] if i["code"] == "weight_negative")
    assert negative["params"] == {"value": -1.0}
    assert negative["message"] == "weight must not be negative, got -1.0"


def test_ragged_matrix(client, cars_json):
    cars_json["matrix"][1] = [1.0]
    response = client.post("/api/v1/problems/validate", json=cars_json)
    assert response.status_code == 422
    assert issues(response) == [("ragged_row", {"kind": "row", "index": 2})]
    assert response.json()["issues"][0]["params"] == {"count": 1, "expected": 2}


def test_non_finite_numbers_are_rejected(client, cars_json):
    body = '{"alternatives": ["A", "B"], "criteria": [{"name": "c", "weight": 1}], "matrix": [[NaN], [1]]}'
    response = client.post("/api/v1/problems/validate", content=body, headers={"content-type": "application/json"})
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_request"
    assert ("request_invalid", {"kind": "field", "ref": "matrix.0.0"}) in issues(response)


@pytest.mark.parametrize(
    ("spec", "message"),
    [
        ({"method": "weighted_sum", "normalization": "fixed_range", "bounds": [0, 100]}, "outside the fixed range"),
        ({"method": "weighted_sum", "normalization": "none"}, "benefit criteria only"),
    ],
)
def test_invalid_settings_for_the_data(client, cars_json, spec, message):
    response = client.post("/api/v1/evaluate", json={"problem": cars_json, "methods": [spec]})
    assert response.status_code == 422
    assert message in response.json()["detail"]


@pytest.mark.parametrize(
    "spec",
    [
        {"method": "electre"},
        {"method": "compromise_programming", "p": 0.5},
        {"method": "topsis", "normalization": "z_score"},
    ],
)
def test_invalid_method_specs(client, cars_json, spec):
    response = client.post("/api/v1/evaluate", json={"problem": cars_json, "methods": [spec]})
    assert response.status_code == 422
    assert response.json()["detail"] == "Invalid request"


def test_needs_at_least_one_method(client, cars_json):
    assert client.post("/api/v1/evaluate", json={"problem": cars_json, "methods": []}).status_code == 422


def test_pareto(client, cars_json):
    body = client.post("/api/v1/pareto", json={"problem": cars_json}).json()
    assert body["front"] == ["B", "C"]
    a = next(x for x in body["alternatives"] if x["alternative"] == "A")
    assert a == {"alternative": "A", "is_pareto_optimal": False, "dominates": [], "dominated_by": ["C"]}
    assert client.post("/api/v1/pareto", json={"problem": cars_json, "criteria": ["power"]}).json()["front"] == ["B"]


@pytest.mark.parametrize("criteria", [["speed"], []])
def test_pareto_rejects_bad_criteria(client, cars_json, criteria):
    response = client.post("/api/v1/pareto", json={"problem": cars_json, "criteria": criteria})
    assert response.status_code == 422


@pytest.mark.parametrize("scope", list(StabilityScope))
def test_stability(client, cars, cars_json, scope):
    response = client.post("/api/v1/sensitivity/stability", json={"problem": cars_json, "scope": scope.value})
    assert response.status_code == 200
    body = response.json()
    assert body["scope"] == scope.value
    for got, want in zip(body["intervals"], weight_stability_intervals(cars, scope), strict=True):
        assert got["criterion"] == want.criterion
        assert got["lower"] == pytest.approx(want.lower)
        assert got["upper"] == (None if math.isinf(want.upper) else pytest.approx(want.upper))
        assert got["upper_share"] == pytest.approx(want.upper_normalized)


def test_unbounded_interval_is_null(client):
    problem = {
        "alternatives": ["X", "Y"],
        "criteria": [{"name": "c0", "weight": 0.6}, {"name": "c1", "weight": 0.4}],
        "matrix": [[1, 0], [0, 1]],
    }
    body = client.post("/api/v1/sensitivity/stability", json={"problem": problem, "normalization": "none"}).json()
    c0 = body["intervals"][0]
    assert c0["lower"] == pytest.approx(0.4) and c0["upper"] is None and c0["upper_share"] == 1.0


def test_cors_allows_configured_origin(client):
    response = client.get("/api/v1/health", headers={"Origin": "http://localhost:5173"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    other = client.get("/api/v1/health", headers={"Origin": "https://example.org"})
    assert "access-control-allow-origin" not in other.headers


def test_weighted_sum_returns_contributions(client, cars_json):
    results = client.post(
        "/api/v1/evaluate",
        json={
            "problem": cars_json,
            "methods": [{"method": "weighted_sum"}, {"method": "topsis"}],
        },
    ).json()["results"]
    c = next(a for a in results[0]["alternatives"] if a["name"] == "C")
    assert c["contributions"] == pytest.approx([0.2, 0.5])
    assert all(a["contributions"] is None for a in results[1]["alternatives"])
