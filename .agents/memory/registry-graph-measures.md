---
name: Registry graph measure semantics
description: Different counting units and misleading source labels in the Power BI Registry Graphs reference.
---

Registry Graphs must not reuse one aircraft-count measure for every visual. The manufacturer donut and centered manufacturer comparison use counts of monthly source observations. Operator/model pairs, owners and model rankings use distinct MSNs over the selected history, including the blank MSN category.

**Why:** The supplied Graphs reference has roughly 168.7K Boeing observations, but only 32,828 distinct MSNs globally. Its operator/model ranking starts with Southwest B737 at 485 distinct MSNs and owner/model counts also reconcile using distinct MSNs. Treating every chart as a distinct-aircraft distribution changes the replica substantially.

**How to apply:** Always label/disclose each visual's counting unit and export that actual measure. Manufacturer donut percentages use all filtered manufacturer observations; comparison percentages are relative to the largest manufacturer. Operator/model selections must filter the two source dimensions together.

The Graphs KPI “Avg Flight Cycles (LTM)” uses the mean of source LTM cycle values. The reference-labelled “Avg Flight Hours (LTM)” displays the summed-hours value, not a true average.

**Why:** The reference shows about 1.01K cycles and 1.05bn hours; replacing the latter with an average would no longer reproduce the provided report.

**How to apply:** Keep the reference label only with an explicit full-value tooltip/source note explaining the summed-hours measure. Do not change the table view's existing eight headline cards to the Graphs view's seven-card set.
