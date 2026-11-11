import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import { GetEmissionsRecordsQueryParams, type EmissionsDashboard, type EmissionsOptions, type EmissionsRecord } from "@workspace/api-zod";
import { ObjectStorageService } from "./objectStorage";

const unzip = promisify(gunzip);
// Dictionary dimensions: month, MSN, ICAO, engine, operator group, airline.
// Measures: flight hours, flight cycles, WTW kgCO2e, gCO2e/ASK, /RPK, /RTK.
type Row = [number, number, number, number, number, number, number | null, number | null, number | null, number | null, number | null, number | null];
interface Snapshot { version: number; source: string; sheet: string; dimensions: string[][]; rows: Row[] }
export type TableFilters = ReturnType<typeof GetEmissionsRecordsQueryParams.parse>;
const fields = { date: 0, msn: 1, icao: 2, engine: 3, operatorGroup: 4, airline: 5, hours: 6, cycles: 7, co2: 8, perAsk: 9, perRpk: 10, perRtk: 11 } as const;
const filterFields = ["date", "msn", "icao", "engine", "airline"] as const;
const normalize = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
let loading: Promise<Snapshot> | undefined;
async function snapshot(): Promise<Snapshot> {
  if (!loading) {
    loading = (async () => {
      const file = await new ObjectStorageService().getObjectEntityFile("/objects/analytics/emissions.json.gz");
      const [bytes] = await file.download();
      const s = JSON.parse((await unzip(bytes)).toString("utf8")) as Snapshot;
      if (s.version !== 1 || s.sheet !== "EMISSIONS_ANALYSIS" || s.dimensions?.length !== 6 || !s.rows?.length ||
        s.dimensions.some(d => !Array.isArray(d) || d.some(v => typeof v !== "string")) ||
        s.rows.some(r => r.length !== 12 || r.some((v, i) => i < 6
          ? typeof v !== "number" || !Number.isInteger(v) || v < 0 || v >= s.dimensions[i].length
          : v !== null && (typeof v !== "number" || !Number.isFinite(v))))) {
        throw new Error("Invalid emissions snapshot");
      }
      return s;
    })().catch(error => { loading = undefined; throw error; });
  }
  return loading;
}

let options: EmissionsOptions | undefined;
export async function emissionsOptions(): Promise<EmissionsOptions> {
  if (options) return options;
  const s = await snapshot();
  const sorted = (i: number) => s.dimensions[i].filter(Boolean).slice().sort((a, b) => a.localeCompare(b));
  options = {
    source: s.source, sheet: s.sheet, rowCount: s.rows.length,
    dates: sorted(0), msns: sorted(1), icaos: sorted(2), engines: sorted(3), airlines: sorted(5),
    notes: [
      "Imported EMISSIONS_ANALYSIS snapshot, January 2025–September 2026; not a live emissions feed. All dates are selected by default. Date as at selects an exact source month.",
      "Aircraft, engine models and airlines are case- and whitespace-insensitive distinct counts, including the blank category, matching Power BI. Aircraft means distinct source MSN, not aircraft-month records.",
      "Average flight hours and flight cycles are arithmetic means of nonblank source flight_hours and flight_cycles across the selected records. Source zeroes are included.",
      "Rankings show transport-weighted WTW CO₂ intensity in gCO₂e/RTK: SUM(wtw_co2_kgco2e) / SUM(wtw_co2_kgco2e / wtw_co2_per_rtk_gco2e). This reconstructs transported tonne-kilometres from the source intensity, rather than averaging per-row intensities. As in the reference report, categories with any blank source RTK intensity display 0 because a complete transport denominator is unavailable. These are unavailable aggregate intensities, not evidence of zero emissions.",
      "Rankings omit blank category names and show the top 250 per dimension. All matching source records remain accessible in the table and CSV export.",
      "Table values retain source units: WTW CO₂ in kgCO₂e; per ASK, RPK and RTK intensities in gCO₂e. Display rounding does not change exports. Blanks are not converted to zero.",
      "MSNs are source text: date-like and other unusual serial-number values are preserved, not reinterpreted or corrected. ESTUAIRE attribution follows the supplied reference.",
      "Source reconciliation: the workbook includes Skydive Orange with a very high complete-record intensity. It is retained in the airline ranking, although absent from the reference screenshot; no undocumented visual filter or outlier exclusion has been invented.",
    ],
  };
  return options;
}

