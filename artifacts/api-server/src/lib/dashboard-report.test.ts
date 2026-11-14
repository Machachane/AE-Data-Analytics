import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { collectReportData, reportSection, ReportSelectionError, REPORT_LABELS } from "./dashboard-report-data";
import { writeReportNarrative, type ReportNarrative } from "./dashboard-report-ai";
import { ReportGenerationError } from "./dashboard-report-errors";
import { renderDashboardReport } from "./dashboard-report-pdf";
import type { DashboardReportInput } from "@workspace/api-zod";
import { MODULES } from "./assistant-data";

const dataset = JSON.parse(await readFile(new URL("../data/deliveries.json", import.meta.url), "utf8"));
const totals = new Map<string, number>();
for (const row of dataset.rows) if (row.date >= "2026-01-01" && row.date <= "2026-12-31")
  totals.set(row.customer, (totals.get(row.customer) ?? 0) + row.quantity);
const topFive = [...totals].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5);
const filters = { from: "2026-01-01", to: "2026-12-31", customer: topFive.map(([name]) => name), model: [], manufacturer: [], region: [] };
const data = await collectReportData({ module: "deliveries", currentFilters: JSON.stringify(filters) });
assert.deepEqual(data.filters.customer, filters.customer);
assert.equal(data.filters.from, filters.from);
assert.equal(data.filters.to, filters.to);
assert.equal(data.sections[0].metrics.find(m => m.label === "Aircraft quantity")?.value,
  new Intl.NumberFormat("en-GB").format(topFive.reduce((sum, [, quantity]) => sum + quantity, 0)));
assert.equal(data.sections[0].metrics.find(m => m.label === "Customers")?.value, "5");
assert.deepEqual(data.sections[1].tables[0].rows.map(row => row[0]), topFive.map(([name]) => name));
assert.equal(data.sections[1].metrics.length, 0);
assert.ok(!JSON.stringify(data).includes("riskGeography"));
assert.ok(!JSON.stringify(data).match(/Power\s*BI/i));
const empty = await collectReportData({ module: "deliveries", currentFilters: JSON.stringify({ from: "2099-01-01", to: "2099-12-31" }) });
const emirates = await collectReportData({ module: "deliveries", currentFilters: JSON.stringify({
  from: "2016-01-01", to: "2026-10-31", customer: ["EMIRATES"], model: ["A380"], region: [], manufacturer: [],
}) });
assert.equal(emirates.sections[0].metrics.find(m => m.label === "Aircraft quantity")?.value, "51");
assert.deepEqual(emirates.filters.model, ["A380"]);
assert.equal(empty.sections[0].metrics.find(m => m.label === "Aircraft quantity")?.value, "0");
assert.equal(empty.sections[1].tables.length, 0);
await assert.rejects(() => collectReportData({ module: "deliveries", currentFilters: "{bad" }), ReportSelectionError);
await assert.rejects(() => collectReportData({ module: "orders", currentFilters: '{"country":"Canada"}' }), ReportSelectionError);
for (const module of MODULES) {
  const result = await collectReportData({ module, currentFilters: "{}" });
  assert.equal(result.label, REPORT_LABELS[module]);
  assert.ok(result.sections[0].metrics.length > 0, `${module}: has verified numerical metrics`);
  assert.ok(result.notes.some(note => note.includes("imported")));
  assert.ok(!JSON.stringify(result).match(/Power\s*BI/i), `${module}: source software not exposed`);
}
const sample = reportSection({ id: "S1", module: "test", source: "", filters: "{}", href: "", queriedAt: "",
  result: JSON.stringify({ data: { dashboard: { total: null, kpis: { aircraft: 3 }, records: [{secret: "excluded"}] } } }) }, "Sample");
