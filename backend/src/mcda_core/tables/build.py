"""Turn an arbitrary table plus the user's column choices into a project."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import PurePath
from typing import Literal

from ..errors import McdaError
from ..model import Direction
from ..project.model import (
    ROOT_LEVEL,
    Alternative,
    Category,
    Criterion,
    LevelWeighting,
    LinearValueFunction,
    Meta,
    Project,
    RawValue,
    Source,
    Weighting,
)
from .detect import Rows, cell
from .parse import as_label, column_decimal_mark, is_blank, parse_boolean, parse_number

CriterionKind = Literal["numeric", "ordinal", "categorical", "boolean"]


@dataclass(frozen=True)
class ColumnSpec:
    """How one table column becomes a criterion."""

    index: int
    type: CriterionKind
    name: str | None = None
    """Defaults to the header text."""
    direction: Direction = Direction.BENEFIT
    categories: Sequence[str] | None = None
    """Ordinal: worst first (scores spread evenly, best = 1). Categorical: all score 1."""


def build_project(
    rows: Rows,
    header_row: int,
    name_column: int,
    columns: Sequence[ColumnSpec],
    *,
    filename: str | None = None,
    sheet: str | None = None,
) -> Project:
    if not columns:
        raise McdaError("table_no_criteria")
    width = max((len(r) for r in rows), default=0)
    for index in [name_column, *(c.index for c in columns)]:
        if not 0 <= index < width:
            raise McdaError("table_column_invalid", index=index)
    if not 0 <= header_row < len(rows):
        raise McdaError("table_header_row_invalid", row=header_row + 1)

    header = rows[header_row]
    body = [r for r in rows[header_row + 1 :] if not all(is_blank(v) for v in r)]
    alternatives = [
        Alternative(id=f"a{i + 1}", name=as_label(cell(r, name_column)) if not is_blank(cell(r, name_column)) else "")
        for i, r in enumerate(body)
    ]

    criteria: list[Criterion] = []
    data: dict[str, dict[str, RawValue]] = {}
    for j, spec in enumerate(columns):
        criterion_id = f"c{j + 1}"
        values = [cell(r, spec.index) for r in body]
        header_text = as_label(cell(header, spec.index)) if not is_blank(cell(header, spec.index)) else ""
        name = (spec.name or header_text or f"#{spec.index + 1}").strip()
        criterion, column = _criterion(criterion_id, name, spec, values)
        criteria.append(criterion)
        data[criterion_id] = {a.id: v for a, v in zip(alternatives, column, strict=True)}

    weights = {c.id: 1.0 for c in criteria}
    return Project(
        meta=Meta(name=PurePath(filename).stem if filename else ""),
        alternatives=alternatives,
        criteria=criteria,
        data=data,
        weighting=Weighting(within={ROOT_LEVEL: LevelWeighting(method="direct", weights=weights)}),
        source=Source(
            filename=filename,
            kind="table",
            sheet=sheet,
            header_row=header_row + 1,
            column_map={
                "name_column": name_column,
                "criteria": {c.id: s.index for c, s in zip(criteria, columns, strict=True)},
            },
        ),
    )


def _criterion(id_: str, name: str, spec: ColumnSpec, values: list[object]) -> tuple[Criterion, list[RawValue]]:
    """The criterion and its raw values. Unreadable cells are kept as text so validation can point at them."""
    if spec.type == "numeric":
        mark = column_decimal_mark(values)
        parsed = [None if is_blank(v) else parse_number(v, mark) for v in values]
        column: list[RawValue] = [
            None if is_blank(v) else (p.value if p is not None else as_label(v))
            for v, p in zip(values, parsed, strict=True)
        ]
        percent = any(p is not None and p.percent for p in parsed)
        criterion = Criterion(
            id=id_,
            name=name,
            type="numeric",
            unit="%" if percent else None,
            value_function=LinearValueFunction(direction=spec.direction, bounds="data"),
        )
        return criterion, column

    if spec.type == "boolean":
        column = [None if is_blank(v) else _boolean_or_text(v) for v in values]
        return Criterion(id=id_, name=name, type="boolean", direction=spec.direction), column

    labels = [None if is_blank(v) else as_label(v) for v in values]
    order = list(spec.categories) if spec.categories else list(dict.fromkeys(v for v in labels if v is not None))
    if spec.type == "ordinal":
        last = max(len(order) - 1, 1)
        categories = [Category(label=label, score=i / last if len(order) > 1 else 1.0) for i, label in enumerate(order)]
    else:
        categories = [Category(label=label, score=1.0) for label in order]
    return Criterion(id=id_, name=name, type=spec.type, categories=categories), list(labels)


def _boolean_or_text(value: object) -> RawValue:
    parsed = parse_boolean(value)
    return parsed if parsed is not None else as_label(value)
