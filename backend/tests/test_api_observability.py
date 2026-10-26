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


def test_json_log_lines_have_request_fields_but_no_body(cars_project):
    records: list[logging.LogRecord] = []

    class Capture(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            records.append(record)

    app = create_app(Settings(cors_origins=[], log_format="json"))
    capture = Capture()
    logger.addHandler(capture)
    try:
        TestClient(app).post("/api/v1/projects/validate", json=cars_project, headers={"X-Request-ID": "log-1"})
    finally:
        logger.removeHandler(capture)

    (record,) = [r for r in records if r.getMessage() == "request"]
    line = json.loads(JsonFormatter().format(record))
    assert line["request_id"] == "log-1"
    assert line["method"] == "POST"
    assert line["path"] == "/api/v1/projects/validate"
    assert line["status"] == 200
    assert "power" not in json.dumps(line)  # project data must never be logged


@pytest.mark.parametrize(
    ("value_function", "code", "params"),
    [
        ({"kind": "log", "bounds": "data"}, "log_negative_value", {"value": -5.0}),
        ({"kind": "linear", "bounds": [100, 0]}, "value_function_invalid", {"reason": "bounds_order"}),
    ],
)
def test_setting_errors_have_codes_and_params(client, cars_project, value_function, code, params):
    cars_project["criteria"][0]["value_function"] = value_function
    cars_project["data"]["c1"]["a1"] = -5.0
    response = client.post("/api/v1/projects/evaluate", json=cars_project)
    assert response.status_code == 422
    (issue,) = response.json()["issues"]
    assert (issue["code"], issue["params"]) == (code, params)


def test_upload_errors_have_codes(client):
    too_big = client.post("/api/v1/projects/import", files={"file": ("big.csv", b"x" * (200 * 1024 + 1))})
    assert too_big.json()["code"] == "file_too_large"
    assert too_big.json()["params"] == {"max_mb": 0.2}
    wrong = client.post("/api/v1/projects/import", files={"file": ("a.json", b"{}")})
    assert (wrong.json()["code"], wrong.json()["params"]) == ("unsupported_file_type", {"suffix": ".json"})
