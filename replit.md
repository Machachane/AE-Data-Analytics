# AE+ Data Analytics

An aviation analytics platform replicating the user's Power BI dashboard, starting with Deliveries.

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

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

- The original dashboard has 11 modules. Deliveries and Orders are implemented; the other modules remain unavailable.
- Deliveries uses the `OD_DELIVERIES` sheet from the uploaded Master Database.
- The reference screenshot covers 2016-01-01 through 2026-10-31. Default and reset filters use this period; earlier workbook data remains available.
- The workbook is an imported snapshot, not a live connection.
- Orders uses `OD_ORDERS`, with a reference/default period of 2016-01-01 through 2026-10-30 (21,236 orders, 36 models, 306 customers).
- The user accepted Deliveries as successfully replicated. Preserve its appearance and behavior when extending other modules.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Frontend: `artifacts/ae-data-analytics`; backend: `artifacts/api-server/src/routes/deliveries.ts`.
- Extract the requested sheet only with `python scripts/extract-deliveries.py`. This creates `artifacts/api-server/data/deliveries.json`, served by the API.
- For Orders, run `python scripts/extract-deliveries.py --sheet OD_ORDERS`, which creates `artifacts/api-server/data/orders.json`. The Orders API is `/api/orders`.
- Do not include the 174 MB original workbook in Git or deployment images. The extracted dataset is the runtime source.
