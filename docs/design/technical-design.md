# Technical Design: MVP (v0.1.0)

- Status: Confirmed (2026-10-23)
- Date: 2026-10-23
- Related documents: [PRD](prd.md), ADR [0005](../adr/0005-value-functions-and-additive-model.md), [0006](../adr/0006-project-file-format.md), [0007](../adr/0007-deterministic-explanations.md), [0008](../adr/0008-api-v1-evolves-until-first-release.md)

## 1. Overview

```
Browser (React)                                    Server (stateless)
┌──────────────────────────────────┐   JSON/HTTP   ┌────────────────────────────────────────────────────┐
│ Guided mode wizard / expert mode │ ────────────▶ │ mcda_api (FastAPI, /api/v1)                        │
│ Project state (zustand)          │ ◀──────────── │   └─ mcda_core                                     │
│ Autosave to localStorage         │               │       ├─ tables      table reading, type detection │
│ Save and open .mcda.json files   │               │       ├─ project     project model v2              │
└──────────────────────────────────┘               │       ├─ pipeline    analysis pipeline             │
                                                   │       ├─ weighting   weights (ranking, AHP)        │
                                                   │       ├─ robustness  Monte Carlo                   │
                                                   │       ├─ explain     conclusion key points         │
                                                   │       └─ (existing)  methods, sensitivity, pareto  │
                                                   └────────────────────────────────────────────────────┘
```

The basic principles are unchanged: calculations are implemented only in `mcda_core` (ADR 0002), the server does not store data (ADR 0003), and all errors are expressed as codes (ADR 0004).

The new core idea: **value functions are the unified data-processing layer** (ADR 0005). All raw data (numbers, levels, categories, yes/no, missing values) is first converted into a 0–1 "value score", and every method computes on value scores. The existing normalization options are all special cases of value functions:

| Existing normalization | Corresponding value function |
|---|---|
| `min_max` | Linear, range taken from the data's minimum and maximum |
| `fixed_range` | Linear, range set by the user |
| `none` (legacy 0–100 data) | Linear, fixed range [0, 100] |

Scaling all criteria by the same factor changes neither the weighted-sum ranking nor the stability intervals, so the comparison tests against the legacy Excel still hold.

## 2. Domain model v2

Every object has a stable `id` (a short string). Names can be changed freely without affecting references.

```
Project
├─ meta: name, description, template_id?, language, created, modified
├─ alternatives: [Alternative{id, name, note?}]
├─ groups: [Group{id, name}]                      (one level of grouping; may be empty)
├─ criteria: [Criterion]
│    Criterion{id, name, group_id?, type, unit?, direction?,
│              value_function, categories?, missing, note?}
├─ data: {criterion_id: {alternative_id: RawValue}}   RawValue = number | string | boolean | null
├─ constraints: [Constraint]
├─ weighting: Weighting
├─ analysis: AnalysisSettings
├─ source?: {filename, kind: "table" | "template" | "legacy", sheet?, header_row?, column_map?, legacy?}
└─ ui?: UI state (current mode, step); not used in calculations
```

### 2.1 Criterion types

| `type` | Raw value | Conversion to value score |
|---|---|---|
| `numeric` | Number | Computed with `value_function` (see §3.3) |
| `ordinal` | Ordered text (e.g. low < medium < high) | `categories: [{label, score}]`, listed in order; by default scores are spread evenly between 0 and 1, with the best level at 1 |
| `categorical` | Unordered text | `categories: [{label, score}]`, scores set by the user |
| `boolean` | Yes/no | When `direction` is benefit, yes = 1 and no = 0; reversed for cost |

### 2.2 Value functions (`numeric` type)

```
ValueFunction =
  | {kind: "linear", direction, bounds: "data" | [low, high]}
  | {kind: "log",    direction, bounds: "data" | [low, high]}       # requires x ≥ 0
  | {kind: "target", lower, ideal_low, ideal_high, upper}           # trapezoid: 1 inside the interval, falls linearly to 0 at the bounds
  | {kind: "piecewise", points: [[x, v], ...]}                      # custom polyline, v ∈ [0, 1]
```

