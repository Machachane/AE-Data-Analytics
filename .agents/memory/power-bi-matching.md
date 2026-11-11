---
name: Power BI matching
description: Case-insensitive customer identity is necessary to reconcile the original dashboard.
---

Treat customer names differing only in capitalization as one customer when matching Power BI.

**Why:** The workbook contains mixed-case variants of the same customer. Case-sensitive counting produced 952 customers for the reference period; case-insensitive counting reproduced the screenshot's 903 customers without changing delivery quantities.

**How to apply:** Preserve case-insensitive grouping for customer counts, rankings, and filters when importing later workbook snapshots. Do not merge other spelling differences without evidence.

## Registry owner identity exception

For registry owners, compare case-insensitively and ignore trailing ASCII spaces only. Retain leading and non-ASCII whitespace as significant source identity, even though other report dimensions normalize whitespace more aggressively.

**Why:** The reference's 2,374 owners are reproduced with this rule. Collapsing all whitespace produces 2,368, and trimming all whitespace produces 2,369. Applying the customer normalization rule globally would silently merge source owners that the registry report keeps separate.

**How to apply:** Keep owner selections unchanged between filter choices and requests. Apply this exception to registry owner grouping/filtering, not to unrelated report dimensions. Do not infer a real-world entity merge from visually similar owner labels.
