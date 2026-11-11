---
name: Emissions reference reconciliation
description: Evidence and limits when reproducing the Power BI emissions intensity rankings.
---

The reference intensity rankings require a transport-weighted measure, not an arithmetic average of source per-RTK intensities. Reconstruct the transport denominator from each row's CO₂ mass divided by its intensity, then divide aggregated mass by that denominator. The reference's zero engine values correspond to categories with missing source RTK intensities, so the replica treats incomplete category coverage as unavailable and displays 0 with a prominent disclosure.

**Why:** Arithmetic means do not match the screenshot. The weighted measure with incomplete-coverage handling reproduces all nine nonzero engine rankings, and nearly all visible MSN/airline rankings. The screenshot alone does not supply the original DAX, so this is an inferred reconciliation, not a confirmed definition of the original measure. Do not interpret these displayed zeroes as zero emissions.

**How to apply:** Keep this limitation explicit when changing measures or explaining results. Preserve the original blank measures in detail records and exports. The workbook includes Skydive Orange as an additional high-intensity airline absent from the screenshot; retain and disclose it rather than inventing an undocumented exclusion. Ask for original DAX/visual filters if exact residual reconciliation is requested.
