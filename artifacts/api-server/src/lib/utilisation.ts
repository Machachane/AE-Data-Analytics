import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import { ObjectStorageService } from "./objectStorage";
import type { UtilisationDashboard, UtilisationOptions } from "@workspace/api-zod";

const unzip = promisify(gunzip);
// Dimension dictionary indexes: airline, model, MSN, manufacturer, engine, date.
// Measures: monthly hours, lifetime monthly cycles, lifetime ratio, LTM monthly FH/FC.
type FleetRow = [number, number, number, number, number, number, number | null, number | null, number | null, number | null, number | null];
interface FleetSnapshot {
  version: number;
  source: string;
  dimensions: string[][];
  rows: FleetRow[];
}
export interface UtilisationFilters {
  from?: string;
  to?: string;
  airline?: string;
  model?: string;
  msn?: string;
  manufacturer?: string;
  engine?: string;
}

let loading: Promise<FleetSnapshot> | undefined;
async function snapshot(): Promise<FleetSnapshot> {
  if (!loading) {
    loading = (async () => {
      const file = await new ObjectStorageService().getObjectEntityFile("/objects/analytics/fleet-utilisation.json.gz");
      const [compressed] = await file.download();
      const data = JSON.parse((await unzip(compressed)).toString("utf8")) as FleetSnapshot;
      if (data.version !== 1 || data.dimensions?.length !== 6 || !data.rows?.length) {
        throw new Error("Unsupported or empty utilisation snapshot");
      }
      if (data.rows.some((r) => r.length !== 11 || r.slice(0, 6).some((v, i) => typeof v !== "number" || !Number.isInteger(v) || v < 0 || v >= data.dimensions[i].length) || r.slice(6).some((v) => v !== null && (typeof v !== "number" || !Number.isFinite(v))))) {
        throw new Error("Invalid fleet snapshot rows");
      }
      return data;
    })().catch((error) => { loading = undefined; throw error; });
  }
  return loading;
}

let options: UtilisationOptions | undefined;
export async function utilisationOptions(): Promise<UtilisationOptions> {
  if (options) return options;
  const data = await snapshot();
  const sorted = (i: number) => data.dimensions[i].filter(Boolean).slice().sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  const dates = data.dimensions[5].slice().sort();
  options = {
    source: data.source,
    rowCount: data.rows.length,
    minDate: dates[0],
    maxDate: dates[dates.length - 1],
    airlines: sorted(0), models: sorted(1), msns: sorted(2), manufacturers: sorted(3), engines: sorted(4),
    notes: [
      "Imported fleet-data snapshot; not a live flight feed. Dates use NEAREST_MONTH_START (day/month/year).",
      "Total airlines/models/aircraft use case- and whitespace-insensitive distinct counts; aircraft is distinct manufacturer serial number (MSN), including one blank category as in Power BI, not aircraft-month row count.",
      "Total flight hours and monthly trends sum MONTHLY_HOURS_TTL. Avg monthly flight hours is the mean of nonblank MONTHLY_HOURS_TTL values.",
      "Avg monthly flight cycle is the mean of AVG_FC_LTT. Avg FH/FC ratio (LTT) is the mean of HRS_PER_CYCLE. These are source lifetime-based fields, not a ratio of dashboard totals.",
      "Negative monthly hours are preserved from the source as adjustments; they are not clamped or silently corrected. Missing numeric values are omitted from averages.",
      "Rankings omit blank names and show at most the top 250 entries per dimension. KPIs and trends retain records with blank dimensions.",
    ],
  };
  return options;
}

class Average {
  sum = 0;
  count = 0;
  add(value: number | null) { if (value !== null) { this.sum += value; this.count++; } }
  result() { return this.count ? this.sum / this.count : null; }
}

const DIMENSIONS = ["airline", "model", "msn", "manufacturer", "engine"] as const;
const cache = new Map<string, { expires: number; value: UtilisationDashboard }>();
const LIMIT = 250;

