# S4 design note: criterion groups and weighting methods

- Status: done
- Based on: PRD F4.1, F4.2; technical design §2.5, §3.2

## Problem

Project model v2 already has data structures for groups (`groups`, `criterion.group_id`) and for three ways to set weights (`LevelWeighting`), but evaluation reports "not yet available", and the UI only allows entering weights directly. S4 connects all of it end to end.

## Hierarchy

- Without groups there is one level: `within._root`, containing all criteria.
- With groups there are two levels:
  - **Upper level** (`weighting.groups`): weights between the groups;
  - **Within a group** (`within.<group_id>`): weights between the criteria of one group.
- With groups, criteria not assigned to any group belong to an implicit "ungrouped" group. Its id on the upper level is `_root`, and its within-group weights are stored in `within._root`. This way, when the first group is created, the remaining criteria do not suddenly lose their weights.
- Groups without criteria do not take part in the upper-level weighting.
- Global weight: w_j = W_g(j) · w_{j|g}. Each level is first converted into local weights that sum to 1, so the global weights also sum to 1.

## Three methods per level

Each level stores the inputs of all three methods at the same time; `method` decides which one is used. Switching methods does not delete the inputs of the other methods.

| Method | Input | Conversion |
|---|---|---|
| `direct` | `weights`: a score per item; missing items count as 0 | Divide by the sum; if all are 0, all local weights of this level are 0 |
| `rank` | `order`: from most to least important, inner arrays mean ties; `formula`: `roc` or `rank_sum` | Formulas in technical design §3.2; ties get the average of the ranks they occupy. **Items not in the order** are treated as tied for last, so newly added criteria do not silently get weight 0 |
| `ahp` | `comparisons`: `"i\|j": a`, meaning i is a times as important as j (1/9 to 9) | Principal eigenvector (power iteration), with consistency ratio CR |

AHP rules:
- Either direction of a comparison may be written; `"j|i"` equals 1/a. The same pair may not be written in both directions.
- A level with only 1 item has weight 1 and needs no comparison.
- Every pair must be compared (the MVP does not support incomplete AHP); at most 10 items per level.
- When CR > 0.1, a warning is shown, listing the 3 most inconsistent comparisons ordered by |ln(a_ij · w_j / w_i)| descending, together with what they "should" be under the current weights.

## New error codes

| Code | Meaning |
|---|---|
| `weighting_duplicate` | The same item appears more than once in the order |
| `ahp_incomplete` | A pairwise comparison is missing |
| `ahp_too_many_items` | A level has more than 10 items |
| `ahp_value_invalid` | A comparison value is not between 1/9 and 9, or the same pair is written in both directions |

These are all validation issues (all reported at once); their location is `field`, pointing to `weighting.<level>`.

## API

`POST /api/v1/projects/weights` (parameter: project) returns:

- `levels`: for each level, the key (`groups` or `within.<id>`), the method, and each item's local weight; AHP levels also include `cr`, `lambda_max`, `consistent` and the most inconsistent comparison pairs;
- `weights`: the global weight of each criterion.

It only requires the weighting settings to be valid, not the data to be complete, so weights can be shown live even before the data is filled in. The `POST /weights/derive` endpoint originally planned in the technical design (one level only) is replaced by this endpoint: the frontend already holds the whole project, so computing all levels at once is simpler and consistent with the other `/projects/*` endpoints.

`weights` in `/projects/evaluate` now returns the global weights. Weight stability intervals are still computed on the **global weights of the criteria**: when one criterion's weight changes, the other criteria are scaled proportionally.

## Frontend

"Criteria & weights" page:

- **Group management**: create, rename and delete groups. When a group is deleted, its criteria become "ungrouped". The criterion settings panel lets the user choose the group.
- Each level is a card: one for the upper level (when there are groups) and one per group. Each card can switch between the three methods:
  - **Direct input**: sliders and numbers, keeping "distribute evenly" and "normalize";
  - **Ranking**: move up, move down, and "tie with previous"; ROC or Rank-Sum can be chosen. Buttons are used instead of drag and drop, so it also works with the keyboard;
  - **Pairwise comparison**: one row per pair, with a scale from 9 through 1 to 9 to choose which side is more important and by how much; CR is shown, and when inconsistent the most inconsistent pairs are highlighted.
- Each item shows its local weight next to it; criteria also show their global weight.
- The live ranking on the right is unchanged; the "compared with import" rank change now compares with the full weighting settings at import time.

## Verification

- Backend unit tests:
  - Known values for ROC and Rank-Sum (n = 3: 0.6111, 0.2778, 0.1111; Rank-Sum: 0.5, 0.3333, 0.1667), ties, items not in the order;
  - AHP: a consistent matrix recovers the weights with CR = 0; a perturbed matrix has CR > 0.1 and the changed pair is found; reverse-direction notation; missing comparisons, more than 10 items, out-of-range values;
  - Multiplying the two levels of weights; "ungrouped" as an upper-level item; empty groups;
  - Stability intervals and calculation results use the global weights.
- End-to-end test: create two groups, use ranking on the upper level and pairwise comparison within groups, and see the global weights and ranking change accordingly.
