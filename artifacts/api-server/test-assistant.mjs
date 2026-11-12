import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { resolve } from "node:path";

const dir = fileURLToPath(new URL(".", import.meta.url));
const out = resolve(dir, "dist/assistant-data-checks.mjs");
await build({
  entryPoints: [resolve(dir, "src/lib/assistant-data.test.ts")],
  outfile: out, bundle: true, platform: "node", format: "esm",
  external: ["@google-cloud/*", "google-auth-library"],
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
});
await import(out + `?run=${Date.now()}`);

// Independently verify URL hydration, including blank 'All' period and metric 0.
const filterOut = resolve(dir, "dist/assistant-filter-checks.mjs");
await build({
  entryPoints: [resolve(dir, "../ae-data-analytics/src/lib/assistant-filters.ts")],
  outfile: filterOut, bundle: true, platform: "node", format: "esm",
});
const helpers = await import(filterOut + `?run=${Date.now()}`);
globalThis.window = { location: { search: `?assistantFilters=${encodeURIComponent(JSON.stringify({
  manufacturer: "Boeing", period: "", metricIds: "0,22", unknown: "rejected", owner: "  exact source label ",
}))}` } };
assert.deepEqual(helpers.initialAssistantFilters(["manufacturer", "period", "metricIds", "owner"]), {
  manufacturer: "Boeing", period: "", metricIds: "0,22", owner: "  exact source label ",
});
globalThis.window.location.search = "?assistantFilters=not-json";
assert.deepEqual(helpers.initialAssistantFilters(["manufacturer"]), {});
delete globalThis.window;
process.stdout.write("PASS: navigation filter hydration and malformed-link checks\n");
