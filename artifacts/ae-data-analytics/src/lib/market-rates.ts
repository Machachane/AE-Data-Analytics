import type { MarketRateRecord } from "@workspace/api-client-react";

export interface MarketFilters { manufacturer: string[]; aircraftType: string[]; vintage: string[] }
export interface MarketRange { name: string; low: number; high: number; count: number }
export type RangeKind = "lease" | "market";

export function filterMarketRows(rows: MarketRateRecord[], f: MarketFilters): MarketRateRecord[] {
  return rows.filter((r) =>
    (f.manufacturer.length === 0 || f.manufacturer.includes(r.manufacturer)) &&
    (f.aircraftType.length === 0 || f.aircraftType.includes(r.aircraftType)) &&
    (f.vintage.length === 0 || f.vintage.includes(String(r.vintage))));
}

/** Lease: MIN(leaseRateLow)..MAX(leaseRateHigh). Market: MIN..MAX(marketValue). Nulls ignored. Sorted by lower bound desc. */
export function marketRanges(rows: MarketRateRecord[], kind: RangeKind): MarketRange[] {
  const m = new Map<string, { low: number | null; high: number | null; count: number }>();
  for (const r of rows) {
    const lo = kind === "lease" ? r.leaseRateLow : r.marketValue;
    const hi = kind === "lease" ? r.leaseRateHigh : r.marketValue;
    if (lo == null && hi == null) continue;
    const g = m.get(r.aircraftType) ?? { low: null, high: null, count: 0 };
    if (lo != null) g.low = g.low == null ? lo : Math.min(g.low, lo);
    if (hi != null) g.high = g.high == null ? hi : Math.max(g.high, hi);
    g.count++;
    m.set(r.aircraftType, g);
  }
  const out: MarketRange[] = [];
  for (const [name, g] of m) if (g.low != null && g.high != null) out.push({ name, low: g.low, high: g.high, count: g.count });
  return out.sort((a, b) => b.low - a.low || a.name.localeCompare(b.name));
}

/** Aircraft types present in rows but lacking one of the bounds for this kind. */
export function missingBoundTypes(rows: MarketRateRecord[], kind: RangeKind): string[] {
  const all = new Set(rows.map((r) => r.aircraftType));
  const have = new Set(marketRanges(rows, kind).map((r) => r.name));
  return [...all].filter((t) => !have.has(t)).sort();
}

export const isReversed = (r: MarketRateRecord) => r.leaseRateLow != null && r.leaseRateHigh != null && r.leaseRateHigh < r.leaseRateLow;
// Decimal half-up display matches Power BI (e.g. source 0.075 -> 0.08, not binary toFixed's 0.07).
export const f2 = (n: number | null) => (n == null ? "" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }));
