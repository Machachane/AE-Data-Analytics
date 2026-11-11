import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import type { Response } from "express";
import {
  GetAirlineFinancialRecordsQueryParams,
  type AirlineFinancialOptions, type AirlineFinancialDashboard, type AirlineFinancialRecord,
  type AirlineFinancialRecords, type AirlineFinancialStatement, type AirlineStatementChoice,
} from "@workspace/api-zod";
import { ObjectStorageService } from "./objectStorage";

type Query = Partial<ReturnType<typeof GetAirlineFinancialRecordsQueryParams.parse>>;
type Row = (number | null)[];
interface Snapshot { version: number; source: string; sheet: string; dimensions: string[][]; rows: Row[]; notes: string[] }
interface State { s: Snapshot; choices: AirlineStatementChoice[]; groups: number[][]; options: AirlineFinancialOptions }
const unzip = promisify(gunzip);
const ci = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });
const compare = (a: string, b: string) => collator.compare(a, b);
let loading: Promise<State> | undefined;
export class FinancialQueryError extends Error {}
const text = (s: Snapshot, r: Row, col: number) => s.dimensions[col][r[col] as number];
const balanceOrder = [
  "Total Assets", "Total Non-Current Assets", "Property, Plant and Equipment", "Other Non-Current Assets",
  "Total Current Assets", "Cash & Liquid Investments", "Trade Receivables", "Other Current Assets",
  "Total Liabilities", "Total Non-Current Liabilities", "Long Term Debt & Lease Liabilities",
  "Other-Non Current Liabilities", "Total Current Liabilities", "Short Term Debt", "Trade Payables",
  "Forward Sales & Deferred Revenue", "Other Current Liabilities", "Total Equity", "Share Capital",
  "Retained Earnings & Reserves",
];
const profitOrder = [
  "Total Revenue", "Passenger Revenue", "Cargo Revenue", "Other / Unclassified Revenue", "Staff Costs",
  "Fuel Costs", "Lease Rents", "Depreciation & Amortisation", "Other Operating Costs", "Operating Profit/(Loss)",
  "Non-Operating Items", "EBIT", "Net Interest", "Other Finance items",
  "Discontinued Operations & Extraordinary Items", "Profit / Loss Before Tax", "Tax", "Profit / Loss After Tax",
];
async function state(): Promise<State> {
  if (!loading) loading = (async () => {
    const file = await new ObjectStorageService().getObjectEntityFile("/objects/analytics/airline-financials.json.gz");
    const [bytes] = await file.download();
    const s = JSON.parse((await unzip(bytes)).toString("utf8")) as Snapshot;
    if (s.version !== 1 || s.sheet !== "TIRALIS_AIRLINE_FINANCIAL" || s.dimensions?.length !== 14 || !s.rows?.length ||
        !Array.isArray(s.notes) || s.notes.some(n => typeof n !== "string") ||
        s.dimensions.some(d => !Array.isArray(d) || d.some(v => typeof v !== "string")) ||
        s.rows.some(r => r.length !== 16 || r.some((v, i) => i < 14
          ? typeof v !== "number" || !Number.isInteger(v) || v < 0 || v >= s.dimensions[i].length
          : i === 14 ? v !== null && (typeof v !== "number" || !Number.isFinite(v))
            : typeof v !== "number" || !Number.isInteger(v) || v < 2))) {
      throw new Error("Invalid airline financial snapshot");
    }
    const choices: AirlineStatementChoice[] = [], groups: number[][] = [], lookup = new Map<string, number>();
    const category = new Map<number, string>();
    for (let i = 0; i < s.rows.length; i++) {
      const r = s.rows[i];
      const key = [r[2], r[3], r[4], r[5], r[6], r[7], r[8]].join("/");
      let id = lookup.get(key);
      if (id === undefined) {
        id = choices.length; lookup.set(key, id); groups.push([]);
        choices.push({ id, airline: text(s, r, 2), financialYear: text(s, r, 3), period: text(s, r, 4),
          fiscalYearEnd: text(s, r, 5), currency: text(s, r, 6), scope: text(s, r, 8), rows: 0 });
      }
      groups[id].push(i); choices[id].rows++;
      const mid = r[0] as number, cat = text(s, r, 1);
      if (category.has(mid) && category.get(mid) !== cat) throw new Error("Metric belongs to multiple financial categories");
      category.set(mid, cat);
    }
    const sorted = (col: number) => [...s.dimensions[col]].filter(Boolean).sort(compare);
    const options: AirlineFinancialOptions = {
      source: s.source, sheet: s.sheet, sourceRows: s.rows.length, sourceDate: sorted(11).join(", "), defaultPeriod: "Yr",
      airlines: sorted(2), financialYears: sorted(3), periods: sorted(4),
      metrics: s.dimensions[0].map((name, id) => ({ id, name, category: category.get(id) ?? "" }))
        .sort((a, b) => compare(a.category, b.category) || compare(a.name, b.name)),
      statements: [...choices].sort((a, b) => compare(a.airline, b.airline) || compare(b.financialYear, a.financialYear) ||
        compare(a.period, b.period) || compare(a.scope, b.scope) || compare(a.fiscalYearEnd, b.fiscalYearEnd)),
      notes: s.notes,
    };
    return { s, choices, groups, options };
  })().catch(e => { loading = undefined; throw e; });
  return loading;
}
export async function financialOptions(): Promise<AirlineFinancialOptions> { return (await state()).options; }
const filters = { airline: 2, financialYear: 3, period: 4 } as const;
interface Filtered { indexes: number[]; summary: AirlineFinancialDashboard }
const filteredCache = new Map<string, Filtered>();
const windows = new Map<string, number[]>();
function boundedSet<T>(map: Map<string, T>, key: string, v: T, max: number) {
  if (map.size >= max) map.delete(map.keys().next().value!);
  map.set(key, v);
}
function metricIds(q: Query, s: Snapshot): number[] {
  if (!q.metricIds) return [];
  if (!/^\d+(,\d+)*$/.test(q.metricIds)) throw new FinancialQueryError("Metric IDs must be comma-separated nonnegative integers");
  const ids = [...new Set(q.metricIds.split(",").map(Number))].sort((a, b) => a - b);
  if (ids.some(id => !Number.isSafeInteger(id) || id >= s.dimensions[0].length)) throw new FinancialQueryError("Unknown metric ID");
  return ids;
}
function filtered(st: State, q: Query): Filtered {
  const { s } = st, ids = metricIds(q, s), selected = new Set(ids);
  const tests = Object.entries(filters).flatMap(([field, col]) => {
    const v = q[field as keyof typeof filters];
    if (!v) return [];
    return [{ col, id: s.dimensions[col].findIndex(x => ci(x) === ci(v)) }];
  });
  const key = JSON.stringify([tests, ids]);
  const hit = filteredCache.get(key);
  if (hit) return hit;
  const indexes: number[] = [], airlines = new Set<string>(), years = new Set<string>(), periods = new Set<string>();
  const totals = new Map<number, { sum: number; reported: number; rows: number }>();
  for (let i = 0; i < s.rows.length; i++) {
    const r = s.rows[i], mid = r[0] as number;
    if (tests.some(t => r[t.col] !== t.id) || (ids.length && !selected.has(mid))) continue;
    indexes.push(i); airlines.add(text(s, r, 2)); years.add(text(s, r, 3)); periods.add(text(s, r, 4));
    if (ids.length) {
      const t = totals.get(mid) ?? { sum: 0, reported: 0, rows: 0 };
      t.rows++;
      if (r[14] !== null) { t.sum += r[14]; t.reported++; }
      totals.set(mid, t);
    }
  }
  const first = (set: Set<string>) => [...set].sort(compare)[0] ?? "";
  const summary: AirlineFinancialDashboard = {
    rows: indexes.length, airlineCount: airlines.size, yearCount: years.size, periodCount: periods.size,
    firstAirline: first(airlines), firstFinancialYear: first(years), firstPeriod: first(periods),
    metricTotals: st.options.metrics.filter(m => selected.has(m.id) && totals.has(m.id)).map(m => {
      const t = totals.get(m.id)!;
      return { id: m.id, metric: m.name, category: m.category, amount: t.reported ? t.sum : null, rows: t.rows };
    }),
  };
  const result = { indexes, summary };
  boundedSet(filteredCache, key, result, 16);
  return result;
}
export async function financialDashboard(q: Query): Promise<AirlineFinancialDashboard> { return filtered(await state(), q).summary; }
function record(s: Snapshot, index: number): AirlineFinancialRecord {
  const r = s.rows[index];
  return { id: r[15] as number, metricId: r[0] as number, metric: text(s, r, 0), category: text(s, r, 1),
    airline: text(s, r, 2), financialYear: text(s, r, 3), period: text(s, r, 4), fiscalYearEnd: text(s, r, 5),
    currency: text(s, r, 6), status: text(s, r, 7), scope: text(s, r, 8), ifrs: text(s, r, 9),
    inAdministration: text(s, r, 10), sourceDate: text(s, r, 11), sourceMetricId: text(s, r, 12),
    sourceCategoryId: text(s, r, 13), amount: r[14] };
}
const sortCols = { metric: 0, category: 1, airline: 2, financialYear: 3, period: 4, fiscalYearEnd: 5,
  currency: 6, status: 7, scope: 8, ifrs: 9, inAdministration: 10, amount: 14 } as const;
