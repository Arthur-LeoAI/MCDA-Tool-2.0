# PRD: MCDA Tool MVP (v0.1.0)

- Status: confirmed (2026-10-23)
- Date: 2026-10-23
- Related documents: [Roadmap](../ROADMAP.md), [Technical design](technical-design.md)

## 1. Problem to solve

People often have to choose among several options against several conflicting criteria: picking products, picking suppliers, picking technical solutions. The most common approach is a scoring sheet in Excel, but this approach has several problems:

1. **Data has to be processed by hand first**: different units (dollars, days, percentages), text grades (high/medium/low), missing values and outliers all have to be converted into scores by the users themselves.
2. **Weights are hard to set**: users can say "profit matters more than sales volume", but not "profit 0.35, sales volume 0.25".
3. **Conclusions lack justification**: once the top-ranked option is computed, the sheet cannot answer "why this one?" or "would it still win if the weights changed slightly?".
4. **Hard to reproduce and hand over**: the scoring rules are scattered across formulas, and nobody can follow them after a handover or a few months later.

The existing tool (version 3) already handles computation and presentation, but it requires an **already processed numeric matrix** as input, so ordinary users cannot use it.

## 2. Goals and non-goals

### MVP goals

- **G1**: Users can import the spreadsheets they already have (raw data, including text and missing values) directly and do the data processing inside the tool, without converting it in Excel first.
- **G2**: Users who do not know MCDA get weights through a guided flow, by ranking or pairwise comparison.
- **G3**: Every result comes with a **conclusion in plain language**: what is recommended, why, and how reliable the conclusion is.
- **G4**: The complete e-commerce product selection flow (Amazon US) is polished; the research and consulting scenario (technology assessment) can be done with the same tool.
- **G5**: The whole analysis can be saved as a project file, to be reopened, reproduced or handed to someone else later.

### Non-goals (not in the MVP)

Accounts and cloud storage, multi-user collaboration, multi-level criteria (only one level of groups), aggregating scores from multiple people, comparing multiple weight scenarios, entropy weighting and CRITIC, VIKOR and PROMETHEE, a German UI, and external data sources such as the Amazon SP-API. These are all in M3 to M5 of the roadmap.

## 3. User personas

| Persona | Typical situation | Needs | Does not need |
|---|---|---|---|
| **P1 E-commerce product selection or operations staff** (primary) | Sells on Amazon US and evaluates 10–50 candidate products a month; data comes from Seller Central reports, exports from third-party product research tools, and their own cost estimates | Fast import, sensible defaults, a clear recommendation with reasons, a report they can send to the boss | Method theory, complex parameters |
| **P2 Business analyst** | Supplier selection, software selection, site selection; reports to management | Explainable, traceable, able to show under which conditions the conclusion would change | Academic details |
| **P3 Researchers and consultants** | Technology assessment, sustainability assessment, for example the original ELT project; many indicators, organized in groups | Transparent methods, adjustable parameters, sensitivity analysis, reproducible results, citable reports | Being constrained by guided mode |

P1 and P2 use **guided mode** by default; P3 uses **expert mode** (the five pages of version 3, plus the new features).

## 4. Core user flow (flagship: Amazon US product selection)

1. **Choose a scenario**: on the home page, pick the "E-commerce product selection (Amazon US)" template, or "Start from scratch".
2. **Import data**: upload an xlsx or csv file (for example 30 candidate products with 12 columns each). If the file has several sheets, choose a sheet; the header row is detected automatically.
3. **Map columns**: based on the template, the tool automatically maps columns to criteria, for example "Est. Monthly Sales" to "Estimated monthly sales". The user confirms or changes the mapping and picks the column holding the alternative names; unneeded columns are ignored.
4. **Check data**: the data quality report lists missing values, outliers, constant columns and unrecognized text, each with a suggested fix.
5. **Set up criteria**: the template presets directions, value functions (for example a logarithmic curve for sales volume, meaning "more is better, but with diminishing returns") and hard constraints (for example profit margin ≥ 20%). The user can change them, with a live curve preview.
6. **Set weights**: drag the criteria into order of importance, and the tool computes the weights automatically. For finer control, the user can compare a few criteria pairwise, and the tool flags whether the judgments are consistent.
7. **View the conclusion**: for example, "Product C is recommended, mainly because of its high profit margin and low competition; its advantage over the runner-up, product A, lies mainly in profit margin. It ranks first under 82% of plausible weight combinations. Products F and K were excluded because their profit margin is below 20%."
8. **Dig deeper** (optional): score breakdown, ranking comparison, sensitivity analysis; the user can also switch to expert mode.
9. **Export and save**: download the Excel report, or save the project file (`.mcda.json`).

