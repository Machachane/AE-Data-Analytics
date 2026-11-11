---
name: Summary source measure boundaries
description: Why the Summary reference cannot use one universal join or inherit every standalone page's aggregation.
---

The Summary's financial presentation signs are distinct from the Airline Financials source amounts.

**Why:** Reference liability categories and the category called Total Equity (capital/reserves) are negative, while their source values are positive. Current/Non-Current mixes asset and liability metrics and therefore requires signs at the metric level. The supplied source still differs from the image's Current/Non-Current amount after that transformation.

**How to apply:** Limit sign changes to the Summary presentation and retain raw values alongside it. Do not change the underlying source or generated financial statements, and do not force the remaining reference discrepancy to match.

The Summary CO₂ reference remains unreconciled; it must not be assumed to use the standalone Emissions page's inferred measure.

**Why:** The screenshot ranks large commercial airlines, whereas the supplied source and inferred transport-weighted measure include much larger small-operator outliers and missing denominators. Weighted, simple-average and count interpretations did not establish the screenshot's definition. Excluding operators or allocating values to force its ranking would invent undocumented visual filters.

**How to apply:** Keep the current explicitly disclosed source-based measure and its unavailable flags/outliers. Obtain original Power BI DAX, relationships and visual filters before claiming an exact match to that Summary ranking.

Detailed fleet engine models cannot be assigned order/delivery quantities from these sources alone.

**Why:** OD Engine contains vendor codes such as CF, GE and PW; the screenshot uses variants such as LEAP-1B28. There is no verified model/engine relationship allocating those vendor totals to installed engine variants.

**How to apply:** Use source engine-code totals with an explicit scope label until an authoritative crosswalk or original reporting model is supplied. Do not duplicate vendor totals across multiple engine variants.

Cross-source filters must respect each dataset's actual dimensions.

**Why:** Registered country, customer country and jurisdiction country are different roles; none proves an airline's headquarters. Commercial OD model labels are not the fleet's ICAO codes, and financial source DATE is not a calendar-period end.

**How to apply:** Resolve country identity with verified aliases without changing its role. Use exact month/MSN/ICAO fleet matches when a fleet-only structural filter constrains emissions. Keep financial/risk filters independent where no relationship exists, and disclose the scope rather than inventing a universal join.
