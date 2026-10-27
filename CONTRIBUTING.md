# Contributing

## Setup

- [uv](https://docs.astral.sh/uv/) (Python dependency management)
- [Node.js](https://nodejs.org/) 24 or newer
- Optional: Docker (to run the same container as in production)

```bash
cd backend && uv sync
```

```bash
cd frontend && npm install
```

We recommend installing the pre-commit checks (only needed once). They automatically check formatting and static issues before every commit:

```bash
uvx pre-commit install
```

## Workflow

1. **Create a short-lived branch from `main`**, for example `feat/value-functions` or `fix/csv-decimal-comma`. `main` must always be usable.
2. **One change does one thing.** Split larger features into several small changes that can be reviewed independently. Hide unfinished features behind feature flags instead of letting branches diverge for a long time.
3. **Write a design note first for larger features**, explaining the problem to solve, the approach and the alternatives that were rejected. Record important architecture decisions in [`docs/adr/`](docs/adr/).
4. **Write tests together with the code** (see below).
5. **Open a pull request.** All CI checks must pass, and it must be reviewed before it can be merged.
6. Update the "Unreleased" section of [`CHANGELOG.md`](CHANGELOG.md) and the related documentation.

## Commit messages

Use the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <short description>
```

Common types: `feat` new feature, `fix` bug fix, `refactor` refactoring, `test` tests, `docs` documentation, `build` build, `ci` continuous integration, `chore` miscellaneous, `style` formatting. For breaking changes, add `!` after the type and write `BREAKING CHANGE:` in the body.

Version numbers follow [Semantic Versioning](https://semver.org/): releases are tagged `vX.Y.Z`.

## Checks and tests

Before opening a pull request, run the same checks as CI locally:

| | Command (run in the corresponding directory) |
|---|---|
| Backend linting and formatting | `uv run ruff check .` and `uv run ruff format --check .` |
| Backend type checking | `uv run pyright` |
| Backend tests and coverage | `uv run pytest --cov` |
| Frontend formatting, linting and types | `npm run format:check`, `npm run lint`, `npm run typecheck` |
| Frontend unit tests | `npm test` |
| End-to-end tests | `npm run test:e2e` (automatically starts the backend and the built frontend) |
| API contract | After changing the API, run `npm run gen:api` and commit `backend/openapi.json` and `frontend/src/api/schema.d.ts` |

Tests come in three layers, fewer the higher you go:

- **Unit tests**: pure logic such as calculation, validation and data conversion; the largest number. Expected results of calculation methods must be verifiable by hand or come from reliable reference data (for example the Excel results in `data/legacy/`).
- **API tests**: the normal and error cases of every API endpoint.
- **End-to-end tests**: only the key user flows.

## Conventions

- **Calculations are implemented only once, in the backend** (`mcda_core`); the frontend does not duplicate calculation logic.
- **Errors are expressed as codes**: when adding an error, first add the code and English text in `backend/src/mcda_core/errors.py`, then add the Chinese and English translations in `frontend/src/i18n/errors.ts`. If a translation is missing, the tests fail.
- **Do not log users' business data.**
- UI text goes in `frontend/src/i18n/`, not directly in components.

## Project structure

See [README.md](README.md#directory-structure).
