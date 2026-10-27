# 0002 Calculations are implemented only once, in the Python core

- Status: Accepted
- Date: 2026-10-23

## Context

In the old tool, the JavaScript frontend and the Python scripts each parsed Excel and calculated on their own, and they used inconsistent row-number conventions, so the results could disagree.

## Decision

All calculations (normalization, the various methods, ranking, Pareto, sensitivity analysis) and data parsing are implemented only in the Python package `mcda_core`. `mcda_core` does not depend on a web framework. The API (`mcda_api`) and the frontend only call it and do not reimplement anything.

Derived data the frontend needs (for example the weighted sum and the score contribution of each criterion) is returned by the API; the frontend does not calculate it itself.

## Consequences

- Results have a single source. Calculations can be strictly verified with unit tests and reference data (the old Excel files).
- Every weight adjustment requires an API request. With up to a few hundred alternatives, responses are fast, which is acceptable.
- If offline calculation is needed in the future, compiling the core to WebAssembly can be considered, but a second implementation must not be written in the frontend.
