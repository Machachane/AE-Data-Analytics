---
name: Power BI matching
description: Case-insensitive customer identity is necessary to reconcile the original dashboard.
---

Treat customer names differing only in capitalization as one customer when matching Power BI.

**Why:** The workbook contains mixed-case variants of the same customer. Case-sensitive counting produced 952 customers for the reference period; case-insensitive counting reproduced the screenshot's 903 customers without changing delivery quantities.

**How to apply:** Preserve case-insensitive grouping for customer counts, rankings, and filters when importing later workbook snapshots. Do not merge other spelling differences without evidence.
