---
name: Engine Profile source and reference mismatch
description: Why Engine Profile uses actual source totals and profile-entry shares rather than forcing the screenshot numbers.
---

Use only the requested ENGINE_PROFILE sheet for Engine Profile. Do not silently join fleet data, expand rows or insert hardcoded totals to reproduce the reference image.

**Why:** The provided screenshot shows 7 engine manufacturers and 611 variants, but its requested source sheet has 6 manufacturers, 110 distinct variants and 164 profile rows. Its chart percentages also do not reconcile to that sheet. The user was told that the implementation would use actual workbook totals while matching the layout.

**How to apply:** Keep source-based headline totals and disclose that the three shares count profile entries, not installed-fleet market share. Exact Power BI reconciliation needs the original measures/relationship definitions or a matching data refresh; do not infer undocumented joins merely to force agreement.