function ordered(st: State, q: Query): number[] {
  const f = filtered(st, q), search = ci(q.search ?? ""), col = sortCols[q.sort ?? "fiscalYearEnd"];
  const key = JSON.stringify([q.airline && ci(q.airline), q.financialYear && ci(q.financialYear), q.period && ci(q.period),
    metricIds(q, st.s), search, col, q.direction ?? "asc"]);
  const hit = windows.get(key);
  if (hit) return hit;
  const s = st.s;
  const indexes = search ? f.indexes.filter(i => {
    const r = s.rows[i];
    return r.slice(0, 14).some((_, c) => ci(text(s, r, c)).includes(search)) || String(r[14] ?? "").includes(search);
  }) : [...f.indexes];
  const direction = q.direction === "desc" ? -1 : 1;
  indexes.sort((ia, ib) => {
    const a = s.rows[ia], b = s.rows[ib];
    const av = col === 14 ? a[14] : text(s, a, col), bv = col === 14 ? b[14] : text(s, b, col);
    if (av == null || av === "") return bv == null || bv === "" ? ia - ib : 1;
    if (bv == null || bv === "") return -1;
    const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : compare(String(av), String(bv));
    return cmp * direction || compare(text(s, a, 2), text(s, b, 2)) || compare(text(s, a, 0), text(s, b, 0)) ||
      compare(text(s, a, 3), text(s, b, 3)) || ia - ib;
  });
  boundedSet(windows, key, indexes, 8);
  return indexes;
}
export async function financialRecords(q: Query): Promise<AirlineFinancialRecords> {
  const st = await state(), indexes = ordered(st, q), offset = q.offset ?? 0, limit = q.limit ?? 200;
  return { rows: indexes.slice(offset, offset + limit).map(i => record(st.s, i)), total: indexes.length,
    nextOffset: offset + limit < indexes.length ? offset + limit : null };
}
export async function financialStatement(id: number): Promise<AirlineFinancialStatement | null> {
  const st = await state(), choice = st.choices[id];
  if (!choice) return null;
  const records = st.groups[id].map(i => record(st.s, i));
  const lines = (order: string[]) => records.filter(r => order.includes(r.metric))
    .sort((a, b) => order.indexOf(a.metric) - order.indexOf(b.metric));
  const recognized = new Set([...balanceOrder, ...profitOrder]);
  if (records.some(r => !recognized.has(r.metric))) throw new Error("Unclassified statement metric");
  return { choice, balanceSheet: lines(balanceOrder), profitLoss: lines(profitOrder),
    notes: [
      `Reported source lines only for ${choice.airline}, ${choice.financialYear}, ${choice.period}, ${choice.scope}, ${choice.fiscalYearEnd}.`,
      "Amounts use the source currency and source scale. No missing line is replaced by zero, and no additional subtotal is calculated.",
      "Statements may be partial. Scope and fiscal year-end are isolated explicitly; other period and scope combinations are not combined.",
    ] };
}
export async function financialExport(q: Query, res: Response): Promise<void> {
  const st = await state(), indexes = ordered(st, q);
  const fields: (keyof AirlineFinancialRecord)[] = ["metric", "airline", "financialYear", "period", "fiscalYearEnd", "amount",
    "scope", "ifrs", "inAdministration", "category", "currency", "status", "sourceDate", "sourceMetricId", "sourceCategoryId"];
  const escape = (v: unknown) => {
    let s = String(v ?? "");
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="airline-financials.csv"');
  res.write("\uFEFF" + fields.map(escape).join(",") + "\r\n");
  for (let i = 0; i < indexes.length; i++) {
    if (res.destroyed) return;
    const r = record(st.s, indexes[i]);
    if (!res.write(fields.map(k => escape(r[k])).join(",") + "\r\n")) {
      const writable = await new Promise<boolean>(resolve => {
        const done = (ok: boolean) => { res.off("drain", drained); res.off("close", closed); resolve(ok); };
        const drained = () => done(true), closed = () => done(false);
        res.once("drain", drained); res.once("close", closed);
      });
      if (!writable) return;
    }
  }
  res.end();
}
