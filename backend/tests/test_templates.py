"""S7: built-in templates, projects from templates and matching tables to templates."""

import io

import numpy as np
import openpyxl
import pytest
from conftest import LEGACY_DIR

from mcda_core.io import read_legacy_workbook
from mcda_core.project import prepare, run_method
from mcda_core.project.model import WeightedSumMethod
from mcda_core.templates import get_template, match_columns, normalize, template_project, templates

AMAZON = "amazon-us-product-selection"
ELT = "elt-technology-assessment"


def test_both_templates_load():
    assert set(templates()) == {AMAZON, ELT}
    assert len(get_template(AMAZON).criteria) == 10
    assert len(get_template(ELT).criteria) == 34


@pytest.mark.parametrize("template_id", [AMAZON, ELT])
@pytest.mark.parametrize("language", ["zh", "en"])
def test_example_runs_the_whole_analysis(client, template_id, language):
    response = client.get(f"/api/v1/templates/{template_id}/project", params={"language": language})
    assert response.status_code == 200
    project = response.json()
    assert project["meta"]["template_id"] == template_id
    for path in ("evaluate", "robustness", "stability"):
        body = {"project": project} if path == "stability" else project
        assert client.post(f"/api/v1/projects/{path}", json=body).status_code == 200, path
    report = client.post("/api/v1/projects/report", json={"project": project})
    assert "Weights" in openpyxl.load_workbook(io.BytesIO(report.content)).sheetnames


def ranking(preset: str) -> list[str]:
    prepared = prepare(template_project(get_template(ELT), "en", preset=preset))
    result = run_method(prepared, WeightedSumMethod())
    names = {a.id: a.name for a in prepared.project.alternatives}
    return [names[prepared.eligible[i]] for i in np.argsort(result.ranks, kind="stable")]


@pytest.mark.parametrize("scenario", ["Enviro", "Econ", "Tech", "Equal", "Hier"])
def test_elt_presets_reproduce_the_legacy_weights_and_rankings(scenario):
    legacy = read_legacy_workbook(LEGACY_DIR / f"MCDA ELT V7_{scenario}_G_Top1.xlsx")
    prepared = prepare(template_project(get_template(ELT), "en", preset=scenario.lower()))
    np.testing.assert_allclose(prepared.weights, [c.weight for c in legacy.problem.criteria], atol=1e-9)
    if scenario == "Enviro":  # the example data come from the Hier workbook; the values are the same for Enviro
        np.testing.assert_allclose(prepared.values * 100, legacy.problem.matrix, atol=1e-9)
        assert ranking("enviro") == list(legacy.reference_order)


def test_without_example_only_settings():
    project = template_project(get_template(AMAZON), "zh", example=False)
    assert project.alternatives == []
    assert [g.name for g in project.groups] == ["需求", "盈利", "竞争", "风险", "运营"]
    assert [(k.criterion_id, k.op) for k in project.constraints] == [("margin", ">=")]


def test_example_labels_follow_the_language():
    zh = template_project(get_template(AMAZON), "zh")
    assert zh.data["size_tier"]["p3"] == "大件"
    assert [c.label for c in zh.criteria[1].categories or []] == ["强季节性", "一般", "全年稳定"]
    assert template_project(get_template(AMAZON), "en").data["size_tier"]["p3"] == "oversize"


def test_amazon_margin_condition_excludes_low_margin():
    body = prepare(template_project(get_template(AMAZON), "en"))
    assert [e.alternative_id for e in body.excluded] == ["p5"]  # 18 % < 20 %


def test_unknown_template_and_preset(client):
    assert client.get("/api/v1/templates/nope/project").json()["code"] == "template_unknown"
    response = client.get(f"/api/v1/templates/{ELT}/project", params={"preset": "nope"})
    assert (response.status_code, response.json()["code"]) == (422, "template_preset_unknown")


