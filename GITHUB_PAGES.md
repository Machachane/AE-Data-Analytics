# Host AE+ Data Analytics on GitHub Pages

The included workflow builds and deploys the **frontend only**. GitHub Pages cannot
run this app's Express API, PostgreSQL database, App Storage access, or OpenAI calls.
All charts, data tables, AE+ Assistant and saved feedback still need a separately
hosted, running backend.

**No repository or production API address has been selected in these files.**
The workflow uses the repository's actual default branch and reads its Pages URL
automatically. You supply the production backend origin as described below.
Nothing is published just by adding these files in Replit.

## 1. Prepare your backend

Keep the existing API hosted on an HTTPS service with its database and source-data
storage access. Its routes must remain at `/api`, including:

- `/api/healthz`
- `/api/summary/options` and the other dashboard routes
- `/api/assistant/chat`
- `/api/feedback`
- The data-export and airline-statement routes

Keep `OPENAI_API_KEY`, database credentials and App Storage credentials on that
backend. **Never add them as `VITE_*` variables, put them in Git, or pass them into
the Pages build.** This workflow does not copy or migrate data.

On the backend, configure the non-secret `CORS_ALLOWED_ORIGINS` setting to your
frontend's exact browser origin. For a project site at
`https://YOUR-ACCOUNT.github.io/YOUR-REPOSITORY/`, the value is:

```text
https://YOUR-ACCOUNT.github.io
```

Do not include the repository path or a trailing slash. Multiple frontend origins
(for example a custom domain) may be comma-separated:

```text
https://YOUR-ACCOUNT.github.io,https://analytics.example.com
```

Restart/redeploy the backend after configuring it. With no allowlist configured,
same-origin access still works, but cross-origin browser access is not enabled.
Current API calls use same-origin credentials only; the Pages frontend does **not**
send cross-site cookies. If authentication is introduced later, review the
authentication and CORS model before allowing cross-site credentials.

**CORS is not access control.** The current dashboard APIs do not implement user
authentication; anyone able to reach those endpoints can call them outside a
browser. Keep private source files private, and review data-access requirements
before exposing the API publicly.

If your backend is hosted on Replit, obtain its actual published URL from the
Publishing panel. Do not use the temporary development preview URL. A stable API
must stay available independently of your editing session.

## 2. Push the workspace to GitHub

Push the full pnpm workspace, including `.github/workflows/github-pages.yml`,
the lockfile, the frontend, and shared `lib` packages, into your repository.
Do not upload only the frontend subfolder: it imports workspace packages.

Do not commit `.env` files, API keys, original spreadsheets, private data snapshots,
`node_modules`, or build outputs. The workflow uploads only
`artifacts/ae-data-analytics/dist/public`, not the repository or API server.

## 3. Configure GitHub

1. In the repository, open **Settings → Pages**.
2. Under **Build and deployment**, select **GitHub Actions** as the source.
3. Open **Settings → Secrets and variables → Actions → Variables**.
4. Add the **repository variable** `VITE_API_ORIGIN` containing your backend's
   HTTPS origin, such as `https://api.example.com`. Replace that example with the
   real backend address. Do not append `/api`, a query, credentials or a fragment.
5. Ensure Actions and Pages are permitted for the repository and that the
   `github-pages` environment permits your default branch.
6. Push to the default branch, or open **Actions → Deploy AE+ Data Analytics to
   GitHub Pages → Run workflow**, selecting the default branch.

No custom deployment token or personal access token is needed. The workflow uses
GitHub's built-in token with read access for the build and Pages/OIDC permissions
only for the deployment job. Non-default branches do not deploy. Concurrent
deployments are serialized.

The workflow pins Node.js `24.22.1` and pnpm `10.26.1`, installs using
`--frozen-lockfile`, checks shared/frontend/backend types, runs deployment checks,
and builds only the frontend. It does not start the API or require backend secrets.

## Repository paths and custom domains

The Pages configuration action supplies the base path:

- Project repository: `/YOUR-REPOSITORY/`
- Account site (`YOUR-ACCOUNT.github.io` repository): `/`
- Custom domain: use the Pages settings for that domain; the action supplies its
  corresponding base path.

Do not hardcode your repository name into navigation. The build generates a real
directory index for all 12 dashboard routes (Summary has `/` and `/summary`), so
direct links and refreshes work on modules such as
`/YOUR-REPOSITORY/engine-profile/`. Query strings for assistant selections remain
unchanged. Unknown routes use `404.html` and display the application's not-found
page; no hash router or external redirect service is needed.

## Local build verification

From the workspace root, with Node.js 24 and pnpm installed:

```sh
pnpm install --frozen-lockfile
pnpm run typecheck:libs
pnpm --filter @workspace/ae-data-analytics run typecheck
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/ae-data-analytics run test:pages
pnpm --filter @workspace/api-server run test:cors

# Use your real backend origin when building for deployment.
BASE_PATH=/YOUR-REPOSITORY/ VITE_API_ORIGIN=https://api.example.com \
  pnpm --filter @workspace/ae-data-analytics run build:pages
BASE_PATH=/YOUR-REPOSITORY/ \
  pnpm --filter @workspace/ae-data-analytics run verify:pages
```

For an account/custom-domain root site, use `BASE_PATH=/`.
These inline variables affect only those commands; existing Replit workflows keep
using their managed base path and same-origin API unless configured otherwise.
The normal `build` command remains for same-origin hosting. `build:pages` requires
a valid external backend origin and fails early when it is missing.

## Confirm the live site after deployment

1. Open the URL reported by the workflow's deployment step.
2. Confirm real Summary data loads, then open and refresh another module directly.
3. Check the GARI, Estuaire and Tiralis logos and a repossession map.
4. Change a filter and download a CSV; confirm it contains the selected records.
5. Ask AE+ Assistant a data question and check its linked selections.
6. Submit identifiable test feedback and verify it in the backend database.

To diagnose backend connectivity, use your actual addresses:

```sh
curl -i https://YOUR-BACKEND/api/healthz
curl -i -X OPTIONS https://YOUR-BACKEND/api/feedback \
  -H 'Origin: https://YOUR-ACCOUNT.github.io' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
```

The preflight should return `Access-Control-Allow-Origin` matching the frontend
origin and allow POST/Content-Type. It should not enable cross-site credentials.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Workflow is skipped | It only deploys the repository's default branch. |
| Pages configuration fails | Select GitHub Actions under Pages settings and check repository/environment permissions. |
| Missing `VITE_API_ORIGIN` | Add it as an Actions repository **variable**, then rerun. |
| Invalid origin error | Use a production HTTPS origin only, without `/api`, credentials, query or fragment. Preview/localhost URLs are rejected. |
| Empty/error charts or failed exports | Inspect browser network errors; confirm the backend is available and its CORS allowlist matches the Pages origin. |
| Assistant unavailable | Confirm the backend has its OpenAI key and can access its private source data. Never put the key in GitHub Pages. |
| Feedback cannot save | Confirm the backend database and feedback table are available. |
| Missing CSS/logos or route refresh fails | Deploy using `build:pages`, retain the generated module directories, and do not override the base supplied by Pages. |
| Custom domain fails | Finish its DNS and Pages HTTPS settings, update the backend CORS allowlist, then rerun the workflow. |

The files and local builds can be verified without GitHub access. A successful
live Actions deployment and real cross-host API behavior must be confirmed after
you configure the repository and backend.
