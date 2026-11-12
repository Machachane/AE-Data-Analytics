import assert from "node:assert/strict";
import { AssistantController, MODULE_KEYS, moduleFromPath, sanitizeFilters, type ModuleSlug, type FilterMap } from "./assistant-controller";
import { filterMarketRows, marketRanges, type MarketFilters } from "./market-rates";
import type { MarketRateRecord } from "@workspace/api-client-react";

let current: ModuleSlug | null = "market-value-lease-rates";
const navigations: string[] = [], urls: (FilterMap | null)[] = [];
const controller = new AssistantController({
  navigate: path => { navigations.push(path); current = moduleFromPath(path); },
  currentModule: () => current,
  writeUrl: filters => urls.push(filters),
  pendingTimeoutMs: 30, settleMs: 0,
});
let state: MarketFilters = { manufacturer: [], aircraftType: [], vintage: [] };
const base: MarketFilters = { manufacturer: [], aircraftType: [], vintage: [] };
let calls = 0;
const registerMarket = (ready = true) => controller.register("market-value-lease-rates", {
  ready, json: JSON.stringify(state), apply: s => { calls++; state = { ...base, ...s } as MarketFilters; },
});
registerMarket(false);
const queued = controller.applyAction("market-value-lease-rates", { manufacturer: "Airbus" });
assert.equal(calls, 0);
registerMarket();
assert.equal((await queued).ok, true);
assert.deepEqual(state.manufacturer, ["Airbus"]);
assert.equal(calls, 1);
assert.equal(navigations.length, 0, "Same module must not navigate or reload");
registerMarket();
assert.equal(calls, 1, "Re-registering must not replay actions");
assert.deepEqual(controller.getLive()?.filters.manufacturer, ["Airbus"]);

// The real chart filtering/range helpers respond to the same changed native state.
const rows: MarketRateRecord[] = [
  { id: 1, manufacturer: "Airbus", aircraftType: "A320neo", vintage: 2020, marketValue: 45, leaseRateLow: 0.2, leaseRateHigh: 0.3,
    aircraftRole: "Passenger", marketGroup: "", family: "", technology: "", icao1: "", icao2: "" },
  { id: 2, manufacturer: "Boeing", aircraftType: "737 MAX", vintage: 2020, marketValue: 50, leaseRateLow: 0.25, leaseRateHigh: 0.35,
    aircraftRole: "Passenger", marketGroup: "", family: "", technology: "", icao1: "", icao2: "" },
];
assert.deepEqual(marketRanges(filterMarketRows(rows, state), "market").map(r => r.name), ["A320neo"]);
await controller.applyAction("market-value-lease-rates", { manufacturer: ["Airbus", "Boeing"] });
assert.equal(marketRanges(filterMarketRows(rows, state), "market").length, 2);
await controller.applyAction("market-value-lease-rates", {});
assert.deepEqual(state, base, "Full reset must clear all omitted dimensions");
registerMarket();
await new Promise(r => setTimeout(r, 2));
state = { ...base, vintage: ["2020"] }; registerMarket();
assert.equal(urls.at(-1), null, "Manual changes clear stale assistant URLs");

let engineCalls = 0, engine: FilterMap = {};
const cross = controller.applyAction("engine-profile", JSON.stringify({ engineManufacturer: "General Electric" }));
assert.equal(navigations.at(-1), "/engine-profile");
controller.register("engine-profile", { ready: false, json: "{}", apply: s => { engineCalls++; engine = s; } });
assert.equal(engineCalls, 0);
controller.register("engine-profile", { ready: true, json: "{}", apply: s => { engineCalls++; engine = s; } });
assert.equal((await cross).ok, true);
assert.deepEqual(engine.engineManufacturer, ["General Electric"]);
assert.equal(engineCalls, 1);
controller.flush("engine-profile"); assert.equal(engineCalls, 1);

controller.register("engine-profile", { ready: true, json: "{}", apply: () => false });
assert.equal((await controller.applyAction("engine-profile", {})).ok, false);
assert.equal((await controller.applyAction("unknown-module", {})).ok, false);
assert.equal((await controller.applyAction("engine-profile", "invalid JSON")).ok, false);
const old = controller.applyAction("orders", {});
const newer = controller.applyAction("deliveries", {});
assert.equal((await old).ok, false);
controller.register("deliveries", { ready: true, json: "{}", apply: () => undefined });
assert.equal((await newer).ok, true);
const timeout = await controller.applyAction("jurisdiction-risk", {});
assert.equal(timeout.ok, false);
assert.equal(controller.getPending(), null);
for (const module of Object.keys(MODULE_KEYS) as ModuleSlug[]) {
  assert.deepEqual(sanitizeFilters(module, { arbitrary: "ignored" }), {});
}
assert.deepEqual(sanitizeFilters("airline-financials", { metricIds: [0, 22], period: "" }), { metricIds: "0,22", period: "" });
process.stdout.write("PASS: dynamic controller, chart recalculation, cross-module readiness, resets, failures and all-module allowlists\n");