def test_list_templates(client):
    listed = {t["id"]: t for t in client.get("/api/v1/templates").json()}
    assert listed[ELT]["default_preset"] == "hier"
    assert [p["id"] for p in listed[ELT]["presets"]] == ["equal", "hier", "econ", "tech", "enviro"]
    assert listed[AMAZON]["criteria"][0] == {
        "id": "monthly_sales",
        "name": {"zh": "预估月销量", "en": "Est. monthly sales"},
        "type": "numeric",
        "group_id": "demand",
    }


# --- Matching tables ----------------------------------------------------------------------------


def test_normalize_ignores_case_spaces_and_punctuation():
    assert normalize("  Profit  Margin (%) ") == "profit margin"
    assert normalize("利润率（%）") == "利润率"


def test_match_columns_by_alias_once_per_criterion():
    headers = {0: "Product", 1: "月销量", 2: "Margin (%)", 3: "利润率", 4: "MOQ", 5: "Colour"}
    assert match_columns(get_template(AMAZON), headers) == {1: "monthly_sales", 2: "margin", 4: "moq"}


CSV = (
    "产品,月销量,利润率（%）,尺寸,颜色\n"
    "Mat,1800,28,standard,red\n"
    "Lamp,2600,22,oversize,blue\n"
    "Box,900,31,standard,green\n"
).encode()


def inspect(client, data: bytes = CSV):
    files = {"file": ("products.csv", data)}
    return client.post("/api/v1/tables/inspect", params={"template_id": AMAZON}, files=files).json()


def build(client, inspection: dict, language: str = "zh"):
    columns = [
        {"index": c["index"], "type": c["detected_type"], "template_criterion": c["template_criterion"]}
        for c in inspection["columns"]
        if c["index"] != inspection["name_column"]
    ]
    request = {
        "rows": inspection["rows"],
        "header_row": inspection["header_row"],
        "name_column": inspection["name_column"],
        "columns": columns,
        "template_id": AMAZON,
        "language": language,
    }
    response = client.post("/api/v1/tables/build", json=request)
    assert response.status_code == 200, response.json()
    return response.json()


def test_inspect_suggests_template_criteria(client):
    inspection = inspect(client)
    assert [c["template_criterion"] for c in inspection["columns"]] == [
        None,
        "monthly_sales",
        "margin",
        "size_tier",
        None,
    ]


def test_build_with_template(client):
    project = build(client, inspect(client))
    by_id = {c["id"]: c for c in project["criteria"]}
    assert list(by_id) == ["monthly_sales", "margin", "size_tier", "c4"]
    assert by_id["monthly_sales"]["value_function"]["kind"] == "log"
    assert by_id["size_tier"]["categories"] == [{"label": "大件", "score": 0}, {"label": "标准尺寸", "score": 1}]
    assert project["data"]["size_tier"] == {"a1": "标准尺寸", "a2": "大件", "a3": "标准尺寸"}
    assert by_id["c4"]["name"] == "颜色" and by_id["c4"].get("group_id") is None
    assert [g["id"] for g in project["groups"]] == ["demand", "profit", "risk"]
    assert project["weighting"]["groups"]["order"] == [["profit"], ["demand"], ["risk"]]
    assert [k["criterion_id"] for k in project["constraints"]] == ["margin"]
    assert project["meta"]["template_id"] == AMAZON
    assert project["source"]["column_map"]["criteria"]["margin"] == 2
    assert client.post("/api/v1/projects/evaluate", json=project).status_code == 200


def test_unknown_category_labels_keep_the_tables_own(client):
    data = CSV.replace(b"standard", b"S").replace(b"oversize", b"XL")
    project = build(client, inspect(client, data))
    size = next(c for c in project["criteria"] if c["id"] == "size_tier")
    assert sorted(c["label"] for c in size["categories"]) == ["S", "XL"]
    assert client.post("/api/v1/projects/validate", json=project).status_code == 200