assert.equal(sample.metrics.find(m => m.label === "Total")?.value, "Unavailable");
assert.ok(!JSON.stringify(sample).includes("excluded"));
const originalFetch = globalThis.fetch;
const narrative: ReportNarrative = {
  summary: { text: "The selected deliveries are concentrated among the specified customers.", sectionIds: ["S1", "S2"] },
  highlights: [{ text: "Customer rankings reflect the selected period and exclude operators outside the current selection.", sectionIds: ["S2"] }],
};
let payload: { messages: { content: string }[] } | undefined;
try {
  globalThis.fetch = async (_url, init) => {
    payload = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(narrative) } }] }), { status: 200 });
  };
  assert.deepEqual(await writeReportNarrative(data, new AbortController().signal), narrative);
  assert.ok(payload?.messages[1].content.includes(filters.customer[0]));
  assert.ok(!payload?.messages[1].content.includes("secret"));
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ finish_reason: "stop",
    message: { content: JSON.stringify({ ...narrative, summary: { text: "Invented result.", sectionIds: ["S999"] } }) } }] }), { status: 200 });
  await assert.rejects(() => writeReportNarrative(data, new AbortController().signal), /verified/);
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ finish_reason: "length", message: { content: "{}" } }] }), { status: 200 });
  await assert.rejects(() => writeReportNarrative(data, new AbortController().signal), /incomplete/);
  globalThis.fetch = async () => new Response("provider details must not escape", { status: 503 });
  await assert.rejects(() => writeReportNarrative(data, new AbortController().signal), /temporarily unavailable/);
  let calls = 0;
  const retries: string[] = [];
  globalThis.fetch = async (_url, init) => {
    calls++;
    const content = calls === 1 ? { ...narrative, summary: { text: "A380 deliveries are selected.", sectionIds: ["S1"] } } : narrative;
    if (calls === 2) assert.ok(String(init?.body).includes("previous attempt failed validation"));
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }] });
  };
  assert.deepEqual(await writeReportNarrative(emirates, new AbortController().signal, code => retries.push(code)), narrative);
  assert.equal(calls, 2);
  assert.deepEqual(retries, ["ai_validation"]);
  calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"summary":null}' } }] });
  };
  await assert.rejects(() => writeReportNarrative(emirates, new AbortController().signal),
    (e: unknown) => e instanceof ReportGenerationError && e.code === "ai_validation" && !e.message.includes("null"));
  assert.equal(calls, 2, "Invalid commentary cannot retry indefinitely");
  for (const [status, code] of [[401, "provider_auth"], [429, "provider_limit"], [503, "provider_unavailable"]] as const) {
    calls = 0;
    globalThis.fetch = async () => { calls++; return new Response("private provider details", { status }); };
    await assert.rejects(() => writeReportNarrative(data, new AbortController().signal),
      (e: unknown) => e instanceof ReportGenerationError && e.code === code && e.providerStatus === status &&
        !e.message.includes("private provider details"));
    assert.equal(calls, 1);
  }
  globalThis.fetch = async () => { throw new Error("private connection details"); };
  await assert.rejects(() => writeReportNarrative(data, new AbortController().signal),
    (e: unknown) => e instanceof ReportGenerationError && e.code === "ai_connection");
} finally { globalThis.fetch = originalFetch; }
const pdf = await renderDashboardReport(data, narrative);
assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
await writeFile("/tmp/ae-report-test.pdf", pdf);
const pdfText = execFileSync("pdftotext", ["/tmp/ae-report-test.pdf", "-"], { encoding: "utf8" });
assert.ok(pdfText.includes("AI-powered dashboard report"));
assert.ok(pdfText.includes("2026-01-01"));
assert.ok(pdfText.includes("2026-12-31"));
assert.ok(pdfText.includes(filters.customer[0]));
assert.ok(pdfText.includes("Executive summary"));
assert.ok(pdfText.includes("Disclaimer"));
assert.ok(pdfText.includes("Sources and methodology"));
assert.ok(pdfText.includes(narrative.summary.text));
process.stdout.write("PASS: all eleven module report datasets, selected top-five scope and totals, empty results, invalid filters, AI validation and failures, and PDF signature/text/layout pagination.\n");
if (process.env.REPORT_LIVE_CHECK === "1") {
  const commentary = await writeReportNarrative(emirates, new AbortController().signal,
    code => process.stdout.write(`Live report recovered with automatic retry: ${code}\n`));
  const selectedPdf = await renderDashboardReport(emirates, commentary);
  assert.equal(selectedPdf.subarray(0, 5).toString(), "%PDF-");
  process.stdout.write("PASS: live Emirates/A380 AI commentary and PDF generation for 51 deliveries.\n");
}
