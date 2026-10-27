# 0008 /api/v1 allows breaking changes until the first official release

- Status: Accepted
- Date: 2026-10-23

## Context

ADR 0004 requires adding `/api/v2` for breaking changes. However, the MVP will change the interface substantially (from the "problem" model to the "project" model), and currently only our own frontend uses this API.

## Decision

- Before v0.1.0 is released, `/api/v1` may have breaking changes. The frontend, `openapi.json` and the generated types are all updated together in the same repository, and CI checks that they are consistent.
- The old endpoints (`/problems/*`, `/evaluate`, `/pareto`, `/sensitivity/stability`, `/export/*`) are removed after the frontend migration is complete and before v0.1.0 is released.
- From v0.1.0 on, `/api/v1` is frozen and allows only compatible changes (new fields, new endpoints). Breaking changes go to `/api/v2`.
- Once released with v0.1.0, error codes are no longer renamed or removed.

## Consequences

- There is no need to maintain two sets of interfaces during the MVP.
- Before v0.1.0, no external user should depend on this API. The README will state this.
