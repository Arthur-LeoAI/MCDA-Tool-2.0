"""Built-in templates (S7, technical design §7): criteria, groups, weights and example data.

Each ``*.json`` file in this package is one template, validated on load.
A template becomes a project in one language; tables can be matched to a
template's criteria by column names and aliases.
"""

from __future__ import annotations

import json
import re
from functools import cache
from importlib import resources
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter

from ..errors import McdaError
from ..model import Direction
from ..project.model import (
    Alternative,
    Category,
    Constraint,
    Criterion,
    Group,
    Id,
    Meta,
    MissingPolicy,
    Project,
    RawValue,
    ValueFunction,
    Weighting,
)

Language = Literal["zh", "en"]


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Text(_Model):
    zh: str
    en: str

    def get(self, language: Language) -> str:
        return self.zh if language == "zh" else self.en


class TemplateCategory(_Model):
    label: Text
    score: float
    aliases: list[str] = []


class TemplateCriterion(_Model):
    id: Id
    group_id: Id | None = None
    name: Text
    aliases: list[str] = []
    type: Literal["numeric", "ordinal", "categorical", "boolean"] = "numeric"
    unit: Text | None = None
    direction: Direction | None = None
    """Only for yes/no criteria."""
    value_function: ValueFunction | None = None
    categories: list[TemplateCategory] | None = None
    """Ordinal: worst first."""
    missing: MissingPolicy = "worst"
    help: Text | None = None


class TemplateGroup(_Model):
    id: Id
    name: Text


class Preset(_Model):
    id: Id
    name: Text
    weighting: Weighting


class ExampleAlternative(_Model):
    id: Id
    name: str


class Example(_Model):
    alternatives: list[ExampleAlternative]
    data: dict[Id, dict[Id, RawValue]]
    """Ordinal and categorical values use the English category label."""


class Template(_Model):
    id: Id
    version: int
    domain: Literal["ecommerce", "research", "business"]
    name: Text
    description: Text
    terms: dict[str, Text] = {}
    """Interface words, e.g. "alternative" -> "product" (used by the guided mode)."""
    currency: str | None = None
    groups: list[TemplateGroup] = []
    criteria: Annotated[list[TemplateCriterion], Field(min_length=1)]
    constraints: list[dict[str, Any]] = []
    """Suggested hard constraints, as in a project but without ids; added to new projects."""
    weighting: Weighting = Weighting()
    presets: list[Preset] = []
    default_preset: Id | None = None
    example: Example | None = None

    def criterion(self, criterion_id: str) -> TemplateCriterion:
        return next(c for c in self.criteria if c.id == criterion_id)

    def preset_weighting(self, preset: str | None) -> Weighting:
        chosen = preset or self.default_preset
        if chosen is None:
            return self.weighting
        for p in self.presets:
            if p.id == chosen:
                return p.weighting
        raise McdaError("template_preset_unknown", preset=chosen)


# --- Loading -------------------------------------------------------------------------------


@cache
def templates() -> dict[str, Template]:
    """All built-in templates by id; each is checked by building its example project."""
    found: dict[str, Template] = {}
    for entry in sorted(resources.files(__name__).iterdir(), key=lambda e: e.name):
        if entry.name.endswith(".json"):
            template = Template.model_validate(json.loads(entry.read_text(encoding="utf-8")))
            found[template.id] = template
    return found


def get_template(template_id: str) -> Template:
    try:
        return templates()[template_id]
    except KeyError:
        raise McdaError("template_unknown", id=template_id) from None


# --- Projects from templates -----------------------------------------------------------------


_CONSTRAINT = TypeAdapter(Constraint)


def _criterion(t: TemplateCriterion, language: Language) -> Criterion:
    return Criterion(
        id=t.id,
        name=t.name.get(language),
        group_id=t.group_id,
        type=t.type,
        unit=t.unit.get(language) if t.unit else None,
        direction=t.direction,
        value_function=t.value_function,
        categories=[Category(label=c.label.get(language), score=c.score) for c in t.categories]
        if t.categories
        else None,
        missing=t.missing,
        note=t.help.get(language) if t.help else None,
    )


def _localized_label(t: TemplateCriterion, value: RawValue, language: Language) -> RawValue:
    """Example values name categories in English; give them in the project's language."""
    if not t.categories or not isinstance(value, str):
        return value
    for c in t.categories:
        if c.label.en == value:
            return c.label.get(language)
    return value


def template_project(
    template: Template, language: Language = "zh", *, example: bool = True, preset: str | None = None
) -> Project:
    """A project with the template's criteria, groups, weights and constraints; with or without example data."""
    criteria = [_criterion(c, language) for c in template.criteria]
    data: dict[str, dict[str, RawValue]] = {}
    alternatives: list[Alternative] = []
    if example and template.example:
        alternatives = [Alternative(id=a.id, name=a.name) for a in template.example.alternatives]
        data = {
            cid: {aid: _localized_label(template.criterion(cid), v, language) for aid, v in column.items()}
            for cid, column in template.example.data.items()
        }
    return Project(
        meta=Meta(
            name=template.name.get(language),
            description=template.description.get(language),
            template_id=template.id,
            language=language,
        ),
        alternatives=alternatives,
        groups=[Group(id=g.id, name=g.name.get(language)) for g in template.groups],
        criteria=criteria,
        data=data,
        constraints=_constraints(template, {c.id for c in criteria}),
        weighting=template.preset_weighting(preset),
    )


