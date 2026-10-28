# MCDA Decision Analysis Tool (Rewrite)

A Multi-Criteria Decision Analysis (MCDA) tool; a complete rewrite of the original version in this repository. The old version from before the rewrite is kept at the tag [`v1-legacy`](https://github.com/Arthur-LeoAI/MCDA-Tool-2.0/tree/v1-legacy).

All calculations are implemented only once, in the Python calculation core `mcda_core`. The backend API and the frontend only call it, instead of maintaining separate implementations in JS and Python as the old version did.

The website has two pages: the home page `/` introduces the tool, and the tool itself is at `/app`. The tool's code is loaded on demand, so the home page opens faster.

The tool has two modes that work on the same project, and you can switch between them at any time:

- **Guided mode** (default for new users): scenario → import → map columns → check → criteria → weights → conclusion; each step shows only the necessary options;
- **Expert mode**: five pages (data, criteria and weights, results, sensitivity analysis, export), where you can choose methods and view stability intervals and the robustness analysis.

Two templates are built in: Amazon US product selection, and ELT technology assessment (from the old V7 workbook).

## Directory structure

```
backend/              Python backend
  src/mcda_api/       FastAPI service (HTTP API)
    main.py           Application entry point, configuration (CORS, upload size, logging)
    routes.py         General endpoints (/api/v1: health, methods, template) and upload handling
    projects.py       Project endpoints (/api/v1/projects/*)
    tables.py         Recognition and conversion of arbitrary tables (/api/v1/tables/*)
    templates.py      Built-in templates (/api/v1/templates/*)
    schemas.py        Request/response data structures
    errors.py         Uniform error format (error code + parameters + location)
    observability.py  Request IDs and structured logging
    export_openapi.py Exports the API contract openapi.json
  src/mcda_core/
    model.py          Data model: alternatives × criteria matrix, weights, direction (benefit/cost), validation
    normalization.py  Normalization: none / min_max / fixed_range / vector
    methods.py        Weighted sum, TOPSIS, compromise programming (CP)
    ranking.py        Scores → ranks (ties ranked as "1224")
    pareto.py         Pareto dominance analysis
    sensitivity.py    Weight stability intervals (weighted sum; full order / top 1)
    io/template.py    Standard template import and export (.xlsx / .csv)
    io/legacy.py      Reads the old "MCDA ELT V7" workbooks
    io/report.py      Excel report export
    project/          Project model v2: validation, migration, analysis pipeline, value functions, hard constraints, weights,
                      robustness analysis, key conclusion points, report v2 worksheets
    tables/           Arbitrary tables: reading, recognizing the header row and column types, converting into a project
    templates/        Built-in templates (*.json) and column mapping by alias
  scripts/            make_elt_template.py: generates the ELT template from the old workbook
  tests/              Unit tests, API tests, and comparison tests against the old Excel results
  openapi.json        API contract (generated automatically; the frontend types are generated from it)
frontend/             Frontend: React + TypeScript + Vite + ECharts (see frontend/README.md)
  e2e/                Playwright end-to-end tests
data/legacy/          Old V7 workbooks, used as reference data for comparison
docs/
  ROADMAP.md          Roadmap
  data-format.md      Description of the input template format
  adr/                Architecture decision records
.github/              CI workflows and Dependabot configuration
docker-compose.yml    Runs the complete service locally in containers
```

## Quick start

First install [uv](https://docs.astral.sh/uv/) and [Node.js](https://nodejs.org/) (24 or newer).

Open two terminals and start the backend and the frontend separately:

```bash
cd backend && uv sync && uv run uvicorn mcda_api.main:app --reload
```

```bash
cd frontend && npm install && npm run dev
```

Then open http://localhost:5173 .

In the Claude desktop app, `.claude/launch.json` already configures two launch entries, `api` and `web`.

### UI workflow

1. **Data**: upload a standard template or an old V7 workbook (or use the sample data), then edit it directly in the table. Problems such as missing values or duplicate names are reported in real time, with their exact location.
2. **Criteria and weights**: set the direction and weight of each criterion (slider or input box). The weighted-sum ranking is shown live on the right, with rank changes marked relative to the imported state.
3. **Results**: choose the method and the normalization, compare the rankings of the different methods, and view the score chart, rank change chart, weighted-sum score breakdown and Pareto analysis.
4. **Sensitivity analysis**: weight stability interval chart (full order or top 1), and the most sensitive criteria.
5. **Export**: download the Excel report, or export the data as a template.

### Running with Docker

No need to install Python and Node.js; you only need Docker:

```bash
docker compose up --build
```

Then open http://localhost:8080 .

### Static site with calculations in the browser (Cloudflare)

The tool can also run without a server: the same Python code runs in the browser with Pyodide (ADR 0009, [design note](docs/design/browser-engine.md)). Project data then never leave the user's device, and the whole site is static files, which Cloudflare hosts on its free plan.

```bash
cd frontend
npm run build:static    # downloads Pyodide and the packages once, builds into dist-static/
npx vite preview --mode static
```

The first visit downloads about 11 MB and starts Python in the background (about 10 s on a fast PC, longer on slow connections and devices); later visits use the browser cache.

**Deploying to Cloudflare** (done by the repository owner):

1. Create a Cloudflare account (the free plan is enough).
2. In the dashboard: Workers & Pages → Create application → connect the GitHub repository.
3. Root directory `frontend`, build command `npm run build:static`, deploy command `npx wrangler deploy`. `frontend/wrangler.jsonc` serves `dist-static/` with single-page-application routing.
4. Every push to `main` then builds and deploys the site (on the free plan: 3,000 build minutes per month, one build at a time).

### Development

For the development workflow, code conventions, tests and commit conventions, see [CONTRIBUTING.md](CONTRIBUTING.md).

Once the backend is running, open http://127.0.0.1:8000/docs to see the interactive API documentation and try out each endpoint directly.

Configuration via environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `MCDA_CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Frontend origins allowed for cross-origin access, comma-separated |
| `MCDA_MAX_UPLOAD_MB` | `5` | Maximum size of uploaded files |
| `MCDA_LOG_LEVEL` | `INFO` | Log level |
| `MCDA_LOG_FORMAT` | `text` | Log format: `text` for development, `json` for production |

### API overview

The API is **stateless**: the frontend sends the complete project data with every request, and the server stores nothing. The project file format is defined in `backend/project.schema.json`.

The old "problem" endpoints (`/problems/*`, `/evaluate`, `/pareto`, `/sensitivity/stability`, `/export/*`) have been removed (ADR 0008). Until v0.1.0 the API may still change incompatibly; external programs should not rely on it.

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/projects/migrate` | Upgrades a project file of any supported version (or the version 3 problem format) to the current version |
| `POST /api/v1/tables/inspect` | Upload any `.xlsx` / `.csv`: standard templates and old workbooks return a project directly, other tables return the recognized structure; with `template_id`, template criteria are matched by alias |
| `POST /api/v1/tables/build` | Converts a table into a project using the column mapping chosen by the user |
| `POST /api/v1/projects/quality` | Data quality report (missing values, constant columns, extreme values, etc.) |
| `POST /api/v1/projects/import` | Upload a standard template or an old V7 workbook and convert it into a project |
| `POST /api/v1/projects/validate` | Validates a project |
| `POST /api/v1/projects/evaluate` | Calculation: eligible and excluded alternatives, imputed missing values, weights, value scores, results of each method, Pareto analysis, key conclusion points |
| `POST /api/v1/projects/weights` | Local weights of each level (including AHP consistency) and the final weight of each criterion |
| `POST /api/v1/projects/curve` | The value curve of a criterion and the position of each alternative on the curve |
| `POST /api/v1/projects/robustness` | Monte Carlo robustness analysis: rank distribution, probability of ranking first, pairwise win rates, reliability level |
| `POST /api/v1/projects/stability` | Weight stability intervals (based on the weighted sum of value scores) |
| `POST /api/v1/projects/report` | Excel report: conclusion, results, data processing notes, weight sources, stability intervals, Pareto, robustness, and the original data in a re-importable form |
| `GET /api/v1/templates` | List of built-in templates (Amazon US product selection, ELT technology assessment) |
| `GET /api/v1/templates/{id}/project` | Generates a project from a template (optionally with sample data and a weight preset) |
| `GET /api/v1/health` | Health check |
| `GET /api/v1/methods` | Available methods, selectable normalizations and default parameters |
| `GET /api/v1/template` | Downloads the sample template (xlsx / csv) |

All errors are returned in the same format. `code` is a fixed error code that the frontend translates into the user's language; `detail` and `message` are English fallback texts:

```json
{"code": "invalid_problem", "detail": "Invalid decision problem", "params": {},
 "issues": [{"code": "value_not_number", "params": {"value": "n/a"},
             "location": {"kind": "cell", "ref": "C4"},
             "message": "value must be a number, found 'n/a'"}],
 "request_id": "3f2c…"}
```

Every request has an ID (response header `X-Request-ID`), which is also recorded in the logs to make troubleshooting easier. The logs do not record any business data from requests.

In the stability intervals, an upper bound of `null` means that the weight can increase without limit without changing the ranking.

### Calling it directly from Python

```python
from mcda_core import weighted_sum, topsis, compromise_programming, weight_stability_intervals
from mcda_core.io import read_problem

problem = read_problem("my_problem.xlsx")
result = topsis(problem)
print(result.order)                       # from best to worst
print(weight_stability_intervals(problem))
```

## Methods

| Method | Meaning of the score | Default normalization |
|---|---|---|
| `weighted_sum` | Sum of weight × normalized value; higher is better | min_max |
| `topsis` | Relative closeness to the ideal solution (0–1); higher is better | vector (classic TOPSIS) |
| `compromise_programming` | Weighted L_p distance to the ideal point; lower is better; `p` is adjustable (1, 2, ∞) | min_max |

- Criteria support two directions: **benefit (higher is better) and cost (lower is better)**.
- `fixed_range` normalizes using fixed lower and upper bounds (for example the 0–100 scale of the old version). With it, an alternative's score does not change when other alternatives are added or removed.
- Weights are stored as given and normalized to sum to 1 during calculation; this does not affect the ranking.

### Differences from the old tool

- The old TOPSIS and CP always used 100/0 as the ideal point, and treated all criteria as higher-is-better by default. The new version uses the standard definitions and supports criterion directions. Therefore **the same data may produce different TOPSIS/CP scores in the old and new versions**; this is an intentional change. To get the "fixed ideal point" behavior, choose the `fixed_range` normalization.
- The old "CP" actually computed a TOPSIS-like ratio. The new CP is the L_p distance as defined by Zeleny.

## What has been verified

`tests/test_legacy_reference.py` compares against all 10 V7 workbooks in `data/legacy/`:

- The weighted-sum ranking matches the Excel ranking (except for tied alternatives);
- For every criterion with a non-zero weight, the weight stability intervals (raw and normalized values, for both full order and top 1) match the Excel results (relative tolerance 1e-6).

## Roadmap

Done: the calculation core, the FastAPI backend, the React frontend, and the M0 engineering foundation. For further plans see [docs/ROADMAP.md](docs/ROADMAP.md).

## License

[Apache License 2.0](LICENSE)
