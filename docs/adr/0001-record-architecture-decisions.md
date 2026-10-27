# 0001 Record architecture decisions

- Status: Accepted
- Date: 2026-10-23

## Context

The project will run over several milestones. The code alone does not show why a design was chosen or which alternatives were considered at the time. Later changes then easily reopen old discussions or unintentionally overturn existing trade-offs.

## Decision

Important architecture decisions are recorded as ADRs (architecture decision records) in `docs/adr/`, numbered sequentially, one file per decision. The format is: Context, Decision, Consequences.

The content of an accepted ADR is not changed anymore. When a decision changes, a new ADR is written and the status of the old one is changed to "Superseded by NNNN".

## Consequences

- New team members can understand past trade-offs.
- Writing ADRs takes a little extra work, so only decisions with a broad impact that are hard to reverse are recorded.
