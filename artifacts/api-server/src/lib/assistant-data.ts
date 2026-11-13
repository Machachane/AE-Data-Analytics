import { readFile } from "node:fs/promises";
import {
  GetDeliveriesResponse, GetOrdersResponse, GetSummaryQueryParams,
  GetRegistryQueryParams, GetEmissionsQueryParams, GetUtilisationQueryParams,
  GetAviationFinanceQueryParams, GetAirlineFinancialsQueryParams,
  type AssistantEvidence,
} from "@workspace/api-zod";
import { summaryOptions } from "./summary-sources";
import { summaryDashboard } from "./summary";
import { registryDashboard, registryOptions, registryRecords } from "./registry";
import { emissionsDashboard, emissionsOptions, emissionsRecords } from "./emissions";
import { utilisationDashboard, utilisationOptions } from "./utilisation";
import { aviationFinance } from "./aviation-finance";
import { financialDashboard, financialOptions, financialRecords } from "./airline-financials";
import { engineProfile } from "./engine-profile";
import { jurisdictionRisk } from "./jurisdiction-risk";
import { marketRates } from "./market-rates";

export const MODULES = ["summary", "deliveries", "orders", "aircraft-utilisation", "aviation-finance",
  "airline-financials", "market-value-lease-rates", "emissions", "aircraft-registry", "engine-profile", "jurisdiction-risk"] as const;