**Research scenario (P3)**: pick the "Technology assessment" template, or import a legacy V7 workbook directly; create criterion groups (technical, economic, environmental) and set group weights; switch to expert mode to compare different methods, view stability intervals and Monte Carlo results, and export a report with a methods description.

## 5. Functional requirements

Format: ID and requirement, followed by acceptance criteria. S1–S8 match the delivery order in the roadmap.

### S1 Project model and files

- **F1.1** A "project" contains: alternatives, criteria (optionally grouped), raw data, processing settings, hard constraints, weight settings, analysis settings, and data source information.
  - Acceptance: after saving and reopening a project, all settings and results are exactly the same.
- **F1.2** Projects can be saved as `.mcda.json` files, and such files can be opened. The browser saves the current project automatically.
  - Acceptance: refreshing the page loses no work; opening a file in an older format upgrades it automatically.
- **F1.3** Drafts left in the browser by version 3 are migrated to the new project format automatically.

### S2 Data preparation

- **F2.1** Any xlsx or csv file can be imported: choose the sheet, the header row, the column with the alternative names and the columns that serve as criteria; the remaining columns are ignored.
  - Acceptance: even a spreadsheet with note rows, merged titles or extra columns can be mapped within 1 minute.
- **F2.2** The type of each column is detected automatically: numeric, ordinal (ordered text, such as low/medium/high), categorical (unordered text), yes/no.
  - Acceptance: detection results can be changed; numbers written as text are recognized, such as "1,234.5", "$12.99", "15%".
- **F2.3** For ordinal and categorical columns, a score can be set for each value; ordinal columns get evenly spaced scores by order by default.
- **F2.4** For each criterion, a missing-value policy can be chosen: treat as worst (default), treat as average, exclude the alternative, require the value to be filled in.
- **F2.5** Data quality report: for each criterion, the number of missing values, outliers, constant columns (which cannot distinguish alternatives) and unparsable values, with suggestions, for example "sales volume spans three orders of magnitude; a logarithmic curve is recommended".
- **F2.6** Direct import of the standard template and of legacy V7 workbooks remains supported.

### S3 Value functions and hard constraints

- **F3.1** Each numeric criterion has a value function that converts raw values into scores from 0 to 1. Available types:
  - linear: over the data range, or over a user-defined range;
  - logarithmic: diminishing returns;
  - target value or target range: the closer, the better;
  - threshold or step: for example, scoring starts only above a certain value;
  - custom piecewise linear: defined by a number of points.
  - Acceptance: the curve can be previewed live, with the position of each alternative marked on it.
- **F3.2** Hard constraints: numeric comparisons (≥, ≤, between), membership in certain categories, must not be missing. Alternatives that fail a constraint are excluded before scoring.
  - Acceptance: the conclusion page lists every excluded alternative and the constraint it violated.

### S4 Criterion groups and weights

- **F4.1** Criteria can be grouped (one level). Groups have group weights, and criteria have within-group weights; final weight = group weight × within-group weight.
- **F4.2** Three ways to set weights, selectable at each level:
  - **Direct input**: percentages or points;
  - **Ranking**: drag into order of importance, converted to weights automatically with the ROC method, or optionally the Rank-Sum method; ties are allowed;
  - **Pairwise comparison (AHP)**: 1–9 scale, with the consistency ratio CR computed; when CR > 0.1 the tool warns that the judgments are inconsistent and points out the most inconsistent comparisons.
  - Acceptance: every method shows the final weights. Switching from one method to another never silently discards the user's earlier input.

### S5 Robustness analysis

- **F5.1** Monte Carlo simulation has two sampling ranges:
  - "Around the current weights" (default, with an adjustable spread);
  - "Weights completely unknown" (uniform sampling over all possible weight combinations).
- **F5.2** Output: each alternative's probability of reaching each rank, its probability of ranking first, and pairwise win rates (the probability that A beats B).
  - Acceptance: results are reproducible once a random seed is set; the default of 5000 samples finishes within 2 seconds for 100 alternatives × 20 criteria.

### S6 Conclusion page and report

