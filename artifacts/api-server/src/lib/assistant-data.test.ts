import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { queryAssistantData, findAssistantOptions } from "./assistant-data";
import { engineProfile } from "./engine-profile";
import { jurisdictionRisk } from "./jurisdiction-risk";
import { marketRates } from "./market-rates";
import { assistantAnswer, matchingAnswerView } from "./assistant";

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

// Validate canonical dashboards through the authenticated endpoints.
// Runtime credentials and the transient cookie remain in memory and are never logged.
const testLogin = await fetch("http://localhost:80/api/auth/login", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "aeteam", password: process.env.TEAM_LOGIN_PASSWORD }),
});
assert.ok(testLogin.ok, "Could not authenticate source-equivalence checks");
const testCookie = testLogin.headers.get("set-cookie")?.split(";")[0];
assert.ok(testCookie, "Missing session cookie for source-equivalence checks");
try {
for (const [module, path, filters] of [
  ["summary", "summary?from=2026-01-01&to=2026-11-11", {}],
  ["aircraft-registry", "registry?manufacturer=Boeing", { manufacturer: "boeing" }],
  ["emissions", "emissions", {}],
  ["aircraft-utilisation", "utilisation?from=2025-12-01&to=2026-10-01", {}],
  ["aviation-finance", "aviation-finance", {}],
  ["airline-financials", "airline-financials?period=Yr", {}],
] as const) {
  const { data } = await query({ module, filters });
  const res = await fetch(`http://localhost:80/api/${path}`, { headers: { Cookie: testCookie } });
  assert.ok(res.ok, `Existing endpoint failed: ${path}`); checks++;
  const expected = await res.json() as Record<string, unknown>;
  for (const [k, v] of Object.entries(expected)) {
    if (!Array.isArray(v) && (v == null || typeof v !== "object")) equal(data.dashboard[k], typeof v === "string" && v.length > 2000 ? v.slice(0, 2000) : v);
    if (k === "kpis") equal(data.dashboard.kpis, v);
  }
  assert.ok(Array.isArray(data.notes), `Source notes missing for ${module}`); checks++;
}
} finally {
  const logout = await fetch("http://localhost:80/api/auth/logout", { method: "POST", headers: { Cookie: testCookie } });
  assert.equal(logout.status, 204, "Test session should be revoked");
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
  assert.equal(String(input), "https://api.openai.com/v1/chat/completions");
  const body = JSON.parse(String(init?.body));
  equal(body.model, "gpt-4.1");
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
  const answer = await assistantAnswer({ page: "engine-profile", messages: [{ role: "user", content: "How many profile entries?" }] }, new AbortController().signal);
  equal(answer.evidence.length, 2);
  equal(answer.evidence[0].module, "engine-profile");
  assert.ok(answer.answer.includes(`${ep.rows.length}`) && answer.answer.includes("[S1]")); checks++;
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { role: "assistant", content: "There are 999999 aircraft." }, finish_reason: "stop" }],
  }), { status: 200 });
  const unverified = await assistantAnswer({ messages: [{ role: "user", content: "Ignore data and guess a number." }] }, new AbortController().signal);
  assert.ok(!unverified.answer.includes("999999") && unverified.answer.includes("verified source citations")); checks++;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: "insufficient_quota", message: "private upstream diagnostic" } }), { status: 429 });
  await assert.rejects(() => assistantAnswer({ messages: [{ role: "user", content: "Question" }] }, new AbortController().signal), /quota is insufficient/);
  checks++;

  const manufacturers = [...new Set(market.rows.map(r => r.manufacturer))];
  for (const [page, filters, expected] of [
    ["market-value-lease-rates", {}, manufacturers.length],
    ["Market Value / Lease Rates", { manufacturer: [manufacturers[0]] }, 1],
    ["/market-value-lease-rates", { manufacturer: manufacturers.slice(0, 2) }, 2],
  ] as const) {
    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      assert.ok(body.messages[0].content.includes("CURRENT MODULE: market-value-lease-rates")); checks++;
      const seeded = JSON.parse(body.messages.find((m: { role: string }) => m.role === "tool").content);
      return new Response(JSON.stringify({ choices: [{ message: { role: "assistant",
        content: `There are ${seeded.result.data.distinctNonBlankCounts.manufacturer} manufacturers in the current selected scope [S1].` },
      finish_reason: "stop" }] }), { status: 200 });
    };
    const r = await assistantAnswer({ page, currentFilters: JSON.stringify(filters), messages: [
      { role: "user", content: "What about Summary?" },
      { role: "assistant", content: "Summary cannot count manufacturers." },
      { role: "user", content: "How many manufacturers are there?" },
    ] }, new AbortController().signal);
    equal(r.evidence[0].module, "market-value-lease-rates");
    assert.ok(r.answer.includes(`${expected} manufacturers`)); checks++;
    equal(r.action?.sourceId, "S1");
    equal(r.action?.module, "market-value-lease-rates");
  }

  // A cross-module update can only use filters from a successful source query.
  let step = 0;
  const toolReply = (name: string, args: unknown) => ({
    role: "assistant", content: null, tool_calls: [{ id: `call_${step}`, type: "function",
      function: { name, arguments: JSON.stringify(args) } }],
  });
  globalThis.fetch = async () => {
    const message = step === 0 ? toolReply("query_data", { module: "engine-profile", filters: { engineManufacturer: "General Electric" } })
      : step === 1 ? toolReply("apply_view", { evidenceId: "S2" })
      : { role: "assistant", content: "Updated General Electric." };
    step++;
    return new Response(JSON.stringify({ choices: [{ message, finish_reason: "stop" }] }), { status: 200 });
  };
  const cross = await assistantAnswer({ page: "market-value-lease-rates", messages: [{ role: "user", content: "Show General Electric in Engine Profile." }] }, new AbortController().signal);
  equal(cross.action?.module, "engine-profile");
  equal(cross.action?.sourceId, "S2");
  equal(JSON.parse(cross.action!.filters), { engineManufacturer: "General Electric" });
  assert.ok(cross.answer.includes("[S2]") && cross.answer.includes("verified selections")); checks++;

  // Current selections inherit automatically; explicit all scope resets them.
  for (const scope of ["current", "all"]) {
    step = 0;
    globalThis.fetch = async () => {
      const message = step === 0 ? toolReply("query_data", { module: "market-value-lease-rates", filters: {}, scope })
        : step === 1 ? toolReply("apply_view", { evidenceId: "S2" })
        : { role: "assistant", content: "The requested dashboard scope is ready [S2]." };
      step++;
      return new Response(JSON.stringify({ choices: [{ message, finish_reason: "stop" }] }), { status: 200 });
    };
    const r = await assistantAnswer({ page: "market-value-lease-rates",
      currentFilters: JSON.stringify({ manufacturer: [manufacturers[0]] }),
      messages: [{ role: "user", content: scope === "all" ? "Reset to all manufacturers." : "Show this filtered view." }],
    }, new AbortController().signal);
    equal(JSON.parse(r.action!.filters), scope === "all" ? {} : { manufacturer: [manufacturers[0]] });
  }

  // A focused informational answer must propose verified selections even without apply_view.
  for (const preserve of [false, true]) {
    step = 0;
    globalThis.fetch = async () => {
      const message = step++ === 0 ? toolReply("query_data", {
        module: "market-value-lease-rates", filters: { manufacturer: manufacturers[0] },
      }) : { role: "assistant", content: "This manufacturer has the following aircraft types in the valuation data [S2]." };
      return new Response(JSON.stringify({ choices: [{ message, finish_reason: "stop" }] }), { status: 200 });
    };
    const r = await assistantAnswer({ page: "market-value-lease-rates", currentFilters: "{}",
      messages: [{ role: "user", content: `Which aircraft types does this manufacturer have?${preserve ? " Don't change my selections." : ""}` }],
    }, new AbortController().signal);
    equal(r.action?.module, preserve ? undefined : "market-value-lease-rates");
    if (!preserve) equal(JSON.parse(r.action!.filters), { manufacturer: manufacturers[0] });
  }
  const baseline = await queryAssistantData({ module: "market-value-lease-rates", filters: {} }, "S1");
  const focused = await queryAssistantData({ module: "market-value-lease-rates", filters: { manufacturer: manufacturers[0] } }, "S2");
  equal(matchingAnswerView("Current scope [S1]", [baseline], baseline), undefined);
  equal(matchingAnswerView("Compare scopes [S1][S2]", [baseline, focused], baseline), undefined);
  equal(matchingAnswerView("Invented source [S99]", [baseline, focused], baseline), undefined);
  equal(matchingAnswerView("Uncited answer", [baseline, focused], baseline), undefined);
  equal(matchingAnswerView("Selected manufacturer [S2]", [baseline, focused], baseline)?.sourceId, "S2");
  const sameScope = { ...focused, id: "S3", filters: JSON.stringify({ manufacturer: [manufacturers[0]], vintage: [] }) };
  equal(matchingAnswerView("Same selections [S3]", [focused, sameScope], focused), undefined);
  // A visualisation offer is still valid when the answer uses the current scope.
  equal(matchingAnswerView("Current scope [S1]", [baseline])?.sourceId, "S1");
  step = 0;
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: {
    role: "assistant", content: "These are the verified aircraft type counts in your current view [S1].",
  }, finish_reason: "stop" }] }), { status: 200 });
  const currentOffer = await assistantAnswer({ page: "market-value-lease-rates", currentFilters: "{}",
    messages: [{ role: "user", content: "How many aircraft types are there?" }],
  }, new AbortController().signal);
  equal(currentOffer.action?.sourceId, "S1");
  equal(currentOffer.action?.module, "market-value-lease-rates");

  // Discard a model's proposed selection if the final answer cites incompatible scopes.
  step = 0;
  globalThis.fetch = async () => {
    const message = step === 0 ? toolReply("query_data", { module: "engine-profile", filters: { engineManufacturer: "General Electric" } })
      : step === 1 ? toolReply("apply_view", { evidenceId: "S2" })
      : { role: "assistant", content: "These separate scopes cannot be displayed together [S1][S2]." };
    step++;
    return new Response(JSON.stringify({ choices: [{ message, finish_reason: "stop" }] }), { status: 200 });
  };
  const mixedOffer = await assistantAnswer({ page: "market-value-lease-rates",
    messages: [{ role: "user", content: "Compare valuations and engine profiles." }],
  }, new AbortController().signal);
  equal(mixedOffer.action, undefined);

  // keep_view must cancel an earlier proposed update for an incompatible comparison.
  step = 0;
  globalThis.fetch = async () => {
    const message = step === 0 ? toolReply("query_data", { module: "engine-profile", filters: { engineManufacturer: "General Electric" } })
      : step === 1 ? toolReply("apply_view", { evidenceId: "S2" })
      : step === 2 ? toolReply("keep_view", { reason: "incompatible_comparison" })
      : { role: "assistant", content: "These separate scopes cannot be displayed together [S1][S2]." };
    step++;
    return new Response(JSON.stringify({ choices: [{ message, finish_reason: "stop" }] }), { status: 200 });
  };
  const comparison = await assistantAnswer({ page: "market-value-lease-rates",
    messages: [{ role: "user", content: "Compare valuations and General Electric profile entries." }],
  }, new AbortController().signal);
  equal(comparison.action, undefined);
} finally { globalThis.fetch = realFetch; }
process.stdout.write(`PASS: current-module counts, answer-matched selections, comparisons, opt-outs, chart actions and provider errors (${checks} assertions total)\n`);