export async function utilisationDashboard(filters: UtilisationFilters): Promise<UtilisationDashboard> {
  const metadata = await utilisationOptions();
  const from = filters.from || metadata.minDate, to = filters.to || metadata.maxDate;
  const normalized = { from, to, ...Object.fromEntries(DIMENSIONS.filter((key) => filters[key]).map((key) => [key, filters[key]])) };
  const key = JSON.stringify(normalized);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const data = await snapshot();
  const lookups = DIMENSIONS.map((dimension, i) => filters[dimension] ? data.dimensions[i].indexOf(filters[dimension]!) : null);
  const dateMatches = data.dimensions[5].map((date) => date >= from && date <= to);
  const ranks = DIMENSIONS.map(() => new Map<number, number>());
  const ids = DIMENSIONS.map(() => new Set<number>());
  const monthly = new Map<string, number>();
  const airlineMonthly = new Map<number, Map<string, number>>();
  const hours = new Average(), cycles = new Average(), ratio = new Average();
  const models = new Map<number, { aircraft: Set<number>; hours: Average; cycles: Average; ratio: Average; ltmHours: Average; ltmCycles: Average }>();
  let recordCount = 0, negativeHoursCount = 0, missingMsnCount = 0;
  for (const row of data.rows) {
    if (!dateMatches[row[5]] || lookups.some((value, i) => value !== null && value !== row[i])) continue;
    recordCount++;
    const h = row[6] ?? 0;
    const month = data.dimensions[5][row[5]].slice(0, 7);
    for (let i = 0; i < DIMENSIONS.length; i++) {
      const index = row[i] as number;
      ids[i].add(index);
      ranks[i].set(index, (ranks[i].get(index) ?? 0) + h);
    }
    hours.add(row[6]); cycles.add(row[7]); ratio.add(row[8]);
    negativeHoursCount += h < 0 ? 1 : 0;
    missingMsnCount += data.dimensions[2][row[2]] === "" ? 1 : 0;
    monthly.set(month, (monthly.get(month) ?? 0) + h);
    let airline = airlineMonthly.get(row[0]);
    if (!airline) { airline = new Map(); airlineMonthly.set(row[0], airline); }
    airline.set(month, (airline.get(month) ?? 0) + h);
    let model = models.get(row[1]);
    if (!model) {
      model = { aircraft: new Set(), hours: new Average(), cycles: new Average(), ratio: new Average(), ltmHours: new Average(), ltmCycles: new Average() };
      models.set(row[1], model);
    }
    model.aircraft.add(row[2]); model.hours.add(row[6]); model.cycles.add(row[7]);
    model.ratio.add(row[8]); model.ltmHours.add(row[9]); model.ltmCycles.add(row[10]);
  }
  const ranked = ranks.map((map, dimension) => [...map.entries()]
    .map(([index, value]) => ({ name: data.dimensions[dimension][index], value }))
    .filter((entry) => entry.name !== "")
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)));
  const months: string[] = [];
  for (let date = new Date(`${from.slice(0, 7)}-01T00:00:00Z`); date.toISOString().slice(0, 7) <= to.slice(0, 7); date.setUTCMonth(date.getUTCMonth() + 1)) {
    months.push(date.toISOString().slice(0, 7));
  }
  const topAirlineTrends = ranked[0].slice(0, 5).map(({ name }) => {
    const index = data.dimensions[0].indexOf(name), values = airlineMonthly.get(index);
    return { airline: name, points: months.map((month) => ({ month, hours: values?.get(month) ?? 0 })) };
  });
  const analysis = [...models.entries()].map(([index, model]) => ({
    model: data.dimensions[1][index], aircraft: model.aircraft.size, totalHours: model.hours.sum,
    avgMonthlyHours: model.hours.result(), avgMonthlyCycles: model.cycles.result(), avgRatio: model.ratio.result(),
    avgLtmHours: model.ltmHours.result(), avgLtmCycles: model.ltmCycles.result(),
  })).sort((a, b) => b.totalHours - a.totalHours);
  const result: UtilisationDashboard = {
    from, to,
    kpis: { airlines: ids[0].size, models: ids[1].size, aircraft: ids[2].size, avgMonthlyHours: hours.result(), avgMonthlyCycles: cycles.result(), avgRatio: ratio.result(), totalHours: hours.sum, recordCount },
    modelRanking: ranked[1].slice(0, LIMIT), engineRanking: ranked[4].slice(0, LIMIT),
    airlineRanking: ranked[0].slice(0, LIMIT), msnRanking: ranked[2].slice(0, LIMIT), manufacturerRanking: ranked[3].slice(0, LIMIT),
    rankingCounts: { model: ranked[1].length, engine: ranked[4].length, airline: ranked[0].length, msn: ranked[2].length, manufacturer: ranked[3].length },
    monthlyTrend: months.map((month) => ({ month, hours: monthly.get(month) ?? 0 })),
    topAirlineTrends, analysis, negativeHoursCount, missingMsnCount,
  };
  if (cache.size >= 32) cache.delete(cache.keys().next().value!);
  cache.set(key, { value: result, expires: Date.now() + 5 * 60 * 1000 });
  return result;
}
