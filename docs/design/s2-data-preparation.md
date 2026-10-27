# S2 design note: data preparation

- Status: done
- Based on: PRD F2.1–F2.6; technical design §3 step 1, §5

## Problem

Currently only the standard template or a legacy V7 workbook can be imported. The tables users actually have usually come from third-party product research tools, Seller Central reports or their own Excel files. Common situations:
- There are note rows at the top;
- There are extra columns;
- Numbers are written as text such as "$12.99""15%""1.234,5";
- There are text levels (低/中/高, i.e. low/medium/high) and yes/no values;
- There are missing values.

S2 makes such tables **importable directly** and, after import, tells the user what is wrong with the data.

## Flow

1. **Upload**: `POST /api/v1/tables/inspect` (file upload, optionally with `sheet` and `header_row` parameters).
   - If the file is recognized as a **standard template or legacy workbook**, the converted project is returned directly, as before.
   - Otherwise **table information** is returned: all sheets, the guessed header row, the detected type of each column, and the cell contents (at most 500 rows below the header and 200 columns).
2. **Map columns** (frontend): the user picks the sheet and header row and names the column that holds the alternative names; every other column is set to "criterion" or "ignore", with type and direction confirmed; for ordinal columns the order of the values can be adjusted.
3. **Build the project**: `POST /api/v1/tables/build`. Converts the table and the column mapping into a project:
   - Numbers written as text are parsed into numeric values;
   - Ordinal levels get evenly spaced scores by default, following their order (the last one gets 1);
   - Categories all get a score of 1 by default (no distinction); the user sets them;
   - Yes/no is converted to true/false;
   - All weights default to 1.
4. **Data quality report**: `POST /api/v1/projects/quality`. Shown on the "Data" page after import.

## Detection rules

**Numbers written as text**:
- Remove spaces (including non-breaking spaces), currency symbols ($ € £ ¥) and percent signs; "15%" is read as 15 and the unit is recorded as %.
- Accounting-style negatives "(1,234)" are read as −1234.
- Thousands separators and decimal points:
  - When both `.` and `,` appear, the last one is the decimal point;
  - When only `,` appears, forms like `1,234` / `12,345,678` are thousands separators; otherwise it is a decimal point (`12,5`);
  - When only `.` appears, forms like `1.234.567` (two or more groups) are thousands separators; otherwise it is a decimal point.
- **One decision per column**: as soon as one value in the column clearly shows which symbol is the decimal point (e.g. `1.234,5`), the whole column is parsed with that rule. So `1.234` in a European-format column is read as 1234.

**Column type** (non-empty values only):
- More than 90% parse as numbers → numeric;
- All values are 是/否, yes/no, true/false, ja/nein, 1/0 → yes/no;
- At most 10 distinct values, all belonging to one known set of ordered words (低/中/高, low/medium/high, 小/中/大, 差/一般/好, etc.) → ordinal, ordered as in the word list;
- Other cases with at most 10 distinct values → categorical;
- Everything else → text, "ignore" by default.

**Column with the alternative names**: the first column that is mostly text and has nearly no repeated values.

**Header row**: among the first 10 rows, the first row in which "more than half of the cells are non-empty and all of them are text" and whose next row contains numbers; if none is found, row 1 is used.

## Data quality report

Lists the following issues per criterion (all have error codes; the frontend translates them):

| Code | Meaning |
|---|---|
| `quality_missing` | There are N missing values, and the rule used to handle them |
| `quality_constant` | All alternatives have the same value; this criterion cannot distinguish alternatives |
| `quality_outliers` | There are extreme values (outside 1.5 times the interquartile range), with the alternatives listed |
| `quality_suggest_log` | The values span more than two orders of magnitude (maximum / minimum > 100); a logarithmic curve is suggested |
| `quality_categories_equal` | All category scores are the same; this criterion has no effect |

## Not done (later steps)

Value function editor (S3), automatic column mapping by template aliases (S7).

## Verification

- Parsing and detection rules: unit tests cover every notation listed above.
- End-to-end test: import a "dirty" xlsx (note rows, currency, percentages, European format, ordinal levels, yes/no, missing values, extra columns) → map columns → get the correct project and data quality report.