"Threshold" and "step" are presets of `piecewise` in the UI, e.g. `[[t, 0], [full, 1]]`.

### 2.3 Missing-value handling (`missing`)

| Value | Meaning |
|---|---|
| `worst` (default) | Value score is 0; the most conservative option |
| `mean` | Takes the mean value score of the other alternatives on this criterion (averaged on value scores, not on raw values) |
| `exclude` | Excludes this alternative and records the reason |
| `require` | Any missing value raises a validation error, asking the user to fill it in |

### 2.4 Hard constraints

```
Constraint =
  | {id, criterion_id, op: ">=" | "<=" | ">" | "<", value: number}
  | {id, criterion_id, op: "between", low, high}
  | {id, criterion_id, op: "in", labels: [string]}       # levels, categories, yes/no
  | {id, criterion_id, op: "present"}                    # must not be missing
```

Hard constraints apply to **raw values**. If the value a constraint refers to is missing, the constraint counts as not met, unless `allow_missing: true` is set.

### 2.5 Weights

```
Weighting{
  groups?:  LevelWeighting           # weights between groups (when groups exist)
  within:   {group_id | "_root": LevelWeighting}
}
LevelWeighting =
  | {method: "direct", weights: {id: number}}
  | {method: "rank",   order: [[id, ...], ...], formula: "roc" | "rank_sum"}   # inner arrays denote ties
  | {method: "ahp",    comparisons: {"i|j": number}}                          # Saaty 1–9 scale and its reciprocals
```

Final (global) weights: w_j = W_g(j) · w_{j|g}, then normalized to sum to 1. Without groups, only the `_root` level exists.

Each level keeps **the inputs of all methods** (e.g. both the ranking and the directly entered weights are saved), so users do not lose earlier input when switching methods; the `method` field determines which method is currently used.

### 2.6 Analysis settings

```
AnalysisSettings{
  methods: [MethodSpec]                    # default [weighted_sum]; expert mode can add TOPSIS, CP
  robustness: {mode: "around" | "unknown", spread: 0.2, samples: 5000, seed: 1}
  stability_scope: "full_order" | "top1"
}
```

## 3. Analysis pipeline

```
Raw data ─▶ ① Type parsing ─▶ ② Hard constraints ─▶ ③ Missing values ─▶ ④ Value functions ─▶ Value matrix V (m alternatives × n criteria, values in [0,1])
                                                                                                  │
Weight settings ─────────────────────▶ ⑤ Global weights w ──────────────────────────────────────┤
                                                                                                  ▼
                                   ⑥ Methods (weighted sum; TOPSIS, CP optional in expert mode) ─▶ Scores and ranking
                                   ⑦ Robustness analysis (Monte Carlo) ─▶ Rank probabilities
                                   ⑧ Conclusion key points ─▶ Frontend generates text from templates
```

1. **Type parsing**: parses raw values into the corresponding type. Parsing accepts forms such as "$1,234.5", "15%" and "1.234,5" (European format); values that cannot be parsed are reported as data quality issues.
2. **Hard constraints**: alternatives that fail a constraint are moved to the "excluded" list, recording which constraint was violated. Later steps only process the remaining alternatives (eligible alternatives).
3. **Missing values**: `exclude` excludes the alternative; `require` raises an error; `worst` and `mean` fill in value scores after step 4.
4. **Value functions**: with `bounds: "data"`, the range is the minimum and maximum of the **eligible alternatives** on this criterion. If all values are equal, all value scores are 1 (the criterion cannot distinguish alternatives, and the UI shows a notice).
5. **Global weights**: see §3.2.
6. **Methods**:
   - Weighted sum: S_i = Σ_j w_j · V_ij, displayed multiplied by 100, i.e. a 0–100 score; the per-criterion score contributions w_j · V_ij are also returned.
   - TOPSIS and CP compute directly on V (V is already a "larger is better" [0,1] score).
   - Expert mode keeps "classic TOPSIS (raw data, vector normalization)", provided all criteria are numeric and all use linear value functions.
   - Weight stability intervals and Pareto analysis are also computed on V.

