"""Built-in templates (/api/v1/templates/*), see docs/design/s7-templates.md."""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel

from mcda_core.project import Project
from mcda_core.templates import Language, Text, get_template, template_project, templates

from .routes import ERRORS, compute

router = APIRouter(prefix="/api/v1/templates", tags=["templates"], responses=ERRORS)


class TemplateCriterionInfo(BaseModel):
    id: str
    name: Text
    type: Literal["numeric", "ordinal", "categorical", "boolean"]
    group_id: str | None


class NamedInfo(BaseModel):
    """A group or weight preset."""

    id: str
    name: Text


class TemplateInfo(BaseModel):
    id: str
    domain: str
    name: Text
    description: Text
    terms: dict[str, Text]
    currency: str | None
    groups: list[NamedInfo]
    criteria: list[TemplateCriterionInfo]
    presets: list[NamedInfo]
    default_preset: str | None
    has_example: bool


@router.get("", response_model=list[TemplateInfo])
def list_templates() -> list[TemplateInfo]:
    return [
        TemplateInfo(
            id=t.id,
            domain=t.domain,
            name=t.name,
            description=t.description,
            terms=t.terms,
            currency=t.currency,
            groups=[NamedInfo(id=g.id, name=g.name) for g in t.groups],
            criteria=[
                TemplateCriterionInfo(id=c.id, name=c.name, type=c.type, group_id=c.group_id) for c in t.criteria
            ],
            presets=[NamedInfo(id=p.id, name=p.name) for p in t.presets],
            default_preset=t.default_preset,
            has_example=t.example is not None,
        )
        for t in templates().values()
    ]


@router.get("/{template_id}/project", response_model=Project)
def project_from_template(
    template_id: str,
    language: Annotated[Language, Query()] = "en",
    example: Annotated[bool, Query()] = True,
    preset: Annotated[str | None, Query()] = None,
) -> Project:
    """A new project from a template: with the example data, or only criteria, groups, weights and conditions."""
    return compute(lambda: template_project(get_template(template_id), language, example=example, preset=preset))