- **F6.1** Conclusions are generated from deterministic templates, without calling a large language model. They include:
  - the recommended alternative;
  - the main reasons: the criteria contributing most to the score;
  - strengths and weaknesses compared with the runner-up;
  - the level of reliability (high, medium, low, with the probability of ranking first);
  - the excluded alternatives and why;
  - data caveats, for example how missing values were handled.
  - Acceptance: the same input always produces the same text; available in both Chinese and English.
- **F6.2** New content in the Excel report: the conclusion, a description of the data processing (types, value functions, missing-value handling, hard constraints), where the weights came from (ranking, AHP and its consistency ratio), and the robustness analysis results.

### S7 Templates

- **F7.1** A template defines: criteria (name, aliases, direction, type, value function, missing-value handling), groups, suggested hard constraints, a suggested importance ranking, UI wording (for example calling "alternatives" "products"), sample data, and descriptions in Chinese and English.
- **F7.2** Two built-in templates:
  - **Amazon US product selection**: currency is US dollars. Criteria include estimated monthly sales, profit margin, competition intensity (review count of the top competitors), platform and fulfillment fee share, size tier, return rate, seasonality, compliance and certification difficulty, and minimum order quantity;
  - **Technology assessment**: based on the legacy ELT data, in three groups: technical, economic, environmental.
- **F7.3** On data import, columns are mapped automatically using the template's aliases (Chinese and English).

### S8 Guided mode and expert mode

- **F8.1** Guided mode is a step-by-step wizard: scenario → import → map columns → check → criteria → weights → conclusion. Each step shows only the necessary options, with explanations.
- **F8.2** Expert mode is the existing five pages plus the new features: choose the method and normalization, view stability intervals, compare the results of different methods.
- **F8.3** Both modes share the same project and the user can switch at any time without losing data.

## 6. Non-functional requirements

| Aspect | Requirement |
|---|---|
| Privacy | The server stores no user data (ADR 0003), and logs do not record business data |
| Performance | For 100 alternatives × 20 criteria, computation requests p95 < 300 ms; Monte Carlo simulation with 5000 samples < 2 s |
| Size limits | 500 alternatives, 200 criteria, 5 MB uploaded file |
| Languages | Chinese and English; all UI text and error messages must be translated |
| Browsers | The two latest major versions of Chrome, Edge, Firefox and Safari; desktop first, usable on tablets |
| Accessibility | Keyboard operation, labeled form fields, sufficient color contrast (full WCAG 2.1 AA in M3) |
| Reproducibility | The same project file with the same version number gives exactly the same results |
| Quality | CI passes; test coverage of the computation modules ≥ 90%; the flagship flow has end-to-end tests |

## 7. Success metrics

| Metric | Target | How it is measured |
|---|---|---|
| Time to first conclusion | Under 10 minutes for a new user with their own spreadsheet | Timed usability tests with 5 people |
| Task completion rate | At least 4 of 5 people complete the flagship flow without help | Same as above |
| Understandable conclusion | Testers can restate the reasons for the recommendation in their own words | Post-test interviews |
| Correctness | All legacy Excel comparison tests pass; each method's formulas are verified by hand calculation or worked examples from the literature | CI |

No usage analytics are collected in the MVP (ADR 0003). You arrange the usability tests with 3–5 target users.

## 8. Risks and open questions

| Risk or question | Mitigation |
|---|---|
| Automatic column type detection gets it wrong | Detection results can always be changed manually; the data quality report clearly flags uncertain detections |
| The template's criteria do not fit the user's actual business | Templates are only a starting point and every setting can be changed; iterate after collecting feedback |
| Users mistakenly think the tool can predict sales | The conclusion page and the documentation state that the conclusion depends on the input data and judgments |
| AHP is too complex for ordinary users | Ranking is the default; AHP is an optional "finer" method |
| The concept of a value function is too abstract | Defaults come from the template and the data; it is explained through the curve preview together with the positions of the alternatives |

## 9. References

- Keeney, R. L. & Raiffa, H. (1976). *Decisions with Multiple Objectives: Preferences and Value Tradeoffs*. Wiley. (value functions, additive value model)
- Saaty, T. L. (1980). *The Analytic Hierarchy Process*. McGraw-Hill. (AHP, consistency ratio)
- Barron, F. H. & Barrett, B. E. (1996). Decision quality using ranked attribute weights. *Management Science*, 42(11), 1515–1523. (ROC weights)
- Lahdelma, R., Hokkanen, J. & Salminen, P. (1998). SMAA – Stochastic multiobjective acceptability analysis. *European Journal of Operational Research*, 106(1), 137–143. (rank probabilities)
