import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import { GetRegistryRecordsQueryParams, type RegistryDashboard, type RegistryOptions, type RegistryRecord } from "@workspace/api-zod";
import { ObjectStorageService } from "./objectStorage";

type Filters = ReturnType<typeof GetRegistryRecordsQueryParams.parse>;
// 13 dimension indexes, year / LTM hours / LTM cycles / lifetime ratio / registry
// entry id, then an operator-ICAO index into dictionary 13.
type Row = (number | null)[];
interface Snapshot { version: number; source: string; dimensions: string[][]; rows: Row[] }
const unzip = promisify(gunzip);
const columns = { manufacturer: 0, model: 1, aircraftType: 2, registration: 3, msn: 4, operator: 5, operatorIcao: 18, owner: 6, firstFlight: 7, engineManufacturer: 8, engineFamily: 9, engineModel: 10, lastUpdate: 11, year: 13 } as const;
const filterFields = ["manufacturer", "model", "registration", "msn", "operator", "owner", "aircraftType"] as const;
const normalize = (field: string, value: string) => field === "owner"
  ? value.replace(/ +$/, "").toLowerCase() : value.trim().replace(/\s+/g, " ").toLowerCase();
let loading: Promise<Snapshot> | undefined;
async function snapshot(): Promise<Snapshot> {
  if (!loading) loading = (async () => {
    const file = await new ObjectStorageService().getObjectEntityFile("/objects/analytics/aircraft-registry.json.gz");
    const [bytes] = await file.download();
    const s = JSON.parse((await unzip(bytes)).toString("utf8")) as Snapshot;
    if (s.version !== 2 || s.dimensions?.length !== 14 || !s.rows?.length ||
      s.dimensions.some(d => !Array.isArray(d) || d.some(v => typeof v !== "string")) ||
      s.rows.some(r => r.length !== 19 || r.some((v, i) => i < 13
        ? typeof v !== "number" || !Number.isInteger(v) || v < 0 || v >= s.dimensions[i].length
        : i === 18 ? typeof v !== "number" || !Number.isInteger(v) || v < 0 || v >= s.dimensions[13].length
        : i === 17 ? typeof v !== "number" || !Number.isInteger(v) || v < 0
        : v !== null && (typeof v !== "number" || !Number.isFinite(v))))) throw new Error("Invalid registry snapshot");
    return s;
  })().catch(error => { loading = undefined; throw error; });
  return loading;
}
const text = (s: Snapshot, r: Row, col: number) => s.dimensions[col][r[col] as number];
let options: RegistryOptions | undefined;
export async function registryOptions(): Promise<RegistryOptions> {
  if (options) return options;
  const s = await snapshot(), sorted = (i: number) => s.dimensions[i].filter(Boolean).slice().sort((a, b) => a.localeCompare(b));
  const dates = sorted(11);
  options = {
    source: s.source, sourceRows: s.rows.length, from: dates[0], to: dates[dates.length - 1],
    manufacturers: sorted(0), models: sorted(1), aircraftTypes: sorted(2), registrations: sorted(3),
    msns: sorted(4), operators: sorted(5), owners: sorted(6),
    notes: [
      "Imported AIRCRAFT_REGISTRY_FLEET_DATA_FINAL snapshot, December 2025–October 2026; not a live registry. All source months contribute to the reference headline measures.",
      "Total aircraft means distinct manufacturer serial number (MSN), including one blank category, not UNIQUE_ID or table row count. Airline, model and manufacturer counts also include the source blank category.",
      "Model filters use AIRCRAFT_MODEL (ICAO codes); Aircraft Type uses the more detailed AIRCRAFT_VARIANT. They are separate source fields.",
      "To reproduce the reference, LTM hours and cycles sum their source fields over all matching aircraft-month observations. Overlapping monthly LTM windows are not deduplicated: these totals are report aggregates, not one year's activity for a unique current fleet. Avg FH/FC Ratio (LTT) averages nonblank HRS_PER_CYCLE values, rather than dividing the totals.",
      "The table collapses repeated monthly observations with identical displayed aircraft attributes and shows their latest observed update. Different registrations, operators, owners or engine details remain separate historical entries. Source filters are applied before selecting the latest matching observation. Registry entries therefore differ from the distinct-MSN headline count.",
      "Owner identity follows the reference's case-insensitive matching with trailing ASCII spaces ignored, while leading and non-ASCII whitespace remains significant. Further whitespace normalization would merge additional source owner identities and change the reference total.",
      "Operator/model, owner and model rankings count distinct source MSNs over the selected history, including blank MSN. Aircraft can appear in several historical categories, so ranking values are not additive. Blank category names are omitted; up to 250 ranked entries are shown.",
      "The manufacturer donut and Total Models by Manufacturer comparison count matching monthly source observations, reproducing the reference chart scale (for example 168,701 Boeing observations). These are not distinct-aircraft or distinct-model counts. Donut percentages use the full filtered manufacturer-observation total; comparison percentages are relative to the largest manufacturer.",
      "The Graphs header's Avg Flight Cycles (LTM) is the mean of nonblank FLIGHT_CYCLES (LTM), including reported zeroes. Its reference-labelled Avg Flight Hours (LTM) card retains the report's total-hours value, not a true average; the tooltip discloses this.",
      "Blank engine and owner values stay blank. Numeric zeroes, source precision, and historical attribute changes are preserved in exports.",
    ],
  };
  return options;
}
function key(q: Filters) { return JSON.stringify(filterFields.map(k => q[k] ? normalize(k, q[k]!) : "")); }
function matcher(s: Snapshot, q: Filters) {
  const lookups = filterFields.flatMap(k => q[k] ? [[columns[k], s.dimensions[columns[k]].findIndex(v => normalize(k, v) === normalize(k, q[k]!))] as const] : []);
  return (r: Row) => lookups.every(([col, id]) => r[col] === id);
}
const cache = new Map<string, { dashboard: RegistryDashboard; indices: number[] }>();
async function filtered(q: Filters) {
  const s = await snapshot(), k = key(q), hit = cache.get(k);
  if (hit) return { s, ...hit };
  const matches = matcher(s, q), distinctCols = [5, 4, 1, 0, 6], ids = distinctCols.map(() => new Set<number>());
  const graphCols = [0, 1, 5, 6], graphs = graphCols.map(() => new Map<number, Set<number>>());
  const manufacturerCounts = new Map<number, number>();
  const operatorModels = new Map<string, { operator: number; model: number; msns: Set<number> }>();
  const latest = new Map<number, number>();
  let totalHoursLtm = 0, totalCyclesLtm = 0, cycleCount = 0, ratio = 0, ratioCount = 0, sourceRows = 0;
  s.rows.forEach((r, i) => {
    if (!matches(r)) return;
    sourceRows++;
    distinctCols.forEach((col, d) => ids[d].add(r[col] as number));
    totalHoursLtm += r[14] ?? 0; totalCyclesLtm += r[15] ?? 0;
    if (r[15] !== null) cycleCount++;
    manufacturerCounts.set(r[0] as number, (manufacturerCounts.get(r[0] as number) ?? 0) + 1);
    const pairKey = `${r[5]}/${r[1]}`;
    let pair = operatorModels.get(pairKey);
    if (!pair) {
      pair = { operator: r[5] as number, model: r[1] as number, msns: new Set() };
      operatorModels.set(pairKey, pair);
    }
    pair.msns.add(r[4] as number);
    if (r[16] !== null) { ratio += r[16]; ratioCount++; }
    graphCols.forEach((col, d) => {
      let aircraft = graphs[d].get(r[col] as number);
      if (!aircraft) { aircraft = new Set(); graphs[d].set(r[col] as number, aircraft); }
      aircraft.add(r[4] as number);
    });
    const entry = r[17] as number, previous = latest.get(entry);
    if (previous === undefined || text(s, r, 11) > text(s, s.rows[previous], 11)) latest.set(entry, i);
  });
  const ranks = graphs.map((g, d) => [...g].map(([id, msns]) => ({ name: s.dimensions[graphCols[d]][id], aircraft: msns.size }))
    .filter(r => r.name !== "").sort((a, b) => b.aircraft - a.aircraft || a.name.localeCompare(b.name)).slice(0, 250));
  const dashboard: RegistryDashboard = {
    airlines: ids[0].size, aircraft: ids[1].size, models: ids[2].size, manufacturers: ids[3].size, owners: ids[4].size,
    totalHoursLtm, totalCyclesLtm, avgCyclesLtm: cycleCount ? totalCyclesLtm / cycleCount : null,
    avgRatio: ratioCount ? ratio / ratioCount : null, sourceRows, registryEntries: latest.size,
    manufacturerRanking: ranks[0], modelRanking: ranks[1], operatorRanking: ranks[2], ownerRanking: ranks[3], rankingLimit: 250,
    manufacturerCounts: [...manufacturerCounts].map(([id, records]) => ({ name: s.dimensions[0][id], records }))
      .sort((a, b) => b.records - a.records || a.name.localeCompare(b.name)),
    operatorModelRanking: [...operatorModels.values()]
      .map(g => ({ operator: s.dimensions[5][g.operator], model: s.dimensions[1][g.model], aircraft: g.msns.size }))
      .filter(r => r.operator !== "" && r.model !== "")
      .sort((a, b) => b.aircraft - a.aircraft || a.operator.localeCompare(b.operator) || a.model.localeCompare(b.model)).slice(0, 250),
  };
  const result = { dashboard, indices: [...latest.values()] };
  if (cache.size >= 16) cache.delete(cache.keys().next().value!);
  cache.set(k, result);
  return { s, ...result };
}
export async function registryDashboard(q: Filters) { return (await filtered(q)).dashboard; }
function record(s: Snapshot, i: number): RegistryRecord {
  const r = s.rows[i];
  return { id: r[17] as number, manufacturer: text(s, r, 0), model: text(s, r, 1), aircraftType: text(s, r, 2),
    registration: text(s, r, 3), msn: text(s, r, 4), operator: text(s, r, 5), operatorIcao: s.dimensions[13][r[18] as number], owner: text(s, r, 6),
    firstFlight: text(s, r, 7), engineManufacturer: text(s, r, 8), engineFamily: text(s, r, 9),
    engineModel: text(s, r, 10), lastUpdate: text(s, r, 11), year: r[13], hoursLtm: r[14], cyclesLtm: r[15], ratio: r[16] };
}
const windows = new Map<string, number[]>();
async function ordered(q: Filters) {
  const { s, indices: all } = await filtered(q);
  const k = JSON.stringify([key(q), q.search?.trim().toLowerCase() || "", q.sort || "firstFlight", q.direction || "desc"]);
  const hit = windows.get(k);
  if (hit) return { s, indices: hit };
  const search = q.search?.trim().toLowerCase();
  const indices = search ? all.filter(i => Object.values(record(s, i)).some(v => String(v ?? "").toLowerCase().includes(search))) : all.slice();
  const col = columns[q.sort || "firstFlight"], dir = q.direction === "asc" ? 1 : -1;
  const v = (i: number) => col < 13 ? text(s, s.rows[i], col) : col === 18 ? s.dimensions[13][s.rows[i][18] as number] : s.rows[i][col];
  indices.sort((a, b) => {
    const x = v(a), y = v(b);
    if (x === null || x === "") return y === null || y === "" ? a - b : 1;
    if (y === null || y === "") return -1;
    const cmp = (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * dir;
    return cmp || a - b;
  });
  if (windows.size >= 8) windows.delete(windows.keys().next().value!);
  windows.set(k, indices);
  return { s, indices };
}
export async function registryRecords(q: Filters) {
  const { s, indices } = await ordered(q), offset = q.offset ?? 0, limit = q.limit ?? 200;
  return { rows: indices.slice(offset, offset + limit).map(i => record(s, i)), total: indices.length,
    nextOffset: offset + limit < indices.length ? offset + limit : null };
}
export async function registryExport(q: Filters) {
  const { s, indices } = await ordered(q);
  return (function* () {
    const fields: (keyof RegistryRecord)[] = ["manufacturer", "model", "aircraftType", "registration", "msn", "operator", "operatorIcao", "owner", "firstFlight", "year", "engineManufacturer", "engineFamily", "engineModel", "lastUpdate", "hoursLtm", "cyclesLtm", "ratio"];
    yield fields.join(",") + "\r\n";
    for (const i of indices) {
      const row = record(s, i);
      yield fields.map(k => {
        const value = row[k];
        let v = value === null ? "" : String(value);
        if (typeof value === "string" && /^[=+\-@\t\r]/.test(v)) v = "'" + v;
        return `"${v.replace(/"/g, '""')}"`;
      }).join(",") + "\r\n";
    }
  })();
}
