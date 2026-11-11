# AE+ Data Analytics

An aviation analytics platform replicating the user's Power BI dashboard across Deliveries, Orders, Aircraft Utilisation, Aviation Finance, Market Value / Lease Rates, Emissions, Aircraft Registry, Engine Profile and Jurisdiction Risk.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

- Match Power BI text identity case-insensitively and normalize whitespace; retain source spellings otherwise.
- Utilisation counts aircraft by distinct MSN, including the blank category, to reproduce the original report. This is not the aircraft-month row count or a unique model/MSN fleet identity.
- Utilisation metrics follow the screenshot's source measures: average `MONTHLY_HOURS_TTL`, average `AVG_FC_LTT`, and average `HRS_PER_CYCLE`. Do not replace them with ratios of totals or LTM averages.
- Preserve negative monthly flight-hour values from the source. The screenshot includes these; do not clamp, remove or "correct" them without user instruction.
- The 142 MB fleet CSV and its compact runtime snapshot are stored privately in App Storage rather than Git or browser downloads. Aggregate fleet analytics on the server.
- Finance's quarterly, half-year and annual rows overlap. Select exact source reporting snapshots, never sum different reporting periods. The three analysis sheets contain only 2025 reference figures, even when the finance rankings show 2026.
- Anonymous MLA groups are excluded from finance rankings to match the reference screenshot, with the excluded amounts disclosed. Do not merge borrower names such as American and American Airlines without source evidence.
- Market/lease chart bounds are source extrema across selected vintages, not averages: MIN(lease low)/MAX(lease high), and MIN/MAX(market value). Each chart is ordered by its lower bound descending to match Power BI.
- The market/lease screenshot uses a transparent lower-bound offset plus an upper-bound-length bar (axis endpoint is their sum). Preserve that original layout with an explicit disclosure, and offer a true lower-to-upper interval view rather than silently changing the replica.
- Preserve and flag reversed lease-rate bounds from the source instead of swapping or discarding them. Vintage is an aircraft vintage, not a reporting year.

## Product