### 3.1 Value function formulas

Let the range be [a, b], the raw value x, and the value score v ∈ [0, 1]; all results are clamped to [0, 1].

- **Linear**: for benefit, v = (x − a) / (b − a); for cost, v = (b − x) / (b − a). When a = b, v = 1.
- **Logarithmic**: first transform each value to L(x) = ln(1 + x), then apply the linear formula on [L(a), L(b)]. Requires x ≥ 0.
- **Target interval**: v = 1 when x is in [ideal_low, ideal_high]; rises linearly from 0 to 1 between [lower, ideal_low]; falls linearly from 1 to 0 between [ideal_high, upper]; v = 0 outside [lower, upper].
- **Custom polyline**: linear interpolation between adjacent points; before the first point, takes the first point's value; after the last point, takes the last point's value. Points must be sorted by x, and x values must not repeat.

### 3.2 Weight formulas

- **ROC (Rank Order Centroid)**: the weight of the item ranked r-th (1 = most important) among n items is
  w_r = (1/n) · Σ_{k=r}^{n} 1/k. Tied items take the average of the ROC weights of the ranks they occupy.
  Example: for n = 3, the weights are 0.6111, 0.2778, 0.1111 (Barron & Barrett, 1996).
- **Rank-Sum**: w_r = 2(n + 1 − r) / (n(n + 1)); ties are likewise averaged.
- **AHP**: pairwise comparisons form a positive reciprocal matrix A (a_ji = 1/a_ij).
  - Weights = principal eigenvector, normalized to sum to 1 (solved by power iteration, convergence threshold 1e-12);
  - Consistency: λ_max is the principal eigenvalue, CI = (λ_max − n)/(n − 1), CR = CI / RI(n);
  - RI uses Saaty's random consistency index: for n = 3 to 10, respectively 0.58, 0.90, 1.12, 1.24, 1.32, 1.41, 1.45, 1.49; for n ≤ 2, CR = 0;
  - When CR > 0.1, a notice says the judgments are inconsistent and points out the most inconsistent comparisons, sorted by |ln(a_ij · w_j / w_i)| in descending order;
  - At most 10 items per level (the number of comparisons is n(n−1)/2; with too many, users struggle to make consistent judgments); beyond that, the UI suggests grouping first.
  - Missing comparisons: the MVP requires every pair to be compared.

### 3.3 Robustness analysis (Monte Carlo)

The value matrix V is held fixed first, and only the weights vary randomly:

- **"Around the current weights"** (default): log-normal perturbation w'_j = w_j · exp(σ · z_j), where z_j follows the standard normal distribution and σ = spread (default 0.2, roughly equivalent to "±20%"), then normalized to sum to 1. Criteria with weight 0 stay at 0.
- **"Weights completely unknown"**: samples from a Dirichlet(1, …, 1) distribution over all criteria with weight greater than 0, i.e. uniform sampling on the weight simplex.

For each sample, the weighted sum is computed and ranks are assigned by competition ranking (ties share a rank).

Output:
- Rank acceptability b_i^r: the share of samples in which alternative i is ranked r-th (the rank acceptability index in SMAA);
- Probability of ranking first: b_i^1, ties for first included;
- Pairwise win probability: P(score of i > score of j).

Implementation: the weight sample matrix (N samples × n criteria) is multiplied by Vᵀ (n × m), fully vectorized. N is capped at 20 000. Given a `seed`, results are fully reproducible (using `numpy.random.default_rng(seed)`).

**Confidence levels** (this is our own product rule, not a standard from the literature): a probability of ranking first ≥ 0.8 is "high", 0.5–0.8 is "medium", < 0.5 is "low". The conclusion also shows the exact probability.

### 3.4 Conclusion key points (ADR 0007)

The backend returns only **structured key points**; the text is generated by the frontend from i18n templates:

