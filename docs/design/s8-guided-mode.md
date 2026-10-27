# S8 design note: guided mode and expert mode

- Status: done
- Based on: PRD §4 (core user flow), F8.1–F8.3; technical design §6

## Problem

The current five pages are complete, but for users unfamiliar with MCDA they offer too many options: methods, normalization and stability intervals are all laid out together. S8 adds a step-by-step **guided mode**, and keeps the existing pages as **expert mode**. Both modes use the same project, the user can switch at any time, and switching loses no data.

S8 changes only the frontend and needs no new endpoints.

## Modes

- The page header has a "Guided / Expert" switch.
- The mode and the current guided-mode step are stored in the browser (store), not in the project file. The mode is a user preference and does not belong to a project.
- **Default mode**:
  - First-time users get guided mode by default (PRD: P1 and P2 default to guided mode);
  - Users already on the old version (v3 data in the browser) stay in expert mode, so the interface does not change suddenly.
- Technical design §6 planned to hide guided mode during development with a feature flag (`src/flags.ts`). S8 was completed in one go, so no flag is added.

## The seven steps of guided mode

| Step | Content | Reused components |
|---|---|---|
| 1 Scenario | Choose a template (Amazon US product selection, ELT technology assessment) or "Start from blank"; example data can be used directly (jumps to step 4) | Template cards |
| 2 Import | Upload xlsx / csv, or open a project file. Standard templates, legacy workbooks and project files go straight to step 4 | File drop zone |
| 3 Map columns | Columns are mapped automatically using the template chosen in step 1; the user confirms or changes them | Column mapping |
| 4 Check | Number of alternatives and criteria, validation issues, data quality report and suggestions | Issue list, data quality |
| 5 Criteria | For each criterion: note, conversion, curve preview, missing-value handling and hard constraints | Criterion settings |
| 6 Weights | Ranking is recommended by default; pairwise comparison is available when more precision is needed | Weight level cards |
| 7 Conclusion | Conclusion text, confidence, excluded alternatives; download the report, save the project, go to expert mode for a deeper look | Conclusion card, export |

- Each step has a one-sentence explanation at the top and "Back / Next" at the bottom.
- Without a project, only steps 1–3 are available.
- When step 4 has validation errors, "Next" is disabled, with an explanation of what must be fixed first.
- The template's **UI terms** take effect in guided mode: for example, the Amazon template calls alternatives "products" and the ELT template calls them "technologies" (deferred here from S7). Only the explanatory text in guided mode is replaced; expert mode stays unchanged.

## Implementation notes

- New `GuidedApp`: step bar, step content and navigation. Each step is a separate component.
- The weight level part of the "Criteria & weights" page is extracted into `WeightLevels`, shared by expert mode and guided mode.
- The column mapping component gets a new `initialTemplate`: once the template list has loaded, the initial selection is set from the template.
- The store moves to v4, adding `mode`, `guided.step` and `guided.templateId`.

## Verification

- Unit tests: store migration (v3 → expert mode, new user → guided mode), replacement of UI terms.
- End-to-end tests:
  - Flagship flow: choose the Amazon template → import a table whose column names are aliases → automatic mapping → check → criteria → set weights by ranking → see the conclusion → switch to expert mode, and the data is still there;
  - Example data jumps straight to the check step;
  - The existing expert mode tests run in expert mode.
