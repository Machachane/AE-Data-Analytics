---
name: Dashboard report grounding
description: Accuracy, scope and privacy constraints for AI-generated dashboard PDF summaries.
---

Reports must capture the current module's actual native selections at generation start, including multi-select members, rather than relying on chat history or date filters alone.

**Why:** The user requested a downloadable AI summary of the selected dashboard, and previously corrected an assistant answer whose charts matched the dates but not the ranked customer subset.

**How to apply:** Validate the captured selections on the server and use the same source queries and measure semantics as the dashboard. Report the captured selections explicitly so later UI changes cannot be confused with the exported scope.

Compute numerical report figures deterministically from selected source data; use AI only to interpret the verified report sections.

**Why:** Accuracy is a stated product priority. Sampled source rows, bounded ranked lists, fixed reference panels and mixed financial reporting scopes must not be mistaken for compatible full-population totals.

**How to apply:** Do not calculate totals from displayed rows or allow the model to choose unrelated scopes. Keep source references, null semantics, units and module-specific limitations in the PDF.

Generate reports as authenticated private downloads without retaining publicly accessible files.

**Why:** These PDFs contain team-selected dashboard data, and report history or public sharing was not requested.

**How to apply:** Keep downloads private and uncached. Require an explicit new request before adding persistent report history or public links.
