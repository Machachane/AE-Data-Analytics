import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { GetDeliveriesResponse, GetOrdersResponse, type SummaryOptions, type GetSummaryRecordsQueryParams } from "@workspace/api-zod";
import { registrySnapshotForSummary } from "./registry";
import { emissionsSnapshotForSummary } from "./emissions";
import { financialSnapshotForSummary } from "./airline-financials";
import { jurisdictionRisk } from "./jurisdiction-risk";
import { ObjectStorageService } from "./objectStorage";

export type SummaryQuery = Partial<ReturnType<typeof GetSummaryRecordsQueryParams.parse>>;
export const norm = (v: string) => v.trim().replace(/\s+/g, " ").toLowerCase();
const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });
export const compare = (a: string, b: string) => collator.compare(a, b);
export const DEFAULT_FROM = "2026-01-01", DEFAULT_TO = "2026-11-11";
interface Countries {
  version: number; registryRows: number; registrySignature: string;
  labels: string[]; codes: string[]; rows: number[]; aliases: Record<string, string>;
  countries: { id: string; name: string }[];
}
let loading: ReturnType<typeof load> | undefined;
async function load() {
  const [fleet, emissions, finance, risk, deliveryBytes, orderBytes, countryBytes] = await Promise.all([
    registrySnapshotForSummary(), emissionsSnapshotForSummary(), financialSnapshotForSummary(), jurisdictionRisk(),
    readFile(new URL("../data/deliveries.json", import.meta.url), "utf8"),
    readFile(new URL("../data/orders.json", import.meta.url), "utf8"),
    (async () => {
      const f = await new ObjectStorageService().getObjectEntityFile("/objects/analytics/summary-countries.json.gz");
      const [b] = await f.download(); return b;
    })(),
  ]);
  const countries = JSON.parse(gunzipSync(countryBytes).toString("utf8")) as Countries;
  const signature = createHash("sha256").update(JSON.stringify([fleet.dimensions, fleet.rows.map(r => r.slice(0, 13))])).digest("hex");
  if (countries.version !== 1 || countries.registryRows !== fleet.rows.length ||
      countries.registrySignature !== signature || countries.rows.length !== fleet.rows.length ||
      countries.labels.length !== countries.codes.length ||
      countries.rows.some(id => !Number.isInteger(id) || id < 0 || id >= countries.labels.length)) {
    throw new Error("Summary country binding does not match the current fleet snapshot; regenerate it before serving combined results");
  }
  const deliveries = GetDeliveriesResponse.parse(JSON.parse(deliveryBytes)).rows;
  const orders = GetOrdersResponse.parse(JSON.parse(orderBytes)).rows;
  return { fleet, emissions, finance, risk, deliveries, orders, countries };
}
export function summarySources() {
  if (!loading) loading = load().catch(e => { loading = undefined; throw e; });
  return loading;
}
export type SummarySources = Awaited<ReturnType<typeof summarySources>>;
export class SummaryQueryError extends Error {}
export function range(q: SummaryQuery) {
  const from = q.from || DEFAULT_FROM, to = q.to || DEFAULT_TO;
  for (const d of [from, to]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d)) || new Date(d).toISOString().slice(0, 10) !== d)
      throw new SummaryQueryError("Dates must be valid ISO calendar dates");
  }
  if (from > to) throw new SummaryQueryError("From must not be after To");
  return { from, to };
}
export const countryCode = (s: SummarySources, label: string) => s.countries.aliases[norm(label)] ?? (norm(label) ? `unmapped:${norm(label)}` : "__blank__");
export const fleetText = (s: SummarySources, i: number, c: number) => s.fleet.dimensions[c][s.fleet.rows[i][c] as number];
export function countrySelection(s: SummarySources, q: SummaryQuery) {
  if (!q.country) return "";
  const id = s.countries.countries.find(c => norm(c.id) === norm(q.country!))?.id;
  if (!id) throw new SummaryQueryError("Unknown country option");
  return id;
}
export function summaryKey(q: SummaryQuery) {
  const r = range(q);
  return JSON.stringify([r.from, r.to, q.country && norm(q.country), q.airline && norm(q.airline),
    q.model && norm(q.model), q.manufacturer && norm(q.manufacturer), q.aircraftModel && norm(q.aircraftModel)]);
}
const unique = (values: string[]) => [...new Map(values.filter(Boolean).map(x => [norm(x), x])).values()].sort(compare);
export async function summaryOptions(): Promise<SummaryOptions> {
  const s = await summarySources();
  return {
    defaultFrom: DEFAULT_FROM, defaultTo: DEFAULT_TO, countries: s.countries.countries,
    airlines: unique([...s.fleet.dimensions[5], ...s.emissions.dimensions[5], ...s.finance.dimensions[2], ...s.deliveries.map(r => r.customer), ...s.orders.map(r => r.customer)]),
    models: unique([...s.deliveries.map(r => r.model), ...s.orders.map(r => r.model)]),
    manufacturers: unique([...s.fleet.dimensions[0], ...s.deliveries.map(r => r.manufacturer), ...s.orders.map(r => r.manufacturer)]),
    aircraftModels: unique(s.fleet.dimensions[1]),
    shortcuts: [
      { id: "ratings", label: "AE+ Aviation Ratings®", url: null },
      { id: "ground", label: "Aircraft On Ground", url: null },
      { id: "tracker", label: "Flight Tracker", url: null },
      { id: "flyward", label: "Flyward", url: null },
    ],
    notes: [
      "Imported MASTER_DATABASE and AIRCRAFT_REGISTRY_FLEET_DATA_FINAL snapshots, not live feeds. Default/reset date range reproduces 1 January–11 November 2026. Dates apply to actual orders/deliveries dates, fleet NEAREST_MONTH_START and emissions source month; partial months are not prorated.",
      "Fleet KPIs count distinct source operator, MSN and ICAO model values, including the blank category. LTM hours/cycles sum all matching monthly observations, including overlapping LTM windows: these are report aggregates, not a deduplicated unique fleet's annual activity. FH/FC averages nonblank source ratios. Table entries keep the latest matching update for identical attributes and registered country.",
      "Country resolves verified ISO/common/official/source aliases using mledoze/countries (https://github.com/mledoze/countries, ODbL), identity enrichment only. In fleet it means aircraft registration country; in orders/deliveries it means customer country; in jurisdiction risk it means that country's legal scores. These are not airline headquarters. Unknown country labels stay explicitly unmapped rather than guessed.",
      "Airline matches fleet operator, OD customer, emissions airline and financial airline independently, case-insensitively; parenthetical lessor names are not fuzzy-matched. Model filters commercial OD models only; Aircraft Model filters fleet ICAO models and emissions ICAO only. There is no verified commercial-to-ICAO model crosswalk.",
      "Manufacturer filters fleet and OD directly. Country/manufacturer/aircraft-model emissions filtering uses exact source month + MSN + ICAO matches to the matching fleet; unmatched emissions records are excluded. Without those structural filters, emissions uses its own date and airline data without a fleet join.",
      "CO₂ rankings retain the Emissions page's inferred transport-weighted gCO₂e/RTK calculation: SUM(CO₂ mass) / SUM(mass / source RTK intensity). Incomplete denominators display unavailable zero, not zero emissions. Source outliers are retained. Up to 250 ranked rows are shown per ranking.",
      "The Summary screenshot's commercial-airline CO₂ ranking is not reconciled by the supplied source and existing inferred measure. Large source outliers and incomplete intensity denominators are retained rather than silently excluded. Original Power BI DAX, relationships and visual filters are needed to reproduce those particular reference figures exactly.",
      "OD engine values are vendor codes (CF, GE, PW, RR, NS and Unidentified), not detailed installed engine models. No reliable source relationship allocates OD quantities to LEAP-1B28 or other detailed fleet engine models, so this panel reports the available engine codes without invented allocations.",
      "Financials uses the financial year named by the range end-year and exact airline selection; other sidebar dimensions have no source relationship to financials. It sums all source periods/scopes/fiscal year-ends as an exploratory category view, not a consolidated accounting statement. USD source scale is retained; no amount multiplier is declared.",
      "To match the Summary reference presentation only, Current Liabilities, Non-Current Liabilities, Total Liabilities and Total Equity categories are sign-inverted. Liability metrics inside Current/Non-Current are also sign-inverted; other source signs are retained. Raw category sums are available separately. The Airline Financials page and its generated statements remain unmodified source amounts.",
      "The source's signed FY2026 Current/Non-Current aggregate is 100,017.927, rather than the reference image's 100,177.93. The actual source value is retained. Financial category totals and nested line items are not additive accounting totals.",
      "Jurisdiction scores are static source context filtered by country only; there is no score date, airline or aircraft relationship. High scores mean stronger/better repossession conditions (green); moderate amber, low red. Map locations are country centroids, not aircraft positions, and geography is bundled rather than fetched from external tile services.",
      "The four green shortcuts require user-provided destinations. An unconfigured shortcut explains that it is not connected; it does not imply live tracking, ratings or aircraft-on-ground data.",
    ],
  };
}
