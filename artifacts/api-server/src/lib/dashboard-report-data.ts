import type { AssistantEvidence, DashboardReportInput } from "@workspace/api-zod";
import { assistantFilters, queryAssistantData, type AssistantFilters } from "./assistant-data";

export const REPORT_LABELS: Record<DashboardReportInput["module"], string> = {
  summary: "Summary", deliveries: "Deliveries", orders: "Orders", "aircraft-utilisation": "Aircraft Utilisation",
  "aviation-finance": "Aviation Finance", "airline-financials": "Airline Financials",
  "market-value-lease-rates": "Market Value / Lease Rates", emissions: "Emissions",
  "aircraft-registry": "Aircraft Registry", "engine-profile": "Engine Profile", "jurisdiction-risk": "Jurisdiction Risk",
};
export type ReportTable = { title: string; columns: string[]; rows: string[][]; note: string };
export type ReportSection = { id: string; title: string; metrics: { label: string; value: string }[]; tables: ReportTable[] };
export type ReportData = {
  module: DashboardReportInput["module"]; label: string; generatedAt: string;
  filters: AssistantFilters; sections: ReportSection[]; notes: string[]; sources: { id: string; source: string }[];
};
export class ReportSelectionError extends Error {}
export const reportWording = (v: string) => v.replace(/Power\s*BI/gi, "source dashboard");
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const labelOverrides: Record<string, string> = {
  hoursLtm: "Total flight hours (LTM)", cyclesLtm: "Total flight cycles (LTM)", avgRatio: "Average flight hours / cycles ratio",
  sourceRows: "Source rows (not distinct aircraft)", aircraft: "Distinct aircraft", models: "Models", airlines: "Airlines",
  totalHoursLtm: "Total flight hours (LTM)", totalCyclesLtm: "Total flight cycles (LTM)", totalQuantity: "Aircraft quantity",
  matchingRows: "Matching source rows", repossessionOverallScore: "Repossession overall score",
  rows: "Source rows", nonNullValues: "Non-blank observations",
  distinctNonBlankCounts: "Distinct non-blank counts", aircraftManufacturer: "Aircraft manufacturer",
};
export const reportLabel = (key: string) => labelOverrides[key] ??
  key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ").replace(/^./, s => s.toUpperCase());
const valueText = (v: unknown) => v == null ? "Unavailable" : typeof v === "number"
  ? new Intl.NumberFormat("en-GB", { maximumSignificantDigits: 12 }).format(v)
  : reportWording(String(v));
const omit = new Set(["records", "riskGeography", "geography", "geojson", "notes", "warning", "rankingLimit",
  "recordsShown", "recordsAreSample", "totalGroups", "groupBy", "metric", "operation", "direction",
  "firstAirline", "firstFinancialYear", "firstPeriod", "id", "metricId", "sourceMetricId", "sourceCategoryId"]);

/** Only copies server-calculated values. Never totals sampled/truncated arrays. */
export function reportSection(evidence: AssistantEvidence, title: string): ReportSection {
  const envelope = JSON.parse(evidence.result);
  const data = envelope.data.dashboard ?? envelope.data;
  const section: ReportSection = { id: evidence.id, title, metrics: [], tables: [] };
  const visit = (node: Record<string, unknown>, prefix = "", depth = 0) => {
    for (const [key, value] of Object.entries(node)) {
      if (omit.has(key)) continue;
      const name = [prefix, reportLabel(key)].filter(Boolean).join(" / ");
      if (typeof value === "number" || value === null) section.metrics.push({ label: name, value: valueText(value) });
      else if (Array.isArray(value) && value.length && value.every(object) && section.tables.length < 10) {
        const keys = [...new Set(value.flatMap(row => Object.keys(row)))].filter(k =>
          !omit.has(k) && value.some(row => typeof row[k] === "number") ||
          !omit.has(k) && value.some(row => typeof row[k] === "string") && !value.some(row => object(row[k]) || Array.isArray(row[k]))
        ).slice(0, 6);
        if (!keys.some(k => value.some(row => typeof row[k] === "number"))) continue;
        section.tables.push({
          title: name, columns: keys.map(reportLabel),
          rows: value.slice(0, 10).map(row => keys.map(k => valueText(row[k]))),
          note: `Showing ${Math.min(10, value.length)} source results. Lists may be bounded; totals above are calculated from the full selected data, not these displayed rows.`,
        });
      } else if (object(value) && depth < 2) visit(value, key === "kpis" ? prefix : name, depth + 1);
    }
  };
  visit(data);
  return section;
}

