---
name: Airline financial source semantics
description: Why fiscal year-end, cached blank source IDs and independent screenshot cards must be handled explicitly.
---

Financial statement identity includes fiscal year-end and reporting scope, in addition to airline, financial year and reporting period. Currency and source status must not be mixed either.

**Why:** The uploaded financial sheet appears to contain conflicting duplicate metric values until fiscal year-end is included. For example, Middle East Airlines' Other Operating Costs differs across its fiscal year-end labels within the same financial year and annual period. These are separate source snapshots, not duplicate lines to sum or overwrite. Annual, half-year and quarterly periods also overlap.

**How to apply:** Keep all source rows in the analytical table. The generator must select an actual source combination, preserve reported totals and state when the source statement is partial. A selected-metric waterfall is an exploratory source-row sum, not an accounting reconciliation; selected totals and their components can double-count.

Optional source metric/category lookup IDs may be blank even when the metric and category names are present.

**Why:** In this workbook, both ID lookup columns contain legitimate cached empty-string formula results (`t="str"` with an existing empty cached-value element). Rejecting every blank formula cache drops or blocks valid financial data.

**How to apply:** Retain those optional blanks and identify financial metrics by their names. Continue rejecting uncached meaningful values and Excel errors; do not broadly reinterpret missing formula results as zero.

The screenshot's first airline/year cards are independent dimension labels, not one statement selection.

**Why:** Its Abra Group / FY 2021 / Yr cards do not correspond to an available Abra Group statement in the source. Forcing those cards into one reporting context would fabricate a statement.

**How to apply:** Disclose first-in-view context when multiple values are present. Default the generator to a real available combination rather than copying the three card values.
