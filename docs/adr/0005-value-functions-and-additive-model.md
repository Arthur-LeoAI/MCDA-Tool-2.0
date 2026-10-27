# 0005 Value functions unify data processing; guided mode uses the additive value model

- Status: Accepted
- Date: 2026-10-23

## Context

Real data contains numbers (in varying units), text grades, yes/no values and missing values, and user preferences are often nonlinear, for example "delivery within 2 days is all about the same". The existing approach offered only a few normalization methods (min_max, fixed_range, vector, none), which handle only numbers, cannot express nonlinear preferences, and are handled inconsistently across methods.

## Decision

1. Every criterion has a **value function** that converts the raw value into a value score between 0 and 1 (multi-attribute value theory, Keeney & Raiffa, 1976). Grades and categories are converted by assigned scores, yes/no is converted to 0 or 1, and numbers are calculated with a linear, logarithmic, target-range or piecewise-linear function.
2. The existing normalization methods are special cases of value functions: `min_max` equals linear with the data range, `fixed_range` equals linear with a fixed range, and `none` (old 0–100 data) equals linear with the fixed range [0, 100].
3. All methods (weighted sum, TOPSIS, CP), stability intervals, Pareto analysis and Monte Carlo simulation are calculated on the same value matrix.
4. **Guided mode uses only the weighted sum** (additive value model): it can be split exactly into the contribution of each criterion, so conclusions can be phrased as "because of criterion A, ...". Expert mode can choose other methods. Classic TOPSIS (raw data with vector normalization) is offered only in expert mode and requires all criteria to be numeric and to use linear value functions.

## Consequences

- Data processing is implemented in one place, and each step can be tested and explained on its own.
- The comparison tests against the old Excel files still hold: the fixed range [0, 100] scales all criteria by the same factor, so rankings and stability intervals do not change.
- TOPSIS and CP are calculated on value scores, so their results differ from the classic definition of "raw data with vector normalization". This is stated in expert mode and in the documentation.
- The additive model assumes preference independence between criteria (for example, whether the price is good or bad does not affect the preference for quality). This assumption is explained in the help text.