```
Explanation{
  winner, runner_up, score_gap,                               # 0–100 scale
  top_contributions: [{criterion, contribution}]              # the 3 criteria contributing most to the winner's score
  advantages_vs_runner_up: [{criterion, difference}]          # d_j = w_j(V_winner,j − V_runner,j), the 3 largest positive values
  disadvantages_vs_runner_up: [{criterion, difference}]       # the 3 negative values with the largest absolute value
  confidence: {level: "high" | "medium" | "low", p_best}      # from the robustness analysis
  excluded: [{alternative, constraint_ids, reasons}]
  caveats: [{code, params}]                                   # e.g. imputed_values, constant_criterion, high_ahp_inconsistency
}
```

Only the weighted sum is an additive model, so only it allows "advantages and disadvantages" to be split exactly per criterion. The conclusion page is therefore based on the weighted sum. If another method in expert mode gives a different winner, caveats flag `methods_disagree`.

## 4. Project file format (ADR 0006)

The file extension is `.mcda.json`, UTF-8 encoded JSON:

```json
{
  "format": "mcda-project",
  "version": 2,
  "app_version": "0.1.0",
  "meta": {"name": "2026 Q4 product selection", "template_id": "amazon-us-product-selection", "language": "en",
           "created": "2026-10-23T10:00:00Z", "modified": "2026-10-23T11:30:00Z"},
  "alternatives": [{"id": "a1", "name": "Silicone Baking Mat"}, {"id": "a2", "name": "Bamboo Organizer"}],
  "groups": [{"id": "g1", "name": "Profit"}, {"id": "g2", "name": "Risk"}],
  "criteria": [
    {"id": "c1", "name": "Est. monthly sales", "group_id": "g1", "type": "numeric", "unit": "units",
     "value_function": {"kind": "log", "direction": "benefit", "bounds": "data"}, "missing": "worst"},
    {"id": "c2", "name": "Compliance and certification", "group_id": "g2", "type": "ordinal",
     "categories": [{"label": "none", "score": 1}, {"label": "some requirements", "score": 0.5}, {"label": "certification required", "score": 0}],
     "missing": "worst"}
  ],
  "data": {"c1": {"a1": 850, "a2": 1200}, "c2": {"a1": "none", "a2": "some requirements"}},
  "constraints": [{"id": "k1", "criterion_id": "c3", "op": ">=", "value": 20}],
  "weighting": {"groups": {"method": "rank", "order": [["g1"], ["g2"]], "formula": "roc"},
                "within": {"g1": {"method": "direct", "weights": {"c1": 1}}}},
  "analysis": {"methods": [{"method": "weighted_sum"}],
               "robustness": {"mode": "around", "spread": 0.2, "samples": 5000, "seed": 1}}
}
```

- **Version migration**: `mcda_core.project.migrate(document)` runs v1 → v2 → … in order. Browser drafts of version 3 count as v1 and are converted to v2: numeric type, linear value function (`bounds` determined by the normalization chosen at the time), directly entered weights.
- **Validation**: validated with Pydantic models, with a JSON Schema exported (`backend/project.schema.json`) and checked for being up to date in CI, just like `openapi.json`.
- **Files contain no calculation results**: results are recalculated when a project is opened. This ensures results come only from "data + settings + program version".

## 5. API changes (still under /api/v1, see ADR 0008)

| Endpoint | Purpose |
|---|---|
| `POST /tables/inspect` (file upload, optionally with `?sheet=`) | Reads any xlsx or csv and returns all sheet names, the guessed header row, the type detection result for each column (numeric parse success rate, distinct values, sample values), and all cells (up to 500 rows × 200 columns) |
| `POST /projects/validate` | Validates a project and returns a list of issues and a data quality report |
| `POST /projects/evaluate` | Runs steps 1–6 and step 8 of §3 (without robustness analysis) and returns eligible and excluded alternatives, global weights and weight diagnostics (such as CR), the value matrix, the results of each method, Pareto analysis, and conclusion key points |
| `POST /projects/robustness` | Step 7, provided separately because it is slower |
| `POST /projects/stability` | Computes weight stability intervals on the value matrix |
| `POST /weights/derive` | Computes the weights of one level (ranking or AHP) with diagnostics; called live by the UI |
| `POST /projects/report` | Generates the Excel report (v2 contents, see PRD F6.2) |
| `GET /templates`, `GET /templates/{id}` | Built-in templates |
| `POST /projects/import` | Converts standard templates and legacy V7 workbooks directly into projects |

