# Roadmap

> Status: confirmed. M0 and M1 are done; S1–S8 of M2 are done. Next come the pre-release checks and usability testing before v0.1.0.
> Last updated: 2026-10-23

## Goal

Build a **general-purpose multi-criteria decision tool** that e-commerce teams, business decision-makers, and researchers and consultants can all use, **polishing the e-commerce scenario first**.

The approach is one general computation core, plus scenario templates, plus two usage modes:

- **Guided mode**: for users who are not familiar with MCDA;
- **Expert mode**: for researchers and consultants.

## Development principles

Based on Google's published engineering practices (*Software Engineering at Google*, O'Reilly 2020; and [google.github.io/eng-practices](https://google.github.io/eng-practices/)), adopted at the scale of a small team:

1. **Design before code**: each milestone starts with a design document, and implementation begins only after it is confirmed. Important trade-offs are recorded as ADRs (Architecture Decision Records).
2. **Small commits, every one reviewed**: one change does one thing; every change goes through a branch and a Pull Request, and is merged only after CI passes and it has been reviewed.
3. **Trunk-based development**: `main` always stays usable. Branches live only briefly; unfinished features are hidden behind feature flags.
4. **Test pyramid**: many unit tests, a moderate number of API tests, and a few end-to-end tests covering the key user flows.
5. **Build one complete feature at a time**: each feature is finished end to end, from the computation core and API to the UI and tests, rather than "write all the backend first, then all the frontend".
6. **Measurable**: every milestone has clear completion criteria.

---

## First question: should the first three phases be improved first?

**What needs work is the engineering foundation and the data model, not UI polish.** There are three reasons:

- **No quality safeguards**: there is no CI, no static analysis or type checking for the Python code, and no end-to-end tests. The more features there are, the harder regressions become to catch.
- **The data model needs an upgrade**: the phase 4 features need criterion types, value functions, criterion groups, hard constraints and multiple weight scenarios. The current "matrix + weights" model cannot hold these, so the v2 model must be designed first. Otherwise every new feature means rework.
- **The API needs to be settled**:
  - add the version prefix `/api/v1`;
  - change error messages to "error code + parameters", translated by the frontend (currently the server returns English sentences directly);
  - project files need a format version so old files can be migrated automatically later.

UI polish, the landing page and similar work go into M4.

---

## Milestones

| Milestone | Content | Outcome |
|---|---|---|
| **M0** ✅ | Engineering foundation | CI, code conventions, API v1, error codes, end-to-end tests |
| **M1** ✅ | Design | PRD, technical design document, ADRs, confirmed by you |
| **M2** | **MVP** | The complete e-commerce product selection flow works; tag v0.1.0 and **push to GitHub** |
| **M3** | Feature expansion | All remaining extended features, released one by one as v0.2, v0.3 … |
| **M4** | Productization and launch | Accounts, cloud deployment, landing page, compliance (only after the value is validated) |
| **M5** | External integrations (optional) | Amazon SP-API, Google Sheets, etc. |

---

### M0 Engineering foundation

| Item | Content |
|---|---|
| Git workflow | Feature branches plus Pull Requests; Conventional Commits for commit messages; SemVer version tags; maintain `CHANGELOG.md` |
| Backend quality | ruff (linting and formatting), pyright (type checking), pytest coverage reports |
| Frontend quality | The existing oxlint, tsc and Vitest, plus Prettier formatting |
| End-to-end tests | Playwright: import → set weights → view results → export, running against the real frontend and backend |
| CI | GitHub Actions: every Pull Request runs the backend checks, frontend checks and end-to-end tests, and checks that the API types match the backend (types generated from OpenAPI must not be stale) |
| Pre-commit checks | pre-commit hooks that catch formatting and static analysis issues locally ahead of time |
| API | Prefix changed to `/api/v1`; errors unified as `{code, params, location}`, translated by the frontend; every request carries a request ID; structured logging |
| Dependency management | Dependabot proposes dependency upgrades automatically |
| Development environment | `docker compose up` starts the frontend and backend with one command, which also prepares for later deployment |
| Repository docs | LICENSE, CONTRIBUTING, SECURITY, `docs/adr/` |

**Completion criteria**: CI passes; any change that would break existing functionality is stopped by CI at the Pull Request stage.

### M1 Design documents (confirm first, then write code)

1. **PRD**
   - **User personas**: e-commerce operations or product selection staff, business analysts, researchers and consultants
   - **Core user flow**: centered on e-commerce product selection
   - **MVP scope**, and what is explicitly out of scope
   - **Success metrics**: for example, a new user gets a first explainable conclusion from their own spreadsheet within 10 minutes
2. **Technical design document**
   - **v2 domain model**:
     - a project contains: alternatives, criteria, criterion groups, hard constraints, weight scenarios, analysis settings;
     - each criterion has: a type (numeric, ordinal, yes/no, categorical), unit, direction, value function, missing-value policy, and group.
   - **Analysis pipeline**: raw data → cleaning → hard-constraint screening → value functions → weighted-sum aggregation → robustness analysis → conclusion
   - **Project file format**: JSON with a format version; old-version files can be migrated automatically, including the drafts currently saved in the browser
   - **API v1 interface contract**
   - **Privacy**: in the MVP the server stores no user data. This is the simplest option with regard to GDPR
3. **ADRs**: record key decisions, for example "no account system in the MVP" and "conclusion text is generated from deterministic templates, without calling a large language model"

**Completion criteria**: you review and confirm both documents.

### M2 MVP (v0.1.0)

Delivered one complete feature at a time, each including the computation core, API, UI and tests:

| ID | Feature | Description |
|---|---|---|
| S1 | Project model v2 | New data structure; project files can be saved and opened; old drafts are migrated automatically |
| S2 | Data preparation | Import any xlsx/csv: choose the sheet and header row; specify which column holds the alternative names, which are criteria and which are ignored; detect data types automatically; map text grades to scores; set missing-value policies; generate a **data quality report** (missing values, outliers, constant columns) |
| S3 | Value functions and hard constraints | Value functions support linear, target range, threshold and step, and logarithmic, with a live curve preview. Hard constraints (such as rating ≥ 4.0) screen out alternatives before scoring and explain why each alternative was excluded |
| S4 | Criterion groups and weight guidance | One level of criterion groups; three ways to set weights: direct input, rank by importance and convert automatically (ROC or Rank-Sum method), and pairwise comparison (AHP, with a consistency check) |
| S5 | Robustness analysis | Monte Carlo simulation: sample around the current weights or across the whole weight space, giving each alternative's probability of reaching each rank and its probability of ranking first |
| S6 | Conclusion page and report v2 | Conclusions in plain language (generated from deterministic templates): which alternative is recommended, why, where it beats the runner-up, and how reliable the conclusion is. The report records the full data processing and settings |
| S7 | Template system | Template file format, plus two built-in templates: **Amazon product selection** (flagship scenario) and **technology assessment** (based on the legacy ELT data) |
| S8 | Guided mode and expert mode | New guided wizard; the existing five pages are kept as expert mode |

**Completion criteria**:
- The flagship scenario "Amazon product selection" is covered by end-to-end tests;
- Someone who has never used the tool can complete the whole flow on their own by following the documentation;
- The documentation is updated;
- Tag v0.1.0 and push to GitHub. **There will be one more confirmation before pushing.**

### M3 Feature expansion (from v0.2, each released separately)

| Feature | Description |
|---|---|
| Scenario comparison | Compare multiple weight sets (for example a boss version and an operations version) side by side, highlighting ranking differences |
| Group decisions | Several people each give weights or scores, which are then aggregated (for example by taking the geometric mean of AHP results), showing where they disagree |
| Objective weighting | Entropy weighting, CRITIC. The UI states clearly that such weights reflect how much the data varies, not importance |
| More methods (expert mode) | VIKOR, PROMETHEE II; compare the rankings of different methods and compute their correlation coefficients (Kendall τ, Spearman) |
| Multi-level criteria | Criterion groups can have multiple levels; full support for the legacy Hier hierarchical weight scenarios |
| Template library | New templates: supplier selection, SKU prioritization, shipping method, marketplace expansion, software selection, site selection, project prioritization, sustainability assessment; users can define their own templates and import and export them |
| Reproducibility | Export a "reproducibility package" (data, settings, version numbers); reports include a methods description and references |
| Multiple languages | Add German; translate all messages returned by the server |
| Accessibility | Meet WCAG 2.1 AA; dark mode |

### M4 Productization and launch (only after the value is validated)

- **Accounts and collaboration**: account system, saving projects on the server (PostgreSQL), share links, teams and permissions
- **Public presence**: landing page, a unified design system, documentation site, case library
- **Deployment**: Docker, cloud servers in an EU region, HTTPS, backups, monitoring, error tracking, privacy-respecting analytics
- **Compliance (Germany)**: Impressum (under the Digital Services Act, DDG); privacy policy; a data processing agreement (AVV) is required if processing data on behalf of business customers
- **Staged launch**: internal use first → small invite-only beta → public release

### M5 External integrations (optional)

- Amazon SP-API: import sales and fee data from one's own store. Requires registering as a developer first
- Google Sheets import and export
- A public API with API keys, so other programs can call it

---

## Development process for each feature

1. Write a one-page design note: what problem it solves, how, and which alternatives were considered
2. Write tests together with the code
3. Split into small Pull Requests, with CI passing
4. Review: I review it myself first, then ask you to confirm
5. Merge into `main`; unfinished parts are hidden behind feature flags
6. Update the CHANGELOG and documentation

## Open decisions for you

| Item | Options | Decide by |
|---|---|---|
| ~~License~~ | **Decided: Apache-2.0** | M0 |
| ~~GitHub repository~~ | **Decided: the new code replaces the contents of MCDA-Tool-2.0; the old code stays at tag `v1-legacy`** | Before the M2 push |
| Whether the MVP includes German | Yes, or move it to M3 | M1 |
