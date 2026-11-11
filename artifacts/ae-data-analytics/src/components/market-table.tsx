import { useMemo, useState } from "react";
import type { MarketRateRecord } from "@workspace/api-client-react";
import { AlertTriangle, ArrowDown, ArrowUp, Download, Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadCSV, nf } from "@/lib/deliveries";
import { f2, isReversed } from "@/lib/market-rates";

type K = keyof MarketRateRecord;
const COLS: { k: K; l: string; num?: boolean; w: number }[] = [
  { k: "vintage", l: "Vintage", num: true, w: 64 },
  { k: "manufacturer", l: "Manufacturer", w: 110 },
  { k: "aircraftType", l: "Aircraft Type", w: 110 },
  { k: "aircraftRole", l: "Aircraft Role", w: 100 },
  { k: "marketGroup", l: "Aircraft Market Group", w: 150 },
  { k: "family", l: "Family", w: 90 },
  { k: "icao1", l: "ICAO code 1", w: 80 },
  { k: "icao2", l: "ICAO code 2", w: 80 },
  { k: "leaseRateHigh", l: "Lease Rate High", num: true, w: 104 },
  { k: "leaseRateLow", l: "Lease Rate Low", num: true, w: 100 },
  { k: "marketValue", l: "Market Value", num: true, w: 96 },
  { k: "technology", l: "Technology", w: 140 },
];

export function MarketTable({ rows, loading }: { rows: MarketRateRecord[]; loading: boolean }) {
  const [sort, setSort] = useState<{ k: K; dir: 1 | -1 }>({ k: "marketValue", dir: 1 });
  const [search, setSearch] = useState("");
  const view = useMemo(() => {
    const s = search.trim().toLowerCase();
    const r = s ? rows.filter((x) => COLS.some((c) => String(x[c.k] ?? "").toLowerCase().includes(s))) : rows.slice();
    return r.sort((a, b) => {
      const av = a[sort.k], bv = b[sort.k];
      let c: number;
      if (av == null || bv == null) c = av == null && bv == null ? 0 : av == null ? 1 : -1;
      else c = (typeof av === "number" ? av - (bv as number) : String(av).localeCompare(String(bv))) * sort.dir;
      return c || a.id - b.id;
    });
  }, [rows, search, sort]);
  const csv = () => downloadCSV("market-value-lease-rates-filtered.csv", view.map((r) => ({ vintage: r.vintage, manufacturer: r.manufacturer, aircraft_type: r.aircraftType, aircraft_role: r.aircraftRole, aircraft_market_group: r.marketGroup, family: r.family, icao_code_1: r.icao1, icao_code_2: r.icao2, lease_rate_high_usd_m: r.leaseRateHigh ?? "", lease_rate_low_usd_m: r.leaseRateLow ?? "", market_value_usd_m: r.marketValue ?? "", technology: r.technology, reversed_lease_bounds: isReversed(r) ? "yes" : "" })));
  return (
    <section className="panel flex min-w-0 flex-col rounded-[3px] bg-card">
      <div className="flex items-center gap-2 px-2 pb-1 pt-1.5">
        <h2 className="mr-auto text-[12px] font-semibold">Valuation records <span className="font-normal text-muted-foreground">(USD M; lease rates monthly)</span></h2>
        <div className="flex h-[22px] items-center gap-1 rounded-[3px] border border-input px-1.5 print:hidden">
          <Search className="h-3 w-3 opacity-60" />
          <input data-testid="input-table-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search rows" className="w-28 bg-transparent text-[11px] outline-none sm:w-40" />
        </div>
        <button onClick={csv} data-testid="csv-table" aria-label="Download table as CSV" className="flex h-[22px] w-[22px] items-center justify-center rounded-[3px] bg-foreground/10 hover:bg-foreground/20 print:hidden"><Download className="h-3 w-3" /></button>
      </div>
      <div className="thin-scroll h-[440px] overflow-auto" tabIndex={0} role="region" aria-label="Scrollable valuation records" data-testid="market-table-scroll">
        <table className="w-full min-w-[1224px] table-fixed text-[11.5px]">
          <colgroup>{COLS.map((c) => <col key={c.k} style={{ width: c.w }} />)}</colgroup>
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="h-7 border-b border-foreground/30">
              {COLS.map((c) => (
                <th key={c.k} className={`whitespace-nowrap px-2 font-semibold ${c.num ? "text-right" : "text-left"}`}>
                  <button data-testid={`sort-${c.k}`} onClick={() => setSort((s) => ({ k: c.k, dir: s.k === c.k ? (s.dir === 1 ? -1 : 1) : 1 }))} className="inline-flex items-center gap-0.5 hover:text-primary">
                    {c.l}{sort.k === c.k && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? Array.from({ length: 12 }).map((_, i) => <tr key={i}><td colSpan={12} className="px-2 py-1"><Skeleton className="h-4" /></td></tr>)
              : view.length === 0 ? <tr><td colSpan={12} className="px-2 py-8 text-center text-muted-foreground">No rows match "{search}"</td></tr>
              : view.map((r) => {
                const rev = isReversed(r);
                return (
                  <tr key={r.id} data-testid={`row-market-${r.id}`} className={`h-[26px] border-b border-border/40 hover:bg-primary/10 [&>td]:truncate ${rev ? "bg-amber-500/10" : ""}`}>
                    <td className="px-2 text-right tnum">{r.vintage}</td>
                    <td className="px-2">{r.manufacturer}</td>
                    <td className="px-2 font-medium">{r.aircraftType}</td>
                    <td className="px-2">{r.aircraftRole}</td>
                    <td className="px-2">{r.marketGroup}</td>
                    <td className="px-2">{r.family}</td>
                    <td className="px-2">{r.icao1}</td>
                    <td className="px-2">{r.icao2}</td>
                    <td className="px-2 text-right tnum" title={rev ? `Source anomaly: lease rate high (${r.leaseRateHigh}) is below low (${r.leaseRateLow}). Shown as reported.` : r.leaseRateHigh != null ? String(r.leaseRateHigh) : undefined}>
                      {rev && <AlertTriangle className="mr-1 inline h-3 w-3 text-amber-500" aria-label="Reversed source bounds" />}{f2(r.leaseRateHigh)}
                    </td>
                    <td className="px-2 text-right tnum" title={r.leaseRateLow != null ? String(r.leaseRateLow) : undefined}>{f2(r.leaseRateLow)}</td>
                    <td className="px-2 text-right tnum" title={r.marketValue != null ? String(r.marketValue) : undefined}>{f2(r.marketValue)}</td>
                    <td className="px-2">{r.technology}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between px-2 py-1.5 text-[11px] text-muted-foreground print:hidden">
        <span className="tnum" data-testid="text-row-count">{nf(view.length)} rows</span><span>Scroll to browse &middot; highlighted rows have high below low in source</span>
      </div>
    </section>
  );
}
