from pathlib import Path

import pytest

from mcda_core import Criterion, DecisionProblem, Direction

LEGACY_DIR = Path(__file__).resolve().parents[2] / "data" / "legacy"


@pytest.fixture
def cars() -> DecisionProblem:
    """Three alternatives, one benefit and one cost criterion."""
    return DecisionProblem(
        alternatives=("A", "B", "C"),
        criteria=(
            Criterion("power", Direction.BENEFIT, 0.5),
            Criterion("price", Direction.COST, 0.5),
        ),
        matrix=[[100.0, 30.0], [150.0, 50.0], [120.0, 30.0]],
    )


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    from mcda_api.main import Settings, create_app

    settings = Settings(cors_origins=["http://localhost:5173"], max_upload_bytes=200 * 1024)
    with TestClient(create_app(settings)) as test_client:
        yield test_client


@pytest.fixture
def cars_json(cars) -> dict:
    """The cars problem in the v1 JSON layout (input of ``/projects/migrate``)."""
    return {
        "alternatives": list(cars.alternatives),
        "criteria": [{"name": c.name, "direction": c.direction.value, "weight": c.weight} for c in cars.criteria],
        "matrix": cars.matrix.tolist(),
    }


@pytest.fixture
def cars_project(cars) -> dict:
    """The cars problem as a v2 project document."""
    from mcda_core.project import project_from_problem

    return project_from_problem(cars).model_dump(mode="json")