type Module = typeof MODULES[number];
export type AssistantFilters = Record<string, string | string[]>;
type Row = Record<string, unknown>;
const FIELDS: Partial<Record<Module, string[]>> = {
  deliveries: ["from", "to", "customer", "region", "model", "manufacturer"],
  orders: ["from", "to", "customer", "region", "model", "manufacturer"],
  "engine-profile": ["aircraftManufacturer", "engineManufacturer", "engineVariant", "engineFamily", "aircraftType"],
  "jurisdiction-risk": ["country", "jurisdictionType", "region", "repossessionCategory", "lawCompliance"],
  "market-value-lease-rates": ["manufacturer", "aircraftType", "vintage"],
};
const SOURCE: Record<Module, string> = {
  summary: "MASTER_DATABASE + AIRCRAFT_REGISTRY_FLEET_DATA_FINAL",
  deliveries: "MASTER_DATABASE / OD_DELIVERIES", orders: "MASTER_DATABASE / OD_ORDERS",
  "engine-profile": "MASTER_DATABASE / ENGINE_PROFILE",
  "jurisdiction-risk": "MASTER_DATABASE / JURISDICTION_RISK_ANALYSIS",
  "market-value-lease-rates": "MASTER_DATABASE / MARKET_VALUE_LEASE_RATES",
  "aircraft-registry": "AIRCRAFT_REGISTRY_FLEET_DATA_FINAL",
  "aircraft-utilisation": "AIRCRAFT_REGISTRY_FLEET_DATA_FINAL",
  emissions: "MASTER_DATABASE / EMISSIONS_ANALYSIS",
  "airline-financials": "MASTER_DATABASE / TIRALIS_AIRLINE_FINANCIAL",
  "aviation-finance": "MLA_CM_CO_MERGED + BORROWER_transposed + Aviation_Analyses",
};
const norm = (v: unknown) => String(v ?? "").trim().replace(/\s+/g, " ").toLowerCase();
let deliveryData: ReturnType<typeof GetDeliveriesResponse.parse> | undefined;
let orderData: ReturnType<typeof GetOrdersResponse.parse> | undefined;
async function rawDataset(module: Module): Promise<{ rows: Row[]; notes?: string[]; [k: string]: unknown }> {
  if (module === "deliveries") {
    deliveryData ??= GetDeliveriesResponse.parse(JSON.parse(await readFile(new URL("../data/deliveries.json", import.meta.url), "utf8")));
    return deliveryData;
  }
  if (module === "orders") {
    orderData ??= GetOrdersResponse.parse(JSON.parse(await readFile(new URL("../data/orders.json", import.meta.url), "utf8")));
    return orderData;
  }
  if (module === "engine-profile") { const ds = await engineProfile(); return { ...ds, rows: ds.rows.map(r => ({ ...r })) }; }
  if (module === "jurisdiction-risk") { const ds = await jurisdictionRisk(); return { ...ds, rows: ds.rows.map(r => ({ ...r })) }; }
  if (module === "market-value-lease-rates") { const ds = await marketRates(); return { ...ds, rows: ds.rows.map(r => ({ ...r })) }; }
  throw new Error("This module uses its validated dashboard queries, not a raw dataset.");
}
function moduleName(value: unknown): Module {
  if (!MODULES.includes(value as Module)) throw new Error("Unknown module. Use a listed module.");
  return value as Module;
}
export function assistantFilters(value: unknown): AssistantFilters {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Filters must be an object of string values");
  const entries = Object.entries(value);
  const validValue = (v: unknown) => typeof v === "string" ? v.length <= 512
    : Array.isArray(v) && v.length <= 300 && v.every(x => typeof x === "string" && x.length <= 512);
  if (entries.length > 12 || entries.some(([k, v]) => k.length > 40 || !validValue(v)))
    throw new Error("Invalid filters");
  return Object.fromEntries(entries) as AssistantFilters;
}
function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value) throw new Error("Use a real ISO date YYYY-MM-DD");
}
function strictKeys(filters: AssistantFilters, keys: string[]) {
  const unknown = Object.keys(filters).filter(k => !keys.includes(k));
  if (unknown.length) throw new Error(`Unsupported filter(s): ${unknown.join(", ")}. Supported: ${keys.join(", ")}`);
}
function canonicalRaw(module: Module, filters: AssistantFilters, rows: Row[]) {
  strictKeys(filters, FIELDS[module]!);
  const result = { ...filters };
  for (const [key, value] of Object.entries(result)) {
    if (value === "" || Array.isArray(value) && !value.length) { delete result[key]; continue; }
    if (key === "from" || key === "to") {
      if (typeof value !== "string") throw new Error("Invalid date selection");
      validDate(value); continue;
    }
    const resolve = (v: string) => {
      const match = rows.find(r => norm(r[key]) === norm(v));
      if (!match) throw new Error(`Unknown ${key} "${v}". Look up exact values with find_options before querying.`);
      return String(match[key]);
    };
    result[key] = Array.isArray(value) ? [...new Set(value.map(resolve))] : resolve(value);
  }
  if (result.from && result.to && result.from > result.to) throw new Error("From must not be after To");
  return result;
}
function bounded(value: unknown, path = "result", cuts: string[] = []): unknown {
  if (Array.isArray(value)) {
    if (value.length > 15) cuts.push(`${path}: showing 15 of ${value.length}; not a full listing`);
    return value.slice(0, 15).map((v, i) => bounded(v, `${path}[${i}]`, cuts));
  }
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, bounded(v, `${path}.${k}`, cuts)]));
  if (typeof value === "string" && value.length > 2000) { cuts.push(`${path}: long text shortened`); return value.slice(0, 2000); }
  return value;
}
function parseFilters<T>(schema: { parse: (v: unknown) => T; shape: Record<string, unknown> }, f: Record<string, string>): T {
  strictKeys(f, Object.keys(schema.shape));
  return schema.parse(f);
}
async function nativeOptions(module: Module): Promise<Row> {
  switch (module) {
    case "summary": return { ...await summaryOptions() };
    case "aircraft-registry": return { ...await registryOptions() };
    case "emissions": return { ...await emissionsOptions() };
    case "aircraft-utilisation": return { ...await utilisationOptions() };
    case "airline-financials": return { ...await financialOptions() };
    case "aviation-finance": return { ...await aviationFinance({}) };
    default: throw new Error("Unsupported module options");
  }
}
const optionKeys: Partial<Record<Module, Record<string, string>>> = {
  summary: { country: "countries", airline: "airlines", model: "models", manufacturer: "manufacturers", aircraftModel: "aircraftModels" },
  "aircraft-registry": { manufacturer: "manufacturers", model: "models", registration: "registrations", msn: "msns", operator: "operators", owner: "owners", aircraftType: "aircraftTypes" },
  emissions: { date: "dates", msn: "msns", icao: "icaos", airline: "airlines", engine: "engines" },
  "aircraft-utilisation": { airline: "airlines", model: "models", manufacturer: "manufacturers", msn: "msns", engine: "engines" },
  "airline-financials": { airline: "airlines", financialYear: "financialYears", period: "periods" },
  "aviation-finance": { year: "years", period: "periods" },
};
function canonicalNative(module: Module, input: Record<string, string>, options: Row) {
  const filters = { ...input };
  for (const [key, value] of Object.entries(filters)) {
    if (key === "from" || key === "to") { validDate(value); continue; }
    const optionKey = optionKeys[module]?.[key];
    if (!optionKey || !value) continue; // Native schema below rejects unsupported keys.
    const values = options[optionKey];
    if (!Array.isArray(values)) throw new Error(`Source has no options for ${key}`);
    const match = values.find(v => norm(typeof v === "object" && v !== null ? v.id : v) === norm(value));
    if (match === undefined) throw new Error(`Unknown ${key} "${value}". Use find_options with field ${optionKey} to resolve the exact source value.`);
    filters[key] = String(typeof match === "object" && match !== null ? match.id : match);
  }
  if (module === "summary") { filters.from ??= String(options.defaultFrom); filters.to ??= String(options.defaultTo); }
  if (module === "aircraft-utilisation") { filters.from ??= String(options.minDate); filters.to ??= String(options.maxDate); }
  if (module === "airline-financials") filters.period ??= String(options.defaultPeriod);
  if (module === "aviation-finance") {
    filters.year ??= String(options.defaultYear); filters.period ??= String(options.defaultPeriod);
  }
  if (filters.from && filters.to && filters.from > filters.to) throw new Error("From must not be after To");
  return filters;
}
async function nativeQuery(module: Module, filters: Record<string, string>, records: boolean) {
  switch (module) {
    case "summary": return summaryDashboard(parseFilters(GetSummaryQueryParams, filters));
    case "aircraft-registry": return records
      ? registryRecords({ ...parseFilters(GetRegistryQueryParams, filters), limit: 15, offset: 0 })
      : registryDashboard(parseFilters(GetRegistryQueryParams, filters));
    case "emissions": return records
      ? emissionsRecords({ ...parseFilters(GetEmissionsQueryParams, filters), limit: 15, offset: 0 })
      : emissionsDashboard(parseFilters(GetEmissionsQueryParams, filters));
    case "aircraft-utilisation": return utilisationDashboard(parseFilters(GetUtilisationQueryParams, filters));
    case "aviation-finance": return aviationFinance(parseFilters(GetAviationFinanceQueryParams, filters));
    case "airline-financials": return records
      ? financialRecords({ ...parseFilters(GetAirlineFinancialsQueryParams, filters), limit: 15, offset: 0 })
      : financialDashboard(parseFilters(GetAirlineFinancialsQueryParams, filters));
    default: throw new Error("Unsupported dashboard");
  }
}
const metricFields: Partial<Record<Module, string[]>> = {
  deliveries: ["quantity"], orders: ["quantity"],
  "jurisdiction-risk": ["deregistrationScore", "repossessionScore", "repossessionOverallScore"],
  "market-value-lease-rates": ["marketValue", "leaseRateLow", "leaseRateHigh"],
};
function aggregate(rows: Row[], groupBy: string, metric: string, operation: string, direction: string) {
  const groups = new Map<string, Row[]>();
  const labels = new Map<string, string>();
  for (const row of rows) {
    const name = groupBy ? String(row[groupBy] ?? "(Blank)") : "All matching rows";
    const key = labels.get(norm(name)) ?? name;
    labels.set(norm(name), key);
    const g = groups.get(key) ?? []; g.push(row); groups.set(key, g);
  }
  const result = [...groups.entries()].map(([name, group]) => {
    const nums = group.map(r => r[metric]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const value = operation === "count" ? group.length : !nums.length ? null
      : operation === "sum" ? nums.reduce((a, b) => a + b, 0)
      : operation === "average" ? nums.reduce((a, b) => a + b, 0) / nums.length
      : operation === "min" ? Math.min(...nums) : Math.max(...nums);
    return { name, value, rows: group.length, nonNullValues: metric ? nums.length : group.length };
  });
  return result.sort((a, b) => a.value == null ? (b.value == null ? a.name.localeCompare(b.name) : 1) : b.value == null ? -1 :
    (direction === "asc" ? a.value - b.value : b.value - a.value) || a.name.localeCompare(b.name));
}
export async function queryAssistantData(args: Record<string, unknown>, id: string): Promise<AssistantEvidence> {
  const module = moduleName(args.module);
  let filters = assistantFilters(args.filters);
  let result: unknown;
  if (FIELDS[module]) {
    const ds = await rawDataset(module);
    filters = canonicalRaw(module, filters, ds.rows);
    if (module === "orders" || module === "deliveries") {
      filters.from ??= "2016-01-01";
      filters.to ??= module === "orders" ? "2026-10-30" : "2026-10-31";
    }
    let rows = ds.rows.filter(row => Object.entries(filters).every(([k, v]) =>
      k === "from" ? String(row.date) >= String(v) : k === "to" ? String(row.date) <= String(v)
      : (Array.isArray(v) ? v : [v]).some(value => norm(row[k]) === norm(value))));
    const groupBy = typeof args.groupBy === "string" ? args.groupBy : "";
    const metric = typeof args.metric === "string" ? args.metric : "";
    const operation = typeof args.operation === "string" ? args.operation : "count";
    const direction = args.direction === "asc" ? "asc" : "desc";
    if (!["count", "sum", "average", "min", "max"].includes(operation)) throw new Error("Invalid aggregation operation");
    if (groupBy && ![...FIELDS[module]!.filter(k => !["from", "to"].includes(k)), ...(module === "engine-profile" ? ["certificationDate", "soleSupplier", "aircraftModel"] : []),
      ...(module === "orders" || module === "deliveries" ? ["engine", "country", "date"] : [])].includes(groupBy)) throw new Error("Unsupported groupBy");
    if (operation !== "count" && !metricFields[module]?.includes(metric)) throw new Error(`Unsupported metric. Available: ${(metricFields[module] ?? []).join(", ")}; engine profiles support count only.`);
    const units = module === "market-value-lease-rates" ? "USD millions; lease rates are monthly"
      : module === "jurisdiction-risk" ? "Scores; higher is better. Overall score differs from repossession score."
      : module === "engine-profile" ? "Profile entries, NOT aircraft fleet or installed-engine counts"
      : "Aircraft quantity; count means source rows, sum(quantity) means orders/deliveries";
    let aggregation = aggregate(rows, groupBy, metric, operation, direction);
    let ranking: Record<string, unknown> | undefined;
    if (args.topN !== undefined) {
      if (!Number.isInteger(args.topN) || Number(args.topN) < 1 || Number(args.topN) > 50)
        throw new Error("Invalid topN: use a whole number from 1 to 50.");
      if (!["orders", "deliveries"].includes(module) || !["customer", "model", "manufacturer", "region"].includes(groupBy))
        throw new Error("Unsupported topN: rank deliveries/orders by customer, model, manufacturer or region.");
      ranking = { topN: args.topN, groupBy, direction, rankedWithinFilters: { ...filters }, totalGroupsBeforeLimit: aggregation.length };
      const selected = aggregation.slice(0, Number(args.topN)).map(item => item.name);
      // Restrict the actual native selections, not just the answer's displayed list.
      // Empty rankings must never turn into an empty (= All) selection.
      if (selected.length) {
        filters = canonicalRaw(module, { ...filters, [groupBy]: selected }, ds.rows);
        const names = new Set(selected.map(norm));
        rows = rows.filter(row => names.has(norm(row[groupBy])));
        aggregation = aggregate(rows, groupBy, metric, operation, direction);
      }
    }
    result = { matchingRows: rows.length, units, notes: ds.notes ?? [],
      ...(ds.minDate ? { sourceDateRange: { from: ds.minDate, to: ds.maxDate } } : {}),
      distinctNonBlankCounts: Object.fromEntries(FIELDS[module]!.filter(k => !["from", "to"].includes(k))
        .map(k => [k, new Set(rows.map(r => norm(r[k])).filter(Boolean)).size])),
      ...(module === "orders" || module === "deliveries" ? {
        totalQuantity: rows.reduce((n, r) => n + Number(r.quantity), 0),
        models: new Set(rows.map(r => norm(r.model))).size, customers: new Set(rows.map(r => norm(r.customer))).size,
      } : {}),
      aggregation, totalGroups: aggregation.length, groupBy, metric, operation, direction,
      ...(ranking ? { ranking } : {}),
      records: rows.slice(0, 15), recordsShown: Math.min(rows.length, 15), recordsAreSample: rows.length > 15 };
  } else {
    if (args.groupBy || args.metric || args.operation && args.operation !== "count") throw new Error("Custom aggregation only supports deliveries, orders, engine-profile, jurisdiction-risk and market-value-lease-rates. Use the other modules' canonical dashboard metrics.");
    const records = args.view === "records";
    const options = await nativeOptions(module);
    const single = Object.fromEntries(Object.entries(filters).map(([k, v]) => {
      if (Array.isArray(v) && v.length > 1) throw new Error(`Unsupported multiple selection for ${k}; this module uses single-select controls.`);
      return [k, Array.isArray(v) ? v[0] ?? "" : v];
    }));
    const native = canonicalNative(module, single, options);
    filters = native;
    result = { dashboard: await nativeQuery(module, native, records), notes: options.notes,
      ...(module === "airline-financials" ? { sourceDate: options.sourceDate, warning: "Aggregated exploratory view across matching source statements/scopes/fiscal year-ends; not one consolidated financial statement. Inspect records for statement scope." } : {}) };
  }
  const cuts: string[] = [];
  const trimmed = bounded(result, "result", cuts);
  return { id, module, source: SOURCE[module], filters: JSON.stringify(filters),
    result: JSON.stringify({ data: trimmed, truncation: cuts, scope: "Current imported source snapshot, queried now; not a live external feed." }),
    href: `${module === "summary" ? "/" : `/${module}`}?assistantFilters=${encodeURIComponent(JSON.stringify(filters))}`,
    queriedAt: new Date().toISOString() };
}

export async function findAssistantOptions(args: Record<string, unknown>) {
  const module = moduleName(args.module);
  const field = String(args.field ?? "");
  const search = norm(args.search ?? "");
  if (FIELDS[module]) {
    const ds = await rawDataset(module);
    const fields = [...FIELDS[module]!.filter(k => !["from", "to"].includes(k)),
      ...(module === "orders" || module === "deliveries" ? ["date", "engine", "country"] : []),
      ...(module === "engine-profile" ? ["certificationDate", "soleSupplier"] : [])];
    if (!fields.includes(field)) return { fields, source: SOURCE[module] };
    const values = [...new Set(ds.rows.map(r => r[field]).filter(v => v != null))].sort((a, b) => String(a).localeCompare(String(b)));
    const matched = values.filter(v => norm(v).includes(search));
    return { field, totalMatches: matched.length, values: matched.slice(0, 40), truncated: matched.length > 40 };
  }
  const obj = await nativeOptions(module);
  if (!Object.hasOwn(obj, field)) return { fields: Object.keys(obj), hint: "Call again with a listed field and search text." };
  const value = obj[field];
  if (!Array.isArray(value)) return { field, value };
  const matched = value.filter(v => norm(JSON.stringify(v)).includes(search));
  return { field, totalMatches: matched.length, values: matched.slice(0, 40), truncated: matched.length > 40 };
}
