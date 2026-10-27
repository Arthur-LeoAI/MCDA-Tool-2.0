# S1 design note: project model

- Status: done
- Based on: [technical design](technical-design.md) §2, §4, §5; ADR 0005, 0006, 0008

## Problem

The frontend and the API currently use a "problem" model: one matrix plus weights. It cannot hold what the later M2 steps need: criterion types, value functions, missing-value handling, hard constraints, groups, and several ways to set weights. S1 moves the whole application to **project model v2** while keeping all existing features unchanged.

## Scope

**What S1 does:**

1. **Project model v2**: `mcda_core/project/`, defined with Pydantic. The fields match technical design §2 exactly. A JSON Schema is exported (`backend/project.schema.json`), and CI checks that it is up to date.
2. **Semantic validation**: unique ids, referenced objects exist, criterion type matches its configuration, value function parameters are valid, data values match the criterion type. Every problem is expressed as an error code with a location.
3. **Version migration** `migrate(document)`:
   - v1 → v2. v1 means the "problem" JSON of version 3: alternatives, criteria, matrix, optionally with the settings of that time.
   - Current version: validated and returned unchanged.
   - Version higher than the program supports: returns `project_version_unsupported`.
4. **Minimal analysis pipeline** (steps 3, 4, 5 and 6 of technical design §3):
   - Value functions: all four are implemented, because they are pure math functions and cheap to implement and test;
   - Score conversion for ordinal, categorical and yes/no criteria;
   - The four missing-value handling options;
   - Directly entered weights (one level only);
   - The calculation methods, Pareto analysis and stability intervals, all computed on the value matrix.
5. **API**: `/projects/migrate`, `/projects/validate`, `/projects/evaluate`, `/projects/stability`, `/projects/import`, `/projects/report`.
6. **Frontend**:
   - Store v2 holds the project; old browser drafts are upgraded automatically through `/projects/migrate`;
   - All pages are switched to the project model;
   - `.mcda.json` files can be saved and opened.

**What S1 does not do** (later steps):

| Feature | Step | What happens if a project already uses it |
|---|---|---|
| Hard constraints | S3 | Evaluation returns `feature_not_available`; they are not silently ignored |
| Groups, rank weights, AHP | S4 | Same as above |
| Parsing numbers written as text (e.g. "$12.99"), column mapping, data quality report | S2 | Numeric criteria must be given as numbers directly |
| Robustness analysis, conclusion points | S5, S6 | — |
| Value function editor UI | S3 | New criteria default to linear with data range; imports set them according to the source |

"Return a clear error instead of silently ignoring" is a deliberate choice: if a project defines a hard constraint and the result does not apply it, the user would be misled.

## Key rules

**Migrating old settings**: In version 3, the normalization of the weighted sum determined the live ranking and the stability intervals. So migration converts it into a linear value function per criterion:

| Old normalization | New value function |
|---|---|
| `min_max` | Linear, range from data |
| `fixed_range` [a, b] | Linear, fixed range [a, b] |
| `none` | Linear, all criteria use the same fixed range [min(0, global minimum), global maximum]. All criteria are scaled by the same factor, so the weighted-sum ranking and the stability intervals stay the same; for legacy V7 data this range is exactly [0, 100] |

Old TOPSIS settings: vector normalization maps to `basis: "raw"` (classic TOPSIS); the other normalizations map to computing on value scores, with the ideal point taken from the data or from fixed values. The same applies to CP.

**Imported files**:
- Standard template: linear, range from data;
- Legacy V7 workbook: linear, fixed range [0, 100]. This removes the earlier need to set the weighted sum to "no normalization".

**Calculation results** identify alternatives and criteria by id and also include their names for display in the frontend.

## Verification

- The existing legacy Excel comparison tests now go through the "import → project → pipeline" path, and the results must match the previous ones (stability interval error < 1e-9).
- Results after v1 → v2 migration must match the results computed with the old model: identical rankings; score error < 1e-12 for `min_max` and `fixed_range`. With `none` the scores change because of the uniform scaling, but the ranking does not.
- End-to-end tests: the existing 4 still pass, plus a new one: "save project → clear → open → same results".
