import type { SummaryDashboard, SummaryFinance, SummaryIntensity } from "@workspace/api-zod";
import { summarySources, type SummarySources, type SummaryQuery, summaryKey, norm, compare, range, countrySelection, countryCode, fleetText } from "./summary-sources";
import { selectedFleet } from "./summary-fleet";

const cache = new Map<string, SummaryDashboard>();
function volumes(s: SummarySources, q: SummaryQuery) {
  const { from, to } = range(q), country = countrySelection(s, q);
  const manufacturer = new Map<string, { name: string; deliveries: number; orders: number }>();
  const engines = new Map<string, { name: string; deliveries: number; orders: number }>();
  const regions = [new Map<string, { name: string; value: number }>(), new Map<string, { name: string; value: number }>()];
  const totals = [0, 0];
  [s.deliveries, s.orders].forEach((rows, d) => {
    for (const r of rows) {
      if (r.date < from || r.date > to || (country && countryCode(s, r.country) !== country) ||
          (q.airline && norm(r.customer) !== norm(q.airline)) ||
          (q.model && norm(r.model) !== norm(q.model)) ||
          (q.manufacturer && norm(r.manufacturer) !== norm(q.manufacturer))) continue;
      totals[d] += r.quantity;
      const key = norm(r.region), group = regions[d].get(key) ?? { name: r.region || "(Blank)", value: 0 };
      group.value += r.quantity; regions[d].set(key, group);
      for (const [map, name] of [[manufacturer, r.manufacturer], [engines, r.engine]] as const) {
        const k = norm(name), g = map.get(k) ?? { name: name || "(Blank)", deliveries: 0, orders: 0 };
        if (d === 0) g.deliveries += r.quantity; else g.orders += r.quantity;
        map.set(k, g);
      }
    }
  });
  const rank = (g: Map<string, { name: string; value: number }>) => [...g.values()]
    .sort((a, b) => b.value - a.value || compare(a.name, b.name)).slice(0, 250);
  return {
    deliveries: totals[0], orders: totals[1], deliveryRegions: rank(regions[0]), orderRegions: rank(regions[1]),
    manufacturerVolumes: [...manufacturer.values()].sort((a, b) => b.deliveries + b.orders - a.deliveries - a.orders || compare(a.name, b.name)),
    deliveryManufacturerShares: [...manufacturer.values()].filter(r => r.deliveries !== 0)
      .map(r => ({ name: r.name, value: r.deliveries })).sort((a, b) => b.value - a.value || compare(a.name, b.name)),
    engines: [...engines.values()].sort((a, b) => b.deliveries - a.deliveries || b.orders - a.orders || compare(a.name, b.name)).slice(0, 250),
  };
}
function financials(s: SummarySources, q: SummaryQuery) {
  const year = "FY " + range(q).to.slice(0, 4), f = s.finance;
  const yid = f.dimensions[3].indexOf(year), aid = q.airline ? f.dimensions[2].findIndex(a => norm(a) === norm(q.airline!)) : null;
  const groups = new Map<string, { amount: number; raw: number; values: number; rows: number; ifrs: Set<string> }>();
  let rows = 0;
  const negate = new Set(["Current Liabilities", "Non-Current Liabilities", "Total Liabilities", "Total Equity"]);
  for (const r of f.rows) {
    if (r[3] !== yid || (aid !== null && r[2] !== aid)) continue;
    rows++;
    const category = f.dimensions[1][r[1] as number], metric = f.dimensions[0][r[0] as number];
    const g = groups.get(category) ?? { amount: 0, raw: 0, values: 0, rows: 0, ifrs: new Set<string>() };
    g.rows++; g.ifrs.add(f.dimensions[9][r[9] as number] || "Not stated");
    if (r[14] !== null) {
      const sign = negate.has(category) || (category === "Current/Non-Current" && metric.includes("Liabilities")) ? -1 : 1;
      g.amount += sign * r[14]; g.raw += r[14]; g.values++;
    }
    groups.set(category, g);
  }
  const order = ["Equity", "Current/Non-Current", "Current Assets", "Non-Current Assets", "Total Assets", "Current Liabilities",
    "Non-Current Liabilities", "Total Liabilities", "Total Equity", "Revenue", "Total Revenue", "Costs", "Profit/(Loss)", "Financial/Taxation"];
  const finance: SummaryFinance[] = [...groups].map(([category, g]) => ({ category, amount: g.values ? g.amount : null,
    rawAmount: g.values ? g.raw : null, financialYear: year, ifrs: g.ifrs.size === 1 ? [...g.ifrs][0] : "Mixed: " + [...g.ifrs].sort(compare).join(", "), rows: g.rows }))
    .sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
  return { finance, financeYear: year, financeRows: rows };
}
function emissionIntensities(s: SummarySources, q: SummaryQuery, fleetIndices: number[]) {
  const { from, to } = range(q), e = s.emissions;
  const months = e.dimensions[0].map(d => d >= from && d <= to);
  const aid = q.airline ? e.dimensions[5].findIndex(a => norm(a) === norm(q.airline!)) : null;
  const mid = q.aircraftModel ? e.dimensions[2].findIndex(a => norm(a) === norm(q.aircraftModel!)) : null;
  const constrained = Boolean(q.country || q.manufacturer || q.aircraftModel);
  const bridge = constrained ? new Set(fleetIndices.map(i => JSON.stringify([fleetText(s, i, 11), norm(fleetText(s, i, 4)), norm(fleetText(s, i, 1))]))) : null;
  const keys = bridge ? e.dimensions[0].map(() => new Map<string, boolean>()) : null;
  const groups = new Map<number, { mass: number; transport: number; incomplete: boolean; rows: number }>();
  let emissionsRows = 0;
  for (const r of e.rows) {
    if (!months[r[0]] || (aid !== null && r[5] !== aid) || (mid !== null && r[2] !== mid)) continue;
    if (bridge && keys) {
      const pair = `${r[1]}/${r[2]}`, m = keys[r[0]];
      let match = m.get(pair);
      if (match === undefined) {
        match = bridge.has(JSON.stringify([e.dimensions[0][r[0]], norm(e.dimensions[1][r[1]]), norm(e.dimensions[2][r[2]])]));
        m.set(pair, match);
      }
      if (!match) continue;
    }
    emissionsRows++;
    const g = groups.get(r[5]) ?? { mass: 0, transport: 0, incomplete: false, rows: 0 };
    g.rows++; if (r[11] === null) g.incomplete = true;
    g.mass += r[8] ?? 0;
    if (r[8] !== null && r[11] !== null && r[11] !== 0) g.transport += r[8] / r[11];
    groups.set(r[5], g);
  }
  const intensities: SummaryIntensity[] = [...groups].map(([id, g]) => {
    const unavailable = g.incomplete || g.transport === 0;
    return { name: e.dimensions[5][id], value: unavailable ? 0 : g.mass / g.transport, unavailable, rows: g.rows };
  }).filter(r => r.name && Number.isFinite(r.value)).sort((a, b) => b.value - a.value || compare(a.name, b.name)).slice(0, 250);
  return { intensities, emissionsRows };
}
export async function summaryDashboard(q: SummaryQuery): Promise<SummaryDashboard> {
  const key = summaryKey(q), cached = cache.get(key); if (cached) return cached;
  const s = await summarySources(), fleet = selectedFleet(s, q), country = countrySelection(s, q);
  const data: SummaryDashboard = {
    ...range(q), kpis: fleet.kpis, ...volumes(s, q), ...financials(s, q),
    ...emissionIntensities(s, q, fleet.indices), registryEntries: fleet.latest.length, rankingLimit: 250,
    riskRows: s.risk.rows.filter(r => !country || r.alpha3 === country).sort((a, b) => compare(a.country, b.country)),
    riskGeography: s.risk.mapGeography,
  };
  if (cache.size >= 8) cache.delete(cache.keys().next().value!);
  cache.set(key, data); return data;
}