function filterKey(q: TableFilters) {
  return JSON.stringify(filterFields.map(k => q[k] ? normalize(q[k]!) : ""));
}
function matcher(s: Snapshot, q: TableFilters) {
  const lookups = filterFields.flatMap(k => q[k]
    ? [[fields[k], s.dimensions[fields[k]].findIndex(v => normalize(v) === normalize(q[k]!))] as const] : []);
  return (r: Row) => lookups.every(([col, id]) => r[col] === id);
}
class Weighted {
  co2 = 0;
  transport = 0;
  incomplete = false;
  add(r: Row) {
    if (r[11] === null) this.incomplete = true;
    this.co2 += r[8] ?? 0;
    if (r[8] !== null && r[11] !== null && r[11] !== 0) this.transport += r[8] / r[11];
  }
  value() { return this.incomplete || this.transport === 0 ? 0 : this.co2 / this.transport; }
}
const summaries = new Map<string, EmissionsDashboard>();
export async function emissionsDashboard(q: TableFilters): Promise<EmissionsDashboard> {
  const key = filterKey(q);
  const hit = summaries.get(key);
  if (hit) return hit;
  const s = await snapshot(), matches = matcher(s, q);
  const dimensions = [1, 3, 5], counts = dimensions.map(() => new Set<number>());
  const groups = dimensions.map(() => new Map<number, Weighted>());
  let recordCount = 0, hours = 0, hourCount = 0, cycles = 0, cycleCount = 0;
  for (const r of s.rows) {
    if (!matches(r)) continue;
    recordCount++;
    if (r[6] !== null) { hours += r[6]; hourCount++; }
    if (r[7] !== null) { cycles += r[7]; cycleCount++; }
    dimensions.forEach((d, i) => {
      counts[i].add(r[d] as number);
      let g = groups[i].get(r[d] as number);
      if (!g) { g = new Weighted(); groups[i].set(r[d] as number, g); }
      g.add(r);
    });
  }
  const ranks = groups.map((g, i) => [...g.entries()]
    .map(([id, v]) => ({ name: s.dimensions[dimensions[i]][id], value: v.value() }))
    .filter(r => r.name !== "" && Number.isFinite(r.value))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .slice(0, 250));
  const result: EmissionsDashboard = {
    aircraft: counts[0].size, engines: counts[1].size, airlines: counts[2].size,
    avgHours: hourCount ? hours / hourCount : null, avgCycles: cycleCount ? cycles / cycleCount : null,
    recordCount, msnRanking: ranks[0], engineRanking: ranks[1], airlineRanking: ranks[2], rankingLimit: 250,
  };
  if (summaries.size >= 24) summaries.delete(summaries.keys().next().value!);
  summaries.set(key, result);
  return result;
}

function value(s: Snapshot, index: number, field: keyof typeof fields): string | number | null {
  const col = fields[field], raw = s.rows[index][col];
  return col < 6 ? s.dimensions[col][raw as number] : raw;
}
const windows = new Map<string, number[]>();
async function orderedIndices(q: TableFilters) {
  const key = JSON.stringify([filterKey(q), q.search?.trim().toLowerCase() || "", q.sort || "reference-date", q.direction || "asc"]);
  const hit = windows.get(key);
  const s = await snapshot();
  if (hit) return { s, indices: hit };
  const matches = matcher(s, q), search = q.search?.trim().toLowerCase();
  const indices: number[] = [];
  for (let i = 0; i < s.rows.length; i++) {
    const r = s.rows[i];
    if (!matches(r)) continue;
    if (search && !Object.keys(fields).some(f => String(value(s, i, f as keyof typeof fields) ?? "").toLowerCase().includes(search))) continue;
    indices.push(i);
  }
  const field = q.sort || "date", dir = !q.sort || q.direction === "desc" ? -1 : 1;
  // Predecode only the selected sort column, avoiding dictionary lookups in every comparison.
  const sortValues = indices.map(i => value(s, i, field));
  const byId = new Map(indices.map((id, i) => [id, sortValues[i]]));
  indices.sort((a, b) => {
    const x = byId.get(a)!, y = byId.get(b)!;
    let c = x === null ? (y === null ? 0 : 1) : y === null ? -1
      : (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * dir;
    if (!c && !q.sort) {
      c = s.dimensions[1][s.rows[a][1]].localeCompare(s.dimensions[1][s.rows[b][1]])
        || s.dimensions[2][s.rows[a][2]].localeCompare(s.dimensions[2][s.rows[b][2]]);
    }
    if (!c) c = s.dimensions[0][s.rows[b][0]].localeCompare(s.dimensions[0][s.rows[a][0]]);
    return c || a - b;
  });
  if (windows.size >= 3) windows.delete(windows.keys().next().value!);
  windows.set(key, indices);
  return { s, indices };
}
function record(s: Snapshot, i: number): EmissionsRecord {
  const r = s.rows[i], d = s.dimensions;
  return { id: i, date: d[0][r[0]], msn: d[1][r[1]], icao: d[2][r[2]], engine: d[3][r[3]], operatorGroup: d[4][r[4]], airline: d[5][r[5]],
    hours: r[6], cycles: r[7], co2: r[8], perAsk: r[9], perRpk: r[10], perRtk: r[11] };
}
export async function emissionsRecords(q: TableFilters) {
  const { s, indices } = await orderedIndices(q), offset = q.offset ?? 0, limit = q.limit ?? 200;
  return { rows: indices.slice(offset, offset + limit).map(i => record(s, i)), total: indices.length,
    nextOffset: offset + limit < indices.length ? offset + limit : null };
}
export async function emissionsExport(q: TableFilters) {
  const { s, indices } = await orderedIndices(q);
  return (function* () {
    const columns = ["msn", "icao", "airline", "operatorGroup", "engine", "co2", "perAsk", "perRpk", "perRtk", "date", "hours", "cycles"] as const;
    // Quote fields and prevent spreadsheet formula execution from source text.
    const cell = (v: string | number | null) => {
      let text = v === null ? "" : String(v);
      if (typeof v === "string" && /^[=+\-@\t\r]/.test(text)) text = "'" + text;
      return `"${text.replace(/"/g, '""')}"`;
    };
    yield columns.join(",") + "\r\n";
    for (const id of indices) {
      const r = record(s, id);
      yield columns.map(k => cell(r[k])).join(",") + "\r\n";
    }
  })();
}
