# 0006 Project file format: versioned JSON, without calculation results

- Status: Accepted
- Date: 2026-10-23

## Context

The server does not store data (ADR 0003), so users can only save their work in the browser or in a file. This file must remain openable over the long term, be shareable with others, and fully reproduce the results obtained at the time.

## Decision

- The format is UTF-8 JSON with the extension `.mcda.json`; the top level is `{"format": "mcda-project", "version": N, ...}`.
- Alternatives, criteria, groups and hard constraints reference each other by stable `id`s, so names can be changed freely.
- Raw data is stored as is (numbers, text, yes/no, empty values), and processing settings are stored separately. Changing settings therefore does not lose raw data.
- **The file does not store calculation results**. Results are recalculated when a project is opened, which ensures they depend only on "data + settings + program version". The file records `app_version` for verification.
- When the format is upgraded, a migration step is added in `mcda_core.project.migrate` (v1 → v2 → …). Files of older versions must always remain openable. Drafts left in the browser by version 3 count as v1.
- A JSON Schema (`backend/project.schema.json`) is exported from the Pydantic models, and CI checks that it is up to date.

## Consequences

- Files can be opened in a text editor and are well suited for Git.
- Opening a large project requires recalculation, but at MVP scale this is fast (the PRD's performance requirements).
- Every format change requires migration code and tests.
