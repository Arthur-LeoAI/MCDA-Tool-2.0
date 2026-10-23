import json
import logging

import pytest
from fastapi.testclient import TestClient

from mcda_api.main import Settings, create_app
from mcda_api.observability import JsonFormatter, logger


def test_request_id_is_generated_and_echoed(client):
    generated = client.get("/api/v1/health").headers["x-request-id"]
    assert len(generated) == 32
    given = client.get("/api/v1/health", headers={"X-Request-ID": "abc-123"})
    assert given.headers["x-request-id"] == "abc-123"


def test_invalid_request_id_is_replaced(client):
    response = client.get("/api/v1/health", headers={"X-Request-ID": "bad id with spaces"})
    assert response.headers["x-request-id"] != "bad id with spaces"


def test_unexpected_errors_return_500_with_request_id_only():
    app = create_app(Settings(cors_origins=[]))

    @app.get("/boom")
    def boom() -> None:
        raise RuntimeError("secret internal detail")

    response = TestClient(app).get("/boom", headers={"X-Request-ID": "req-1"})
    assert response.status_code == 500
    body = response.json()
    assert body["code"] == "internal_error"
    assert body["request_id"] == "req-1"
    assert "secret" not in response.text


def test_json_log_lines_have_request_fields_but_no_body(cars_json):
    records: list[logging.LogRecord] = []

    class Capture(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            records.append(record)

    app = create_app(Settings(cors_origins=[], log_format="json"))
    capture = Capture()
    logger.addHandler(capture)
    try:
        TestClient(app).post("/api/v1/problems/validate", json=cars_json, headers={"X-Request-ID": "log-1"})
    finally:
        logger.removeHandler(capture)

    (record,) = [r for r in records if r.getMessage() == "request"]
    line = json.loads(JsonFormatter().format(record))
    assert line["request_id"] == "log-1"
    assert line["method"] == "POST"
    assert line["path"] == "/api/v1/problems/validate"
    assert line["status"] == 200
    assert "power" not in json.dumps(line)  # problem data must never be logged


@pytest.mark.parametrize(
    ("spec", "code", "params"),
    [
        (
            {"method": "weighted_sum", "normalization": "fixed_range", "bounds": [0, 100]},
            "out_of_fixed_range",
            {"count": 2, "row": 2, "column": 1, "value": 150.0, "low": 0.0, "high": 100.0},
        ),
        ({"method": "weighted_sum", "normalization": "none"}, "normalization_none_cost", {}),
    ],
)
def test_setting_errors_have_codes_and_params(client, cars_json, spec, code, params):
    response = client.post("/api/v1/evaluate", json={"problem": cars_json, "methods": [spec]})
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == code
    assert body["params"] == params


def test_upload_errors_have_codes(client):
    too_big = client.post("/api/v1/problems/import", files={"file": ("big.csv", b"x" * (200 * 1024 + 1))})
    assert too_big.json()["code"] == "file_too_large"
    assert too_big.json()["params"] == {"max_mb": 0.2}
    wrong = client.post("/api/v1/problems/import", files={"file": ("a.json", b"{}")})
    assert (wrong.json()["code"], wrong.json()["params"]) == ("unsupported_file_type", {"suffix": ".json"})
