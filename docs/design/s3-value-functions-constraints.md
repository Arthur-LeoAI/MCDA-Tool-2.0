# S3 design note: value functions and hard constraints

- Status: done
- Based on: PRD F3.1, F3.2; technical design §2.2–2.4, §3.1

## Problem

S1 already implemented four value functions in the backend, but users cannot change them in the UI; every criterion can only use "linear, range from data". Hard constraints exist in the data model, but evaluation reports "not yet available". S3 fills in both parts.

## Backend

**Hard constraints** (pipeline step 2, before missing-value handling):
- Evaluated on raw values:
  - `>=` `<=` `>` `<`: numeric comparison;
  - `between`: both ends inclusive;
  - `in`: the ordinal or categorical value is in the list;
  - `present`: the value must not be missing.
- When the value is missing, the constraint passes if `allow_missing` is set, otherwise it fails.
- An alternative can violate several constraints; all of them are recorded. The exclusion reasons are expressed as error codes:

| Code | Meaning |
|---|---|
| `constraint_failed_compare` | Comparison not satisfied, e.g. "Margin ≥ 20 (actual 18)" |
| `constraint_failed_between` | Not within the given interval |
| `constraint_failed_in` | Value not in the allowed list |
| `constraint_missing` | The value the constraint refers to is missing |

- Alternatives excluded by hard constraints and alternatives excluded because the missing-value handling is "exclude" are merged into one "excluded" list; multiple reasons for the same alternative are grouped together.
- The data range (`bounds: "data"`) is computed from **eligible alternatives** only. In other words, excluded alternatives do not affect the scores of the others.

**Value curve**: `POST /api/v1/projects/curve` (parameters: project and criterion id) returns the data needed to draw the curve:
- x-axis range: covers both the data and the value function parameters, with 5% margin at each end;
- 101 evenly spaced points on the curve;
- The position of each eligible alternative (raw value and value score), plus the raw values of excluded alternatives.

The curve points are computed by the backend; the frontend does not reimplement the value functions (ADR 0002).

## Frontend

On the "Criteria & weights" page, each criterion gets a **Settings** button that expands to show:

- **Numeric criteria**:
  - Conversion: linear, logarithmic, target range, threshold, custom piecewise linear;
  - Direction (linear and logarithmic);
  - Range: from data, or fixed range;
  - The four parameters of the target range;
  - Threshold: values below "start scoring" get 0, values above "full score" get 1; represented as a two-point piecewise line;
  - The points of the piecewise line.
- **Curve preview**: ECharts draws the curve and marks each alternative's position on it.
- **Ordinal and categorical criteria**: the score (0–1) of each value.
- **Missing-value handling**: worst, mean, exclude, require completion.
- **Hard constraints**: add or remove. Numeric criteria can use a comparison or an interval; ordinal and categorical criteria can tick the allowed values; a value can also be required to be present.

The "Results" page lists each excluded alternative and the constraints it violated.

## Verification

- Backend: pass and fail for each constraint type, missing values combined with `allow_missing`, merging multiple reasons, data range computed only from eligible alternatives, curve data.
- End-to-end test: after setting "Margin ≥ 20", alternatives are excluded and the reason is shown; after changing the conversion to logarithmic, both the curve and the ranking change.
