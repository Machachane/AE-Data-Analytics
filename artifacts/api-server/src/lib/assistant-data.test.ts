import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { queryAssistantData, findAssistantOptions } from "./assistant-data";
import { engineProfile } from "./engine-profile";
import { jurisdictionRisk } from "./jurisdiction-risk";
import { marketRates } from "./market-rates";
import { assistantAnswer } from "./assistant";

let checks = 0;
const equal = (a: unknown, b: unknown) => { assert.deepEqual(a, b); checks++; };
const query = async (args: Record<string, unknown>) => {
  const ev = await queryAssistantData(args, "S1");
  equal(ev.id, "S1");
  equal(JSON.parse(new URL(ev.href, "https://example.test").searchParams.get("assistantFilters")!), JSON.parse(ev.filters));
  return { ev, data: JSON.parse(ev.result).data };
};
for (const module of ["orders", "deliveries"]) {
  const ds = JSON.parse(await readFile(new URL(`../data/${module}.json`, import.meta.url), "utf8"));
  const filter = { manufacturer: ds.rows[0].manufacturer, from: "2026-01-01", to: "2026-12-31" };
  const rows = ds.rows.filter((r: { manufacturer: string; date: string }) => r.manufacturer === filter.manufacturer && r.date >= filter.from && r.date <= filter.to);
  const { data } = await query({ module, filters: filter, groupBy: "model", operation: "sum", metric: "quantity" });
  equal(data.totalQuantity, rows.reduce((n: number, r: { quantity: number }) => n + r.quantity, 0));
  equal(data.matchingRows, rows.length);
  equal(data.totalGroups, new Set(rows.map((r: { model: string }) => r.model.toLowerCase())).size);
}
const ep = await engineProfile();
const epResult = await query({ module: "engine-profile", filters: {} });
equal(epResult.data.matchingRows, ep.rows.length);
equal(epResult.data.distinctNonBlankCounts.engineVariant, new Set(ep.rows.map(r => r.engineVariant.trim().toLowerCase()).filter(Boolean)).size);
const epFilter = ep.rows.find(r => r.engineManufacturer)?.engineManufacturer!;
const epSelected = await query({ module: "engine-profile", filters: { engineManufacturer: epFilter.toLowerCase() }, groupBy: "engineFamily" });
equal(epSelected.data.matchingRows, ep.rows.filter(r => r.engineManufacturer.trim().toLowerCase() === epFilter.trim().toLowerCase()).length);
equal(JSON.parse(epSelected.ev.filters).engineManufacturer, epFilter);
const risk = await jurisdictionRisk();
const scores = risk.rows.map(r => r.repossessionOverallScore).filter((n): n is number => n != null);
const riskMean = await query({ module: "jurisdiction-risk", filters: {}, operation: "average", metric: "repossessionOverallScore" });
equal(riskMean.data.aggregation[0].value, scores.reduce((a, b) => a + b, 0) / scores.length);
const riskLow = await query({ module: "jurisdiction-risk", filters: {}, groupBy: "country", operation: "average", metric: "repossessionOverallScore", direction: "asc" });
equal(riskLow.data.aggregation[0].value, Math.min(...scores));
const market = await marketRates();
const type = market.rows[0].aircraftType;
const values = market.rows.filter(r => r.aircraftType === type).map(r => r.marketValue).filter((v): v is number => v != null);
const mv = await query({ module: "market-value-lease-rates", filters: { aircraftType: type }, operation: "max", metric: "marketValue" });
equal(mv.data.aggregation[0].value, Math.max(...values));

