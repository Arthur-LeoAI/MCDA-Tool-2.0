import io

import pytest

from mcda_core.io import read_problem, write_problem


def upload(client, filename: str, data: bytes, path: str = "/api/v1/projects/import"):
    return client.post(path, files={"file": (filename, data)})


def problem_bytes(problem, suffix: str) -> bytes:
    buffer = io.BytesIO()
    write_problem(problem, buffer, suffix=suffix)
    return buffer.getvalue()


@pytest.mark.parametrize("file_format", ["xlsx", "csv"])
def test_template_download(client, file_format):
    response = client.get("/api/v1/template", params={"format": file_format})
    assert response.status_code == 200
    assert f'filename="mcda-template.{file_format}"' in response.headers["content-disposition"]
    problem = read_problem(io.BytesIO(response.content), suffix=f".{file_format}")
    assert problem.criterion_names == ("Cost", "Quality", "Risk")


@pytest.mark.parametrize("suffix", [".xlsx", ".csv"])
def test_import_template(client, cars, cars_project, suffix):
    response = upload(client, f"cars{suffix}", problem_bytes(cars, suffix))
    assert response.status_code == 200
    body = response.json()
    assert body["source_format"] == "template"
    assert body["filename"] == f"cars{suffix}"
    project = body["project"]
    assert [a["name"] for a in project["alternatives"]] == ["A", "B", "C"]
    assert [c["name"] for c in project["criteria"]] == ["power", "price"]
    assert project["data"] == cars_project["data"]
    assert project["weighting"] == cars_project["weighting"]


def test_import_reports_cell_errors(client):
    data = b"Criterion,c1,c2\nDirection,benefit,sideways\nWeight,1,1\nA,1,n/a\nB,2,3\n"
    response = upload(client, "bad.csv", data)
    assert response.status_code == 422
    found = {(i["code"], i["location"]["ref"]) for i in response.json()["issues"]}
    assert found == {("invalid_direction", "C2"), ("value_not_number", "C4")}


@pytest.mark.parametrize("path", ["/api/v1/projects/import", "/api/v1/tables/inspect"])
def test_upload_rejects_other_file_types(client, path):
    response = upload(client, "data.json", b"{}", path)
    assert response.status_code == 415


@pytest.mark.parametrize("path", ["/api/v1/projects/import", "/api/v1/tables/inspect"])
def test_upload_rejects_large_files(client, path):
    response = upload(client, "big.csv", b"x" * (200 * 1024 + 1), path)
    assert response.status_code == 413


def test_import_rejects_corrupt_workbook(client):
    response = upload(client, "broken.xlsx", b"not a zip file")
    assert response.status_code == 422
    assert "could not read broken.xlsx" in response.json()["detail"]


def test_import_strips_client_paths(client, cars):
    body = upload(client, "../../secret/cars.csv", problem_bytes(cars, ".csv")).json()
    assert body["filename"] == "cars.csv"
    assert body["project"]["source"]["filename"] == "cars.csv"