The existing `/problems/*`, `/evaluate`, `/pareto`, `/sensitivity/stability` and `/export/*`: once the frontend has migrated to the project endpoints, they are **removed before** the v0.1.0 release, to avoid maintaining two sets of endpoints.

**New error codes** (added in frontend and backend at the same time): `unparseable_value`, `unknown_category`, `constraint_criterion_type`, `value_function_invalid`, `log_negative_value`, `piecewise_points_invalid`, `ahp_incomplete`, `ahp_too_many_items`, `weighting_unknown_id`, `all_alternatives_excluded`, `project_version_unsupported`, `sheet_not_found`, `table_too_large`, etc.

## 6. Frontend design

- **State**: store v2 = `project` (exactly the file structure of §4) + `ui` (current mode, step; not used in calculations). zustand's persist feature is upgraded to version 2, and `migrate` converts v1 drafts into projects.
- **Saving**: autosave to localStorage (500 ms delay); above 4 MB, users are prompted to save as a file instead. "Save" downloads a `.mcda.json`; "Open" reads a file, and the backend migrates its version and validates it.
- **Guided mode**: a new wizard component with seven steps: scenario, import, column mapping, review, criteria, weights, conclusion. Each step's UI is a separately testable component and reuses expert mode parts (data table, curve preview, ranking list).
- **Expert mode**: the existing five pages are rebased on the project model, and a new "Data processing" page is added (types, value functions, missing values, hard constraints).
- **New components**:
  - Value function editor: marks each alternative's position on an ECharts curve; polyline points can be dragged;
  - Draggable ranking list: supports keyboard operation and ties;
  - AHP comparison matrix: only the upper triangle needs to be filled in; consistency is shown automatically;
  - Rank probability heat map;
  - Conclusion card.
- **Feature flags**: `src/flags.ts`. Unfinished features (e.g. guided mode) are off by default; during development they can be turned on with `?flags=guided`.
- **Conclusion text**: templates are maintained per language in `i18n/explain.ts`; the input is the structured key points of §3.4, the output is paragraphs.

## 7. Template format

```json
{
  "id": "amazon-us-product-selection", "version": 1, "domain": "ecommerce",
  "name": {"zh": "Amazon 美国站选品", "en": "Amazon US product selection"},
  "description": {"zh": "...", "en": "..."},
  "terms": {"alternative": {"zh": "产品", "en": "Product"}},
  "currency": "USD",
  "groups": [{"id": "profit", "name": {"zh": "盈利", "en": "Profit"}}, ...],
  "criteria": [
    {"id": "monthly_sales", "group_id": "demand", "name": {"zh": "预估月销量", "en": "Est. monthly sales"},
     "aliases": ["monthly sales", "est. monthly sales", "月销量", "销量"],
     "type": "numeric", "unit": "units",
     "value_function": {"kind": "log", "direction": "benefit", "bounds": "data"},
     "missing": "worst", "help": {"zh": "...", "en": "..."}}
  ],
  "constraints": [{"criterion_id": "margin", "op": ">=", "value": 20, "optional": true}],
  "weighting": {"groups": {"method": "rank", "order": [["profit"], ["demand"], ["competition"], ["risk"]]}},
  "example": {"alternatives": [...], "data": {...}}
}
```

**Amazon US product selection** (groups and criteria; all specific values are entered by the user, and the template has no built-in fee schedules):