- The original dashboard has 11 modules. Deliveries, Orders, Aircraft Utilisation, Aviation Finance, Airline Financials, Market Value / Lease Rates, Emissions, Aircraft Registry, Engine Profile and Jurisdiction Risk are implemented; only Summary remains unavailable.
- Deliveries uses the `OD_DELIVERIES` sheet from the uploaded Master Database.
- The reference screenshot covers 2016-01-01 through 2026-10-31. Default and reset filters use this period; earlier workbook data remains available.
- The workbook is an imported snapshot, not a live connection.
- Orders uses `OD_ORDERS`, with a reference/default period of 2016-01-01 through 2026-10-30 (21,236 orders, 36 models, 306 customers).
- The user accepted Deliveries as successfully replicated. Preserve its appearance and behavior when extending other modules.
- Aircraft Utilisation uses the newly uploaded `AIRCRAFT_REGISTRY_FLEET_DATA_FINAL` CSV, not the old workbook's utilisation sheet. Its reference period is 2025-12-01 through 2026-10-01.
- Aviation Finance uses `MLA_CM_CO_MERGED`, `BORROWER_transposed` and `Aviation_Analyses`; its reference/default selection is 2026 H1. Analysis percentages and the USD billion total retain their own source units.
- Market Value / Lease Rates uses `MARKET_VALUE_LEASE_RATES` from the original Master Database, with all vintages selected by default (43 aircraft types, 7 manufacturers). Monetary source values are already USD millions; lease rates are monthly.
- Emissions uses `EMISSIONS_ANALYSIS` from the original Master Database: 1,016,459 aircraft-month records, January 2025–September 2026. All dates are selected by default, matching 40,380 MSNs, 555 engine models, 5,826 airlines, 161.08 average flight hours and 65.30 average flight cycles. Date as at selects an exact source month. All source records remain available through server-side sorting/search and a virtual scrolling table; do not download the full dataset into the browser.
- Aircraft Registry uses the updated fleet CSV, not the Master workbook. Default totals match 2,607 airlines, 32,828 distinct MSNs, 79 models, 7 manufacturers, 2,374 owners, 1.05bn LTM hours, 408M LTM cycles and 2.92 average lifetime FH/FC ratio. LTM fields are summed across all 403,408 source-month observations to match the reference, not presented as a deduplicated annual fleet total.
- Registry table entries group identical displayed attributes across monthly observations and retain the latest matching update. Changed registrations, operators, owners and engine details stay separate (53,124 default entries). Do not deduplicate by UNIQUE_ID alone: different aircraft with missing MSN can share that identifier. The table defaults to first flight descending.
- Registry Graphs shares the seven filters and includes a manufacturer donut, operator/model pair ranking, owner/model rankings, a compact ICAO detail table and a centered manufacturer comparison. Manufacturer visuals count source-month observations; other rankings count distinct MSNs. Graphs uses the reference's seven KPI cards, including mean LTM cycles; its reference-labelled Avg Flight Hours card retains the report's summed-hours value with a disclosure. See memory for the reference measure semantics.
- Engine Profile uses only the master's `ENGINE_PROFILE` sheet. Shares count profile entries rather than an installed aircraft fleet; source-based distinct counts differ from the screenshot. Certification years and thrust remain text to preserve TBC. Preserve distinct variant/date pairs when a variant has multiple certification years.
- Jurisdiction Risk uses the master's `JURISDICTION_RISK_ANALYSIS` sheet, with country centroids as map-only enrichment. Reference measure definitions and the separate fleet-model context are documented in agent memory.
- Airline Financials uses only `TIRALIS_AIRLINE_FINANCIAL`: 105,116 source records, 244 airlines, 38 metrics in 14 categories. Default/reset reporting period is Yr (30,924 rows). The tree initially selects no metrics: the table shows all matching source lines but the waterfall stays empty until a metric/category is selected. Context cards show independent first-in-view labels, not a combined valid statement.
- Its balance-sheet/P&L generator selects one of 3,083 actual airline/year/period/scope/fiscal-year-end combinations and uses source totals, not calculated accounting totals. USD values keep the source scale because the workbook declares no multiplier. Negative amounts and reported zeroes are preserved; missing statement lines and administration flags are not inferred.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Frontend: `artifacts/ae-data-analytics`; backend: `artifacts/api-server/src/routes/deliveries.ts`.
- Extract the requested sheet only with `python scripts/extract-deliveries.py`. This creates `artifacts/api-server/data/deliveries.json`, served by the API.
- For Orders, run `python scripts/extract-deliveries.py --sheet OD_ORDERS`, which creates `artifacts/api-server/data/orders.json`. The Orders API is `/api/orders`.
- Utilisation: `/aircraft-utilisation`; API `/api/utilisation/options` and `/api/utilisation`. Source files are App Storage private objects `analytics/source-fleet.csv` and `analytics/fleet-utilisation.json.gz`.
- `python scripts/extract-utilisation.py` reads the fleet CSV as Windows-1252 and parses snapshot dates as day/month/year. It generates the compact gzip snapshot under ignored `generated-artifacts/`; upload a validated replacement to App Storage to update the runtime source.
- Finance: `/aviation-finance`; API `/api/aviation-finance?year=2026&period=H1`. Run `python scripts/extract-finance.py`, then `pnpm --filter @workspace/scripts exec tsx ../artifacts/api-server/src/scripts/upload-finance.ts` to store the validated snapshot and original workbooks privately. Restart the API after importing a replacement snapshot.
- Market/lease rates: `/market-value-lease-rates`; API `/api/market-value-lease-rates`. Extract just the required sheet with `python scripts/extract-market-rates.py`, then upload via `pnpm --filter @workspace/scripts exec tsx ../artifacts/api-server/src/scripts/upload-market-rates.ts`. Runtime snapshot: private App Storage `analytics/market-value-lease-rates.json.gz`. Restart the API after replacing it.
- Emissions: `/emissions`; API `/api/emissions/options`, `/api/emissions`, `/api/emissions/records`, `/api/emissions/export`. Run `python scripts/extract-emissions.py`, then `pnpm --filter @workspace/scripts exec tsx ../artifacts/api-server/src/scripts/upload-emissions.ts`. Runtime snapshot: private App Storage `analytics/emissions.json.gz`. Restart the API after replacement. Preserve date-formatted source MSNs as displayed text, not Excel date integers. See agent memory for the reference intensity-measure reconciliation and its remaining source discrepancy.
- Registry: `/aircraft-registry`; API `/api/registry/options`, `/api/registry`, `/api/registry/records`, `/api/registry/export`. Run `python scripts/extract-registry.py`, then `pnpm --filter @workspace/scripts exec tsx ../artifacts/api-server/src/scripts/upload-registry.ts`. Runtime snapshot: private App Storage `analytics/aircraft-registry.json.gz`. Restart the API after replacement. Source models and detailed variants are separate filter fields; see memory for owner whitespace matching.
- Engine Profile: `/engine-profile`; API `/api/engine-profile`. Run `python scripts/extract-engine-profile.py`, then `pnpm --filter @workspace/scripts exec tsx ../artifacts/api-server/src/scripts/upload-engine-profile.ts`. Runtime snapshot: private App Storage `analytics/engine-profile.json.gz`. Restart the API after replacement. This small reference dataset is filtered client-side; CSVs use the currently selected profiles, not a backend fleet join.
- Jurisdiction Risk: `/jurisdiction-risk`; API `/api/jurisdiction-risk`. Run `python scripts/extract-jurisdiction-risk.py`, then `pnpm --filter @workspace/scripts exec tsx ../artifacts/api-server/src/scripts/upload-jurisdiction-risk.ts`. Runtime snapshot: private App Storage `analytics/jurisdiction-risk.json.gz`. Restart the API after replacement. Extraction caches mledoze/countries centroids and Natural Earth world boundaries in the ignored generated directory. Map geography is bundled into the snapshot, with attribution, and does not depend on external tile services or map API keys.
- Airline Financials: `/airline-financials`; API `/api/airline-financials/options`, `/api/airline-financials`, `/api/airline-financials/records`, `/api/airline-financials/export`, `/api/airline-financials/statements/:id`. Run `python scripts/extract-airline-financials.py`, then `pnpm --filter @workspace/scripts exec tsx ../artifacts/api-server/src/scripts/upload-airline-financials.ts`. Runtime snapshot: private App Storage `analytics/airline-financials.json.gz`. Restart the API after replacement. Records are remotely windowed, searched and sorted; CSV export includes every matching row, not just the loaded window. Statement CSV and escaped printable HTML downloads preserve the exact source snapshot selection.
- Do not include the 174 MB original workbook in Git or deployment images. The extracted dataset is the runtime source.
