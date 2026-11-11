---
name: Jurisdiction Risk reference measures
description: Source score choices, category meaning and the unrelated global-model card in the Power BI reference.
---

The reference's repossession headline and green score bars use the overall repossession score, not the separate repossession score.

**Why:** The original screenshot's average is 60.41, which reconciles to the overall field. The similarly named separate score averages 59.37. Deregistration reconciles to 63.6.

**How to apply:** Preserve this distinction when reconciling a replacement workbook. Keep missing scores missing and reported zeroes in the mean.

High repossession categories are green, moderate amber and low red; use the source categories without inventing thresholds.

**Why:** The supplied reference uses high to mean a higher, better repossession score, not higher risk. Reversing the colors because the module is called Risk would misrepresent the source.

**How to apply:** Label the category as a score category, not a risk-severity label. Law Compliance is a different source classification and must not be substituted for it.

The screenshot's Total Models card is global fleet context, not a country-filtered jurisdiction measure.

**Why:** The screenshot includes 79 models, while the requested risk sheet has no model field or model/country relationship. The existing fleet dataset supplies 79 models. The user was told this would be separate, explicitly labelled context.

**How to apply:** Refresh that count from the fleet source, do not hardcode it or fabricate a model-to-country join. Jurisdiction filters must not alter it; a fleet-source failure must not block the risk sheet.

Check the actual basemap image, not just the tile HTTP status or image-load event. Keep the jurisdiction map's bundled geographic background independent of tile providers.

**Why:** Both initially evaluated tile services returned restricted-access images with successful image responses: one displayed API-key-required watermarks and another displayed an access-blocked notice. HTTP success and Leaflet tile-load events did not mean a usable geographic background.

**How to apply:** Preserve the bundled public-domain Natural Earth boundaries as the default map background. Any future optional detailed tile layer needs visual verification and must not become a dependency for viewing source markers.
