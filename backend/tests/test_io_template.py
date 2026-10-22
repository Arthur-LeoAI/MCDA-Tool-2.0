import io

import numpy as np
import openpyxl
import pytest

from mcda_core import Direction, ProblemValidationError
from mcda_core.io import parse_rows, read_problem, write_problem


@pytest.mark.parametrize("suffix", [".xlsx", ".csv"])
def test_round_trip(cars, tmp_path, suffix):
    path = tmp_path / f"problem{suffix}"
    write_problem(cars, path)
    loaded = read_problem(path)
    assert loaded.alternatives == cars.alternatives
    assert loaded.criteria == cars.criteria
    np.testing.assert_array_equal(loaded.matrix, cars.matrix)


def test_semicolon_csv_with_decimal_comma(tmp_path):
    path = tmp_path / "de.csv"
    path.write_text(
        "Criterion;Leistung;Preis\nDirection;max;min\nWeight;0,6;0,4\nA;100;30,5\nB;150;50\n",
        encoding="utf-8",
    )
    problem = read_problem(path)
    assert problem.weights.tolist() == [0.6, 0.4]
    assert problem.directions == (Direction.BENEFIT, Direction.COST)
    assert problem.matrix[0, 1] == 30.5


def test_prefers_decision_sheet(cars, tmp_path):
    path = tmp_path / "book.xlsx"
    write_problem(cars, path)
    workbook = openpyxl.load_workbook(path)
    workbook.create_sheet("Notes", 0)["A1"] = "free text"
    workbook.save(path)
    assert read_problem(path).alternatives == cars.alternatives


def test_trailing_empty_rows_and_columns_are_ignored():
    rows = [
        ["Criterion", "c1", None],
        ["Direction", "benefit", None],
        ["Weight", 1, None],
        ["A", 1, None],
        [None, None, None],
        ["B", 2, ""],
    ]
    assert parse_rows(rows).alternatives == ("A", "B")


def test_errors_point_to_cells():
    rows = [
        ["Criterion", "c1", "c2"],
        ["Direction", "benefit", "sideways"],
        ["Weight", "heavy", 1],
        ["A", 1, "n/a"],
        [None, 2, 3],
    ]
    with pytest.raises(ProblemValidationError) as excinfo:
        parse_rows(rows)
    locations = {issue.location for issue in excinfo.value.issues}
    assert {"C2", "B3", "C4", "A5"} <= locations


def test_wrong_labels_are_reported():
    rows = [["Name", "c1"], ["Direction", "benefit"], ["Weights", 1], ["A", 1], ["B", 2]]
    with pytest.raises(ProblemValidationError) as excinfo:
        parse_rows(rows)
    assert {issue.location for issue in excinfo.value.issues} == {"A1", "A3"}


def test_unsupported_file_type(tmp_path):
    with pytest.raises(ValueError, match="unsupported"):
        read_problem(tmp_path / "data.json")


@pytest.mark.parametrize("suffix", [".xlsx", ".csv"])
def test_round_trip_through_streams(cars, suffix):
    buffer = io.BytesIO()
    write_problem(cars, buffer, suffix=suffix)
    buffer.seek(0)
    assert read_problem(buffer, suffix=suffix).criteria == cars.criteria


def test_streams_need_a_suffix(cars):
    with pytest.raises(ValueError, match="suffix"):
        read_problem(io.BytesIO(b""))
    with pytest.raises(ValueError, match="suffix"):
        write_problem(cars, io.BytesIO())


def test_windows_codepage_csv(tmp_path):
    path = tmp_path / "excel.csv"
    path.write_bytes("Criterion;Größe\nDirection;max\nWeight;1\nÄ;1\nÖ;2\n".encode("cp1252"))
    problem = read_problem(path)
    assert problem.criterion_names == ("Größe",)
    assert problem.alternatives == ("Ä", "Ö")