def _constraints(template: Template, present: set[str]) -> list[Any]:
    return [
        _CONSTRAINT.validate_python({"id": f"k{n + 1}", **raw})
        for n, raw in enumerate(template.constraints)
        if raw["criterion_id"] in present
    ]


# --- Matching tables to templates --------------------------------------------------------------

# ASCII and full-width brackets, percent signs and colons; built with chr() to keep the source ASCII.
_FULL_WIDTH = "".join(map(chr, (0xFF08, 0xFF09, 0xFF05, 0xFF1A)))
_PUNCTUATION = re.compile("[()" + _FULL_WIDTH + r"\[\]%$#:]")


def normalize(text: str) -> str:
    """Lower case, no punctuation such as brackets, %, $, # and colons, single spaces."""
    return " ".join(_PUNCTUATION.sub(" ", text).lower().split())


def match_columns(template: Template, headers: dict[int, str]) -> dict[int, str]:
    """Column index -> template criterion id, by name or alias; each criterion matches one column at most."""
    keys = {c.id: {normalize(t) for t in (c.name.zh, c.name.en, *c.aliases)} for c in template.criteria}
    matched: dict[int, str] = {}
    taken: set[str] = set()
    for index in sorted(headers):
        header = normalize(headers[index])
        for criterion_id, names in keys.items():
            if criterion_id not in taken and header in names:
                matched[index] = criterion_id
                taken.add(criterion_id)
                break
    return matched


def apply_template(project: Project, template: Template, language: Language, mapping: dict[str, str]) -> Project:
    """Give the criteria in ``mapping`` (project criterion id -> template criterion id) the template's
    settings; add the template's groups, weights and constraints for the criteria that are present."""
    if not mapping:
        return project.model_copy(update={"meta": project.meta.model_copy(update={"template_id": template.id})})
    renamed: dict[str, str] = {}
    criteria: list[Criterion] = []
    data = dict(project.data)
    for criterion in project.criteria:
        target = mapping.get(criterion.id)
        if target is None:
            criteria.append(criterion)
            continue
        t = template.criterion(target)
        new = _criterion(t, language)
        column = data.pop(criterion.id, {})
        if t.categories:
            labels = _category_map(t, column.values(), language)
            if labels is None:  # the table uses its own labels: keep them and their order
                new = new.model_copy(update={"categories": criterion.categories})
            else:
                column = {a: labels.get(str(v), v) if v is not None else None for a, v in column.items()}
        data[t.id] = column
        renamed[criterion.id] = t.id
        criteria.append(new)

    present = {c.id for c in criteria}
    used_groups = {c.group_id for c in criteria if c.group_id}
    ungrouped = [c.id for c in criteria if not c.group_id]
    weighting = _weighting_for(template.preset_weighting(None), present, used_groups, ungrouped)
    source = project.source
    if source is not None and source.column_map:
        column_map = dict(source.column_map)
        column_map["criteria"] = {renamed.get(k, k): v for k, v in column_map.get("criteria", {}).items()}
        source = source.model_copy(update={"column_map": column_map})
    return project.model_copy(
        update={
            "meta": project.meta.model_copy(update={"template_id": template.id, "language": language}),
            "groups": [Group(id=g.id, name=g.name.get(language)) for g in template.groups if g.id in used_groups],
            "criteria": criteria,
            "data": data,
            "constraints": [*project.constraints, *_constraints(template, present)],
            "weighting": weighting,
            "source": source,
        }
    )


def _category_map(t: TemplateCriterion, values, language: Language) -> dict[str, str] | None:
    """Table label -> template label in ``language``, or None if some label has no match."""
    lookup: dict[str, str] = {}
    for c in t.categories or []:
        for name in (c.label.zh, c.label.en, *c.aliases):
            lookup[normalize(name)] = c.label.get(language)
    result: dict[str, str] = {}
    for value in values:
        if value is None:
            continue
        label = lookup.get(normalize(str(value)))
        if label is None:
            return None
        result[str(value)] = label
    return result


def _weighting_for(weighting: Weighting, present: set[str], groups: set[str], ungrouped: list[str]) -> Weighting:
    """The template's weighting, without entries for criteria or groups the table does not have.
    Ungrouped criteria (also unmatched columns) without a direct weight get the mean of the others."""

    def prune(level, known: set[str]):
        return level.model_copy(
            update={
                "weights": {k: v for k, v in level.weights.items() if k in known},
                "order": [kept for tie in level.order if (kept := [i for i in tie if i in known])],
                "comparisons": {k: v for k, v in level.comparisons.items() if set(k.split("|")) <= known},
            }
        )

    upper_known = groups | {"_root"}
    within = {k: prune(level, present) for k, level in weighting.within.items() if k in groups or k == "_root"}
    root = within.get("_root")
    if root is not None and root.method == "direct":
        known = [w for w in root.weights.values() if w > 0]
        mean = sum(known) / len(known) if known else 1.0
        within["_root"] = root.model_copy(update={"weights": {i: root.weights.get(i, mean) for i in ungrouped}})
    return Weighting(
        groups=prune(weighting.groups, upper_known) if weighting.groups and groups else None,
        within=within,
    )