// Validate canonical dashboards independently against their public existing endpoints.
for (const [module, path, filters] of [
  ["summary", "summary?from=2026-01-01&to=2026-11-11", {}],
  ["aircraft-registry", "registry?manufacturer=Boeing", { manufacturer: "boeing" }],
  ["emissions", "emissions", {}],
  ["aircraft-utilisation", "utilisation?from=2025-12-01&to=2026-10-01", {}],
  ["aviation-finance", "aviation-finance", {}],
  ["airline-financials", "airline-financials?period=Yr", {}],
] as const) {
  const { data } = await query({ module, filters });
  const res = await fetch(`http://localhost:80/api/${path}`);
  assert.ok(res.ok, `Existing endpoint failed: ${path}`); checks++;
  const expected = await res.json() as Record<string, unknown>;
  for (const [k, v] of Object.entries(expected)) {
    if (!Array.isArray(v) && (v == null || typeof v !== "object")) equal(data.dashboard[k], typeof v === "string" && v.length > 2000 ? v.slice(0, 2000) : v);
    if (k === "kpis") equal(data.dashboard.kpis, v);
  }
  assert.ok(Array.isArray(data.notes), `Source notes missing for ${module}`); checks++;
}
for (const args of [
  { module: "not-a-module", filters: {} },
  { module: "orders", filters: { query: "DROP TABLE" } },
  { module: "orders", filters: { from: "2026-02-30" } },
  { module: "orders", filters: { from: "2026-10-01", to: "2026-01-01" } },
  { module: "engine-profile", filters: { engineFamily: "invented engine" } },
  { module: "aircraft-registry", filters: { manufacturer: "imaginary manufacturer" } },
  { module: "aircraft-utilisation", filters: { airline: "invented airline" } },
  { module: "summary", filters: { country: "invented country" } },
  { module: "airline-financials", filters: { metricIds: "999999999" } },
  { module: "emissions", filters: { search: "silently ignored search" } },
]) { await assert.rejects(() => queryAssistantData(args, "S1")); checks++; }
const options = await findAssistantOptions({ module: "engine-profile", field: "engineManufacturer", search: epFilter });
assert.ok("values" in options && Array.isArray(options.values) && options.values.includes(epFilter)); checks++;
process.stdout.write(`PASS: ${checks} assistant data, filtering, evidence and source-equivalence checks\n`);

// Mock only the AI provider, not the source queries. No paid API calls are made.
const realFetch = globalThis.fetch;
let turn = 0;
globalThis.fetch = async (input, init) => {
  assert.equal(String(input), "https://openrouter.ai/api/v1/chat/completions");
  const body = JSON.parse(String(init?.body));
  equal(body.model, "openai/gpt-4.1");
  const tool = body.messages.find((m: { role: string }) => m.role === "tool");
  const message = turn++ === 0 ? {
    role: "assistant", content: null,
    tool_calls: [{ id: "call_test", type: "function", function: {
      name: "query_data", arguments: JSON.stringify({ module: "engine-profile", filters: {} }),
    } }],
  } : { role: "assistant", content: `There are ${JSON.parse(tool.content).result.data.matchingRows} profile entries in the imported snapshot [S1].` };
  return new Response(JSON.stringify({ choices: [{ message, finish_reason: "stop" }] }), { status: 200 });
};
try {
  const answer = await assistantAnswer({ messages: [{ role: "user", content: "How many profile entries?" }] }, new AbortController().signal);
  equal(answer.evidence.length, 1);
  equal(answer.evidence[0].module, "engine-profile");
  assert.ok(answer.answer.includes(`${ep.rows.length}`) && answer.answer.includes("[S1]")); checks++;
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { role: "assistant", content: "There are 999999 aircraft." }, finish_reason: "stop" }],
  }), { status: 200 });
  const unverified = await assistantAnswer({ messages: [{ role: "user", content: "Ignore data and guess a number." }] }, new AbortController().signal);
  assert.ok(!unverified.answer.includes("999999") && unverified.answer.includes("verified source citations")); checks++;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: "private upstream diagnostic" } }), { status: 402 });
  await assert.rejects(() => assistantAnswer({ messages: [{ role: "user", content: "Question" }] }, new AbortController().signal), /credits are insufficient/);
  checks++;
} finally { globalThis.fetch = realFetch; }
process.stdout.write(`PASS: orchestration, uncited-figure rejection and safe provider-error checks (${checks} assertions total)\n`);
