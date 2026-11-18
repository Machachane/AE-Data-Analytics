---
name: Airline financial ratios
description: Source expense sign handling for aviation financial ratio calculations.
---

Expense line items can be reported as negative values. Use their absolute value when calculating positive cost-to-revenue burdens and when adding depreciation and amortisation back to EBIT for EBITDA. Keep the original signed source amount visible in calculation traces.

**Why:** Directly dividing signed expense values by revenue produces misleading negative cost shares, and adding a negative depreciation amount to EBIT understates EBITDA.

**How to apply:** Preserve source signs in raw records and traces; apply absolute values only where the ratio definition treats expense magnitude as a cost burden or EBITDA add-back.
