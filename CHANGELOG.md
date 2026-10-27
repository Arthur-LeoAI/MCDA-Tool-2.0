# Changelog

This file records all notable changes. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and version numbers follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Website home page**: `/` is an introduction page (how to use it, features, use cases, the two modes, data and privacy), and the tool has moved to `/app`; Chinese and English; guided mode can be opened with sample data directly from the home page. The tool's code is loaded on demand.
- **Guided mode (M2 S8)**:
  - Seven steps: scenario → import → map columns → check → criteria → weights → conclusion, reusing the components of expert mode;
  - When choosing a scenario, the template's sample data can be used directly; after import, columns are mapped automatically according to the selected template;
  - The explanatory texts in guided mode use the template's terminology (for example, the Amazon template calls "alternatives" "products");
  - The page header can switch between guided mode and expert mode, and both modes use the same project; new users default to guided mode, existing users stay in expert mode.
- **Templates (M2 S7)**:
  - Amazon US product selection: 5 groups, 10 criteria (log sales, profit margin, fee share, competition, return rate, size, compliance, minimum order quantity, etc.), a suggested hard constraint "profit margin ≥ 20%", and fictional sample data;
  - ELT technology assessment: the 34 criteria and 7 technologies of the old V7, divided into three groups (technical, economic, environmental); five weight presets Equal, Hier, Econ, Tech and Enviro, matching the weights and rankings of the old workbook;
  - The "Data" page can start from a template (with the sample data or with the settings only); when importing a table, columns can be mapped automatically using the template's Chinese and English aliases;
  - New endpoints: `/api/v1/templates`, `/api/v1/templates/{id}/project`; `/tables/inspect` and `/tables/build` support templates.
- **Conclusion page and report v2 (M2 S6)**:
  - The top of the results page states the conclusion in plain language: which alternative is recommended, which criteria contribute most to its score, its strengths and weaknesses compared with the runner-up, the reliability level, and points to watch out for (ties, missing values, criteria that do not discriminate, inconsistent pairwise comparisons, disagreement between methods, excluded alternatives);
  - The text is generated from fixed templates, one set each in Chinese and English, without calling a large language model (ADR 0007);
  - The Excel report has new worksheets for the conclusion, data processing notes, weight sources and the robustness analysis;
  - `/api/v1/projects/evaluate` adds `conclusion`.
- **Robustness analysis (M2 S5)**:
  - Monte Carlo simulation: sampling around the current weights (with adjustable spread), or uniform sampling over all weight combinations; the number of samples and the random seed can be set, so results are reproducible;
  - Rank distribution, probability of ranking first, mean rank, pairwise win-rate heat map, and the reliability level of the current first place (high, medium, low);
  - New endpoint: `/api/v1/projects/robustness`.
- **Criterion groups and weighting methods (M2 S4)**:
  - Criteria can be organized into one level of groups; final weight = group weight × weight within the group;
  - Each level can use direct input, ranking (ROC or Rank-Sum, ties allowed) or pairwise comparison (AHP, showing the consistency ratio CR and marking the most inconsistent comparison);
  - The inputs of each method are kept when switching methods;
  - New endpoint: `/api/v1/projects/weights`.
- **Value functions and hard constraints (M2 S3)**:
  - Each criterion can be given a scoring method (linear, logarithmic, target range, threshold, piecewise), a value range, category scores and missing-value handling;
  - Value curve preview showing the position of each alternative on the curve;
  - Hard constraints (≥, ≤, >, <, range, one of): alternatives that do not satisfy them are excluded before scoring, and the results page lists the reasons;
  - New endpoint: `/api/v1/projects/curve`.
- **Importing arbitrary tables (M2 S2)**:
  - Automatically recognizes the worksheet, the header row, the column holding the alternative names, and the type of each column (numeric, ordinal level, categorical, yes/no);
  - Understands notations such as "$12.99", "15%", "1.234,5" and "(300)", deciding the decimal separator consistently per column; placeholders such as "-" and "n/a" are treated as missing values;
  - New "map columns" step in the frontend, where type, direction and the order of levels can be adjusted;
  - Data quality report: missing values, constant columns, extreme values, suggested logarithmic curve, all category scores identical;
  - New endpoints: `/api/v1/tables/inspect`, `/api/v1/tables/build`, `/api/v1/projects/quality`.
- **Project model v2 (M2 S1)**:
  - `.mcda.json` project file format and its JSON Schema (`backend/project.schema.json`);
  - Version migration: the version 3 "problem" format and old drafts stored in the browser are upgraded automatically;
  - Analysis pipeline: four ways of handling missing values, four value functions, score conversion for level/category/yes-no values;
  - `/api/v1/projects/*` endpoints: migrate, validate, evaluate, stability, import, report.
- The frontend is now based on the project model: project files can be saved and opened; empty cells may be kept and are treated as "worst"; the data table supports values of the yes/no, level and category types; the weighted sum is displayed on a 0–100 scale.

- Calculation core `mcda_core`: data model and validation (benefit/cost criteria), four normalizations, weighted sum, TOPSIS, compromise programming, Pareto analysis, weight stability intervals; verified against 10 old V7 Excel workbooks.
- Import and export: standard template (.xlsx/.csv, supporting semicolon separators, decimal commas and Windows code pages), old V7 workbooks, Excel report.
- FastAPI backend: import, validation, calculation, Pareto, sensitivity analysis, template and report export.
- React frontend: five steps (data, criteria and weights, results, sensitivity analysis, export); Chinese and English UI.
- Engineering foundation (M0):
  - CI (GitHub Actions): backend checks and tests on Python 3.11 and 3.14, frontend checks and build, API contract consistency, end-to-end tests, Docker image smoke test.
  - ruff, pyright, Prettier, oxlint, pre-commit, Dependabot.
  - Playwright end-to-end tests.
  - Docker image and `docker compose`.
  - Request IDs (`X-Request-ID`) and structured logging (`MCDA_LOG_FORMAT=json`).
  - CONTRIBUTING, SECURITY, ADRs, Apache-2.0 license.

### Changed

- English is the default interface language; Chinese remains available through the language switch, and Chinese column names and values are still recognized on import. Projects and templates default to English.
- All documentation (README, design documents, ADRs, contributing and security notes) is in English.
- New projects enable only the weighted sum by default (ADR 0005); TOPSIS and CP can be turned on in the "Results" page.
- TOPSIS and CP are calculated on value scores by default; classic TOPSIS (raw data + vector normalization) is kept as an optional calculation mode.

- **Breaking**: API paths changed from `/api/*` to `/api/v1/*`.
- **Breaking**: error responses changed to `{code, detail, params, issues, request_id}`. Each issue has an error code, parameters and a structured location, and the frontend is responsible for translation.
- Configuration errors (for example a normalization that does not fit the data) now uniformly raise `McdaError` with an error code.
- `DecisionProblem` accepts a matrix in any array form, and compares equality by object identity.

### Removed

- **Breaking**: the old "problem" endpoints `/problems/validate`, `/problems/import`, `/evaluate`, `/pareto`, `/sensitivity/stability`, `/export/problem`, `/export/report` (ADR 0008). Use `/projects/*` and `/tables/*` instead.