const extraQueries: Partial<Record<DashboardReportInput["module"], Record<string, unknown>[]>> = {
  deliveries: ["customer", "model", "region", "manufacturer"].map(groupBy => ({ groupBy, metric: "quantity", operation: "sum" })),
  orders: ["customer", "model", "region", "manufacturer"].map(groupBy => ({ groupBy, metric: "quantity", operation: "sum" })),
  "engine-profile": ["engineManufacturer", "engineFamily", "aircraftManufacturer"].map(groupBy => ({ groupBy, operation: "count" })),
  "jurisdiction-risk": [
    { metric: "repossessionOverallScore", operation: "average" },
    { metric: "deregistrationScore", operation: "average" },
    { groupBy: "country", metric: "repossessionOverallScore", operation: "average" },
    { groupBy: "country", metric: "deregistrationScore", operation: "average" },
    { groupBy: "repossessionCategory", operation: "count" },
  ],
  "market-value-lease-rates": ["marketValue", "leaseRateLow", "leaseRateHigh"].map(metric => ({ groupBy: "aircraftType", metric, operation: "average" })),
};
const semanticNotes: Partial<Record<DashboardReportInput["module"], string[]>> = {
  summary: ["Summary combines separate source datasets. Each selection affects only the panels supported by that dashboard; unrelated reference panels are not implied to share a country or airline join."],
  "aircraft-registry": ["Aircraft counts use distinct MSNs. Manufacturer chart observations count monthly source observations and are not distinct fleet counts."],
  "engine-profile": ["Counts represent engine profile entries, not aircraft fleet or installed-engine counts."],
  "jurisdiction-risk": ["Higher overall repossession scores indicate better conditions; high is green. Overall repossession and repossession scores are separate measures."],
  "market-value-lease-rates": ["Values and lease-rate amounts are in USD millions; lease rates are monthly. Averages across selected vintages are reference summaries, not individual aircraft valuations."],
  emissions: ["The dashboard's CO2 intensity is inferred transport-weighted, not a simple average. Missing denominators remain unavailable; source outliers are retained."],
  "airline-financials": ["Amounts are raw source-reported values, not automatically USD millions. Fiscal year-end, currency, period and reporting scope distinguish statements. Aggregated metric totals are exploratory and must not be treated as one consolidated financial statement."],
  "aviation-finance": ["Year and reporting period select the financing snapshot. Separate reference analyses use fixed source context and must not be attributed to a different selected reporting period."],
};
function collectNotes(value: unknown, notes: Set<string>) {
  if (!object(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (key === "notes" && Array.isArray(item)) item.filter(v => typeof v === "string").forEach(v => notes.add(reportWording(v)));
    else if (key === "warning" && typeof item === "string") notes.add(reportWording(item));
    else if (object(item)) collectNotes(item, notes);
  }
}
export async function collectReportData(input: DashboardReportInput): Promise<ReportData> {
  let filters: AssistantFilters;
  let base: AssistantEvidence;
  try {
    filters = assistantFilters(JSON.parse(input.currentFilters));
    base = await queryAssistantData({ module: input.module, filters }, "S1");
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof Error && /filter|select|unknown|unsupported|ISO|date|From must|Invalid|Too big|Too small/i.test(error.message))
      throw new ReportSelectionError("The selected filters could not be validated. Refresh the dashboard and try again.");
    throw error;
  }
  const notes = new Set<string>([
    "Generated from imported source snapshots using the selections captured when Generate AI Report was clicked. Query time does not imply live external data.",
    "All numerical tables are produced by validated server queries. AI commentary is interpretive and should be checked against the cited data before making material decisions.",
    ...(semanticNotes[input.module] ?? []),
  ]);
  const evidence = [base];
  for (const query of extraQueries[input.module] ?? []) {
    evidence.push(await queryAssistantData({ module: input.module, filters, ...query }, `S${evidence.length + 1}`));
  }
  evidence.forEach(item => {
    const data = JSON.parse(item.result).data;
    collectNotes(data, notes);
    if (typeof data.units === "string") notes.add(`Source units: ${data.units}`);
    if (data.sourceDateRange?.from && data.sourceDateRange?.to)
      notes.add(`Source dataset date coverage: ${data.sourceDateRange.from} to ${data.sourceDateRange.to}.`);
    if (data.sourceDate) notes.add(`Source-reported date: ${data.sourceDate}.`);
  });
  const sections = evidence.map((item, index) => {
    const query = extraQueries[input.module]?.[index - 1];
    const title = index === 0 ? "Dashboard overview" :
      `${query?.metric ? `${reportLabel(String(query.metric))} (${query.operation})` : "Profile / source counts"}${query?.groupBy ? ` by ${reportLabel(String(query.groupBy))}` : " across selected data"}`;
    const section = reportSection(item, title);
    if (index > 0) section.metrics = []; // Do not repeat the same overview under every breakdown.
    if (index === 0 && extraQueries[input.module]) section.tables = [];
    return section;
  });
  return { module: input.module, label: REPORT_LABELS[input.module], generatedAt: new Date().toISOString(),
    // Keep explicit All/blank selections as well as server-resolved dates/defaults.
    filters: { ...filters, ...JSON.parse(base.filters) }, sections, notes: [...notes],
    sources: evidence.map(({ id, source }) => ({ id, source })) };
}
