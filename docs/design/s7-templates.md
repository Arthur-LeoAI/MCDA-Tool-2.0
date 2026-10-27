# S7 design note: templates

- Status: done
- Based on: PRD F7.1–F7.3; technical design §7

## Problem

Currently every project has to set up criteria, conversions, groups and weights from scratch. For common decision scenarios these settings are largely fixed. S7 provides two built-in templates: users can start directly from a template, or have columns mapped automatically by a template when importing their own table.

## Template format

Templates are `backend/src/mcda_core/templates/*.json`, validated with a Pydantic model at startup. Compared with technical design §7 there are three refinements:

- **Categorical and ordinal values** also have Chinese and English names and aliases:
  - Values in the project use the name in the selected language;
  - When importing a table, a value in the table matches if it equals the name or an alias in either language (case-insensitive).
- **Weight presets** (`presets`): each preset is a complete `weighting`. Without presets, `weighting` is used.
- **Hard constraints**: the constraints in a template are all "suggested constraints"; they are added when the project is created, and the user can delete them in the criterion settings. The `optional` field from the technical design is therefore dropped.

**UI terms** (`terms`, for example calling alternatives "products") are only stored in the template for now; replacing the terms in the UI is deferred to S8 guided mode.

## The two built-in templates

**Amazon US product selection** (`amazon-us-product-selection`), following the table in technical design §7:
- 5 groups (demand, profitability, competition, risk, operations), 10 criteria;
- Currency is US dollars;
- Suggested hard constraint: profit margin ≥ 20%;
- Group weights: ranked by importance profitability > demand > competition > risk > operations (ROC), equal within groups.
- All numbers are entered by the user; the template contains no built-in fee schedules.
- The example data is 6 fictional products, for demonstration only; the description says so.

**ELT technology assessment** (`elt-technology-assessment`):
- The 34 criteria and 7 end-of-life tire treatment technologies from the legacy V7 workbook (`data/legacy/MCDA ELT V7_*_G_Top1.xlsx`);
- The legacy data is already converted to 0–100 scores, higher is better, so every criterion is a linear value function with fixed range [0, 100], higher is better.
- Three groups: technical (criteria 1–5), economic (criteria 6–13), environmental (criteria 14–34). The groups are not guessed: the weights of the five legacy scenarios correspond exactly to these three groups:
  - Econ, Tech, Enviro: only the corresponding group has weight, equal within the group;
  - Hier: each of the three groups gets 1/3, equal within groups;
  - Equal: all 34 criteria have the same weight.
- The five scenarios are weight presets; the default is Hier. The example data comes from the Hier_G workbook.
- The template file is generated from the legacy workbooks by `backend/scripts/make_elt_template.py`; the Chinese names of the criteria are written in this script.
- Test check: the ranking computed with the Enviro preset and the example data matches the ranking recorded in the legacy Enviro_G workbook.

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/templates` | Template list: id, domain, name, description, number of criteria, presets |
| `GET /api/v1/templates/{id}/project?language=zh&example=true&preset=hier` | Generates a project from a template. With `example=false` there are only criteria, groups, weights and constraints, with no alternatives |
| `POST /api/v1/tables/inspect?template_id=…` | Additionally returns, for each column, the template criterion matched by alias (`template_criterion`) |
| `POST /api/v1/tables/build` | New `template_id` and `language`; each column can specify `template_criterion` |

When **building a table with a template**:
- Columns mapped to a template criterion use that criterion's id, name, type, unit, conversion, group and note;
- Categorical and ordinal values: if all values in the table match template values, the template's scores are used; otherwise the column's own value order is used;
- Columns not mapped to the template are treated as ordinary criteria and belong to no group;
- Groups, weights and hard constraints keep only the parts related to the criteria actually present;
- `meta.template_id` records the source template.

**Column name matching**: column names and aliases are both normalized first: lowercased, leading and trailing spaces and extra spaces removed, and punctuation removed (parentheses, %, $, #, :). They match only if they are then identical. Each template criterion matches at most one column (the first matching column).

## Frontend

- The start screen of the "Data" page gets a new "Start from a template" option: one card per template, with "Use example data" or "Criteria only (blank)". The ELT template lets the user choose a weight preset.
- At the top of the "Map columns" step a template can be chosen. After choosing, detection runs again, and matched columns show the corresponding template criterion, which can also be changed or cleared manually.
- The criterion note (`note`) is shown in the criterion settings.

## Verification

- Backend: both templates pass validation; the example data runs through a complete analysis (evaluate, robustness, report); the ELT Enviro preset matches the legacy ranking; the global weights of the Equal and Hier presets match the legacy workbooks; column name matching (Chinese and English, punctuation, case); matching and non-matching categorical values; building a table with a template keeps only the criteria present.
- End-to-end test: start from the Amazon template (example data) and see the groups and the conclusion; import a table whose column names are Chinese aliases, choose the Amazon template, and the columns are mapped automatically.
