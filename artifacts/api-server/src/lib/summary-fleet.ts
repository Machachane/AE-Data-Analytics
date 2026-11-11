import type { SummaryKpis, SummaryFleetRecord } from "@workspace/api-zod";
import { summarySources, type SummarySources, type SummaryQuery, norm, compare, range, countrySelection, fleetText } from "./summary-sources";

interface Selection { indices: number[]; latest: number[]; kpis: SummaryKpis }
const selections = new Map<string, Selection>();
const windows = new Map<string, number[]>();
function put<T>(m: Map<string, T>, k: string, v: T, limit: number) {
  if (m.size >= limit) m.delete(m.keys().next().value!);
  m.set(k, v);
}
export function selectedFleet(s: SummarySources, q: SummaryQuery): Selection {
  const { from, to } = range(q), country = countrySelection(s, q);
  const key = JSON.stringify([from, to, country, q.airline && norm(q.airline), q.manufacturer && norm(q.manufacturer), q.aircraftModel && norm(q.aircraftModel)]);
  const hit = selections.get(key); if (hit) return hit;
  const { fleet: f, countries: c } = s;
  const lookups = [[5, q.airline], [0, q.manufacturer], [1, q.aircraftModel]] as const;
  const tests = lookups.flatMap(([col, value]) => value ? [[col, f.dimensions[col].findIndex(v => norm(v) === norm(value))] as const] : []);
  const months = f.dimensions[11].map(d => d >= from && d <= to);
  const countries = c.codes.map(code => !country || code === country);
  const ids = [new Set<number>(), new Set<number>(), new Set<number>()];
  const indices: number[] = [], latest = new Map<string, number>();
  let hours = 0, cycles = 0, ratios = 0, hc = 0, cc = 0, rc = 0;
  for (let i = 0; i < f.rows.length; i++) {
    const r = f.rows[i];
    if (!months[r[11] as number] || !countries[c.rows[i]] || tests.some(([col, id]) => r[col] !== id)) continue;
    indices.push(i); ids[0].add(r[5] as number); ids[1].add(r[4] as number); ids[2].add(r[1] as number);
    if (r[14] !== null) { hours += r[14]; hc++; }
    if (r[15] !== null) { cycles += r[15]; cc++; }
    if (r[16] !== null) { ratios += r[16]; rc++; }
    const k = `${r[17]}/${c.rows[i]}`, previous = latest.get(k);
    if (previous === undefined || f.dimensions[11][r[11] as number] > fleetText(s, previous, 11)) latest.set(k, i);
  }
  const result: Selection = { indices, latest: [...latest.values()], kpis: {
    airlines: ids[0].size, aircraft: ids[1].size, models: ids[2].size,
    hoursLtm: hc ? hours : null, cyclesLtm: cc ? cycles : null, avgRatio: rc ? ratios / rc : null, sourceRows: indices.length,
  } };
  put(selections, key, result, 8); return result;
}
export function summaryFleetRecord(s: SummarySources, i: number): SummaryFleetRecord {
  const r = s.fleet.rows[i], t = (c: number) => fleetText(s, i, c);
  return { id: (r[17] as number) * s.countries.labels.length + s.countries.rows[i], manufacturer: t(0), model: t(1), aircraftType: t(2), registration: t(3), msn: t(4),
    operator: t(5), operatorIcao: s.fleet.dimensions[13][r[18] as number], owner: t(6), firstFlight: t(7),
    engineManufacturer: t(8), engineFamily: t(9), engineModel: t(10), lastUpdate: t(11), year: r[13],
    hoursLtm: r[14], cyclesLtm: r[15], ratio: r[16], country: s.countries.labels[s.countries.rows[i]] };
}
const sortColumns = { msn: 4, registration: 3, model: 1, operator: 5, owner: 6, manufacturer: 0,
  engineManufacturer: 8, engineFamily: 9, engineModel: 10, lastUpdate: 11, hoursLtm: 14, cyclesLtm: 15, country: 19 } as const;
export async function orderedSummaryFleet(q: SummaryQuery) {
  const s = await summarySources(), selection = selectedFleet(s, q), sort = q.sort || "lastUpdate", search = norm(q.search || "");
  const { from, to } = range(q);
  const key = JSON.stringify([from, to, q.country && norm(q.country), q.airline && norm(q.airline),
    q.manufacturer && norm(q.manufacturer), q.aircraftModel && norm(q.aircraftModel), sort, q.direction || "desc", search]);
  let indices = windows.get(key);
  if (!indices) {
    indices = search ? selection.latest.filter(i => Object.values(summaryFleetRecord(s, i)).some(v => norm(String(v ?? "")).includes(search))) : [...selection.latest];
    const col = sortColumns[sort], dir = q.direction === "asc" ? 1 : -1;
    const value = (i: number) => col === 19 ? s.countries.labels[s.countries.rows[i]] :
      col >= 14 ? s.fleet.rows[i][col] : fleetText(s, i, col);
    indices.sort((a, b) => {
      const x = value(a), y = value(b);
      if (x === null || x === "") return y === null || y === "" ? a - b : 1;
      if (y === null || y === "") return -1;
      const cmp = typeof x === "number" && typeof y === "number" ? x - y : compare(String(x), String(y));
      return cmp * dir || compare(fleetText(s, a, 4), fleetText(s, b, 4)) || a - b;
    });
    put(windows, key, indices, 8);
  }
  return { s, indices };
}
export async function summaryRecords(q: SummaryQuery) {
  const { s, indices } = await orderedSummaryFleet(q), offset = q.offset ?? 0, limit = q.limit ?? 200;
  return { rows: indices.slice(offset, offset + limit).map(i => summaryFleetRecord(s, i)), total: indices.length,
    nextOffset: offset + limit < indices.length ? offset + limit : null };
}
export async function summaryExport(q: SummaryQuery) {
  const { s, indices } = await orderedSummaryFleet(q);
  return (function* () {
    const fields: (keyof SummaryFleetRecord)[] = ["msn", "registration", "model", "hoursLtm", "cyclesLtm", "operator", "owner",
      "country", "manufacturer", "engineManufacturer", "engineFamily", "engineModel", "lastUpdate", "aircraftType", "ratio", "year"];
    yield "\uFEFF" + fields.join(",") + "\r\n";
    for (const i of indices) {
      const r = summaryFleetRecord(s, i);
      yield fields.map(k => {
        let v = String(r[k] ?? "");
        if (typeof r[k] === "string" && /^[=+\-@\t\r]/.test(v)) v = `'${v}`;
        return `"${v.replace(/"/g, '""')}"`;
      }).join(",") + "\r\n";
    }
  })();
}
