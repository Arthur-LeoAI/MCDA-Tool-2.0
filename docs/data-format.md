# Input data format

## Standard template (`mcda_core.io.read_problem`)

`.xlsx` and `.csv` are supported. For Excel files, the worksheet named `Decision` is read first; if there is none, the first worksheet is read.

| Column A | Column B | Column C | … |
|---|---|---|---|
| `Criterion` | Name of criterion 1 | Name of criterion 2 | … |
| `Direction` | `benefit` | `cost` | … |
| `Weight` | 0.6 | 0.4 | … |
| Name of alternative 1 | Value | Value | … |
| Name of alternative 2 | Value | Value | … |

- For `Direction`, enter `benefit` (higher is better) or `cost` (lower is better); `max` / `min` and `1` / `0` are also accepted.
- Weights must not be negative, and at least one must be greater than 0; the weights do not need to sum to 1.
- There must be at least 2 alternatives and 1 criterion; alternative names and criterion names must not be duplicated.
- Empty rows and empty columns on the right are ignored.
- CSV files may be comma- or semicolon-separated. Semicolon-separated files (Excel exports with German or other European locale settings) may use a decimal comma, for example `0,6`.
- When reading, all problems are listed at once, each with its cell location (such as `C4: value must be a number`).

You can generate a template from an existing problem with `mcda_core.io.write_problem(problem, "template.xlsx")`.

## Old V7 workbook (`mcda_core.io.read_legacy_workbook`)

The worksheet is named "Stability Interval", and all labels are in column A:

| Row | Content |
|---|---|
| 1 | Objective of each criterion: 1 = maximize, 0 = minimize |
| 2 | Whether the column has been scaled to Max = 100 / Min = 0 (1 = yes) |
| 3 | Header: `No.`, the criterion names, `Rank` |
| 4 onward | One alternative per row, followed by the `Criteria Weight` row |
| After that | The weight stability intervals calculated by Excel: `Maximum/Minimum Criteria Weight (Full Order)`, `… - Top:1`, and the corresponding `Normalised` versions |

Notes:

- The `Rank` column represents the **ordering**, not each alternative's own rank: the value in row k is the number of the alternative ranked in position k.
- When a weight can increase without limit, Excel sometimes writes an empty value and sometimes a very large number (about 4e15). Both cases are treated as infinity when reading.
- For criteria with a weight of 0, Excel always writes 0/0 for the interval, which means no analysis was done; it is not a calculated result.
