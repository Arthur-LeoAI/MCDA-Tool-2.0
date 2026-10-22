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
    from mcda_api.schemas import ProblemModel

    return ProblemModel.from_domain(cars).model_dump(mode="json")