| Group | Criterion | Type | Direction and value function |
|---|---|---|---|
| Demand | Est. monthly sales | Numeric | Larger is better, logarithmic |
| Demand | Seasonality | Level (stable year-round, moderate, strongly seasonal) | More stable is better |
| Profit | Est. profit margin (%) | Numeric | Larger is better, linear; suggested hard constraint ≥ 20 |
| Profit | Platform and fulfillment fees as share of price (%) | Numeric | Smaller is better, linear |
| Competition | Average review count of top competitors | Numeric | Smaller is better, logarithmic |
| Competition | Average rating of top competitors | Numeric | Smaller is better (a lower rating means more room for improvement in the market); target interval optional |
| Risk | Est. return rate (%) | Numeric | Smaller is better, linear |
| Risk | Size tier (standard size, oversize) | Level | Standard size is better |
| Risk | Compliance and certification difficulty (none, moderate, certification required, e.g. FCC, children's product CPC) | Level | Lower is better |
| Operations | Minimum order quantity | Numeric | Smaller is better, logarithmic |

**Technology assessment (ELT)**: uses the criteria and groups of the legacy V7 data, with linear value functions for all criteria and a fixed range [0, 100]. The group weight presets correspond to the legacy Equal, Econ, Enviro, Tech and Hier scenarios (in the MVP only one of them can be chosen as the current weights; scenario comparison comes in M3).

Template files live in `backend/src/mcda_core/templates/*.json`, are validated with Pydantic models, and have tests confirming that the example data runs through a complete analysis.

## 8. Testing strategy

| Layer | Content |
|---|---|
| Unit tests (core) | Edge cases and hand-calculated values for each value function; known values for ROC and Rank-Sum (e.g. n = 3); AHP: a consistent matrix built from known weights must recover the weights exactly with CR = 0, and a perturbed matrix is used to check CR and the "most inconsistent comparisons"; the RI table; the four missing-value handling options; hard constraints; Monte Carlo: reproducible with a fixed seed, mean weights of about 1/n under "weights completely unknown", dominated alternatives never rank first |
| Regression tests | The legacy V7 comparison tests now run through the new pipeline (linear, fixed range [0, 100]), and results must not change |
| Property tests | Checked with Hypothesis: value scores are always in [0,1]; multiplying all weights by the same factor leaves the ranking unchanged; reordering the alternatives leaves the results unchanged |
| API tests | Normal and error cases for each new endpoint, including error codes |
| Frontend unit tests | Conclusion text templates (Chinese and English), the interaction logic for converting rankings to weights, file version migration |
| End-to-end tests | Flagship flow: choose a template → import the example table → map columns → set weights → view the conclusion → save the project → reopen with identical results; the flow for legacy workbooks in expert mode |
| Performance tests | Run the calculation and Monte Carlo on 100 × 20 data in CI; fail if the PRD targets are exceeded |

## 9. Delivery order and dependencies

```
S1 Project model ─┬─▶ S2 Data preparation ─▶ S3 Value functions and hard constraints ─┐
                  └─▶ S4 Groups and weights ──────────────────────────────────────────┼─▶ S6 Conclusion page and report ─▶ S7 Templates ─▶ S8 Guided mode
                      S5 Robustness analysis (depends only on S1 and the value matrix) ┘
```

- Each feature gets its own branch and is merged separately; unfinished parts are hidden behind feature flags.
- After S1, all existing features switch to the project model, and all existing tests must pass.
- After S6, the old endpoints are removed (§5).
- After S8, the guided mode flag is turned on, all end-to-end tests are run, usability testing is done per PRD §7, and then v0.1.0 is tagged.

## 10. Open questions

1. **What to do when AHP comparisons are missing**: the MVP requires complete comparisons; later, an incomplete-AHP algorithm could fill the gaps.
2. **Multi-level criteria**: deferred to M3. The v2 data structure already leaves room for it; groups only need to be allowed to contain groups.
3. **Large files**: above 500 rows, `tables/inspect` returns only the first 500 rows and notifies the user.
4. **Currency and unit conversion**: not in the MVP; units are for display only.
