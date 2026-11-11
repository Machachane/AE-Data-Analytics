import { Download, AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadCSV } from "@/lib/deliveries";
import type { MarketRange, RangeKind } from "@/lib/market-rates";

export type ChartMode = "original" | "interval";

const niceMax = (v: number) => {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => s * p >= v) ?? 10;
  return n * p;
};

export function MarketRangeChart({ kind, ranges, mode, selected, onPick, missing, loading }: { kind: RangeKind; ranges?: MarketRange[]; mode: ChartMode; selected: string[]; onPick: (t: string) => void; missing: string[]; loading: boolean }) {
  const lease = kind === "lease";
  const color = lease ? "#22c98a" : "#2f8fe0";
  const dp = lease ? 3 : 2;
  const title = lease ? "Monthly Lease Rate Range (USD M)" : "Market Value Range (USD M)";
  const list = ranges ?? [];
  const end = (r: MarketRange) => (mode === "original" ? r.low + r.high : Math.max(r.low, r.high));
  const max = niceMax(Math.max(0, ...list.map(end)));
  const magnitude = max / Math.pow(10, Math.floor(Math.log10(max)));
  const divisions = [1.5, 3, 6].includes(magnitude) ? 6 : 5;
  const ticks = Array.from({ length: divisions + 1 }, (_, i) => i * max / divisions);
  const pct = (v: number) => `${(v / max) * 100}%`;
  const csv = () => downloadCSV(`${lease ? "lease-rate" : "market-value"}-range-by-aircraft-type.csv`, list.map((r) => ({ aircraft_type: r.name, [lease ? "min_lease_rate_low_usd_m" : "min_market_value_usd_m"]: r.low, [lease ? "max_lease_rate_high_usd_m" : "max_market_value_usd_m"]: r.high, records: r.count, ...(mode === "original" ? { original_stacked_axis_end: r.low + r.high } : {}) })));
  return (
    <section className="panel flex min-w-0 flex-col rounded-[3px] bg-card" data-testid={`chart-${kind}`}>
      <div className="flex items-center gap-2 px-2 pb-1 pt-1.5">
        <h2 className="mr-auto text-[12px] font-semibold">{title}</h2>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><span className="h-2 w-2 rounded-[1px]" style={{ background: color }} />{lease ? "low / high" : "min / max"}</span>
        {list.length > 0 && <button onClick={csv} data-testid={`csv-chart-${kind}`} aria-label={`Download ${title} as CSV`} className="flex h-[22px] w-[22px] items-center justify-center rounded-[3px] bg-foreground/10 hover:bg-foreground/20 print:hidden"><Download className="h-3 w-3" /></button>}
      </div>
      <div className="thin-scroll h-[300px] overflow-y-auto px-2">
        {loading ? Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="my-1 h-3.5" />) : list.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">No {lease ? "lease rate" : "market value"} bounds in view</div>
        ) : list.map((r) => {
          const on = selected.includes(r.name);
          const rev = r.high < r.low;
          const a = mode === "original" ? r.low : Math.min(r.low, r.high);
          const b = mode === "original" ? r.low + r.high : Math.max(r.low, r.high);
          const reversedInterval = mode === "interval" && rev;
          const leftValue = reversedInterval ? r.high : r.low;
          const rightValue = reversedInterval ? r.low : r.high;
          const tip = `${r.name}: ${lease ? "lowest lease rate low" : "min market value"} USD ${r.low}M, ${lease ? "highest lease rate high" : "max market value"} USD ${r.high}M (${r.count} record${r.count === 1 ? "" : "s"})${rev ? ". Reversed source bounds: high below low." : ""}${mode === "original" ? ` Original stacked layout: bar ends at ${(r.low + r.high).toFixed(dp)} (low + high); labels show actual source values.` : ""}`;
          return (
            <Tooltip key={r.name}>
              <TooltipTrigger asChild>
                <button data-testid={`bar-${kind}-${r.name}`} aria-pressed={on} aria-label={`${tip} Toggle aircraft type filter.`} onClick={() => onPick(r.name)}
                  className={`grid w-full grid-cols-[86px_minmax(0,1fr)] items-center gap-1.5 py-[2px] text-left text-[11px] transition-colors hover:bg-primary/10 focus-visible:outline focus-visible:outline-1 focus-visible:outline-primary ${on ? "bg-primary/20" : selected.length ? "opacity-60" : ""}`}>
                  <span className="truncate text-right font-medium">{r.name}</span>
                  <span className="relative block h-[15px]">
                    <span className="absolute inset-y-0 rounded-[1px] transition-all duration-300" style={{ left: pct(a), width: `max(2px, ${pct(b - a)})`, background: color, outline: rev ? "1px dashed #f59e0b" : undefined }} />
                    <span className="absolute top-0 -translate-x-full pr-1 text-[10px] tnum leading-[15px]" style={{ left: pct(a) }}>{reversedInterval ? "H " : ""}{leftValue.toFixed(dp)}</span>
                    <span className="absolute top-0 text-[10px] font-semibold tnum leading-[15px]" style={{ left: pct(b), transform: (b / max) > 0.85 ? "translateX(-100%)" : undefined, paddingLeft: 3, paddingRight: 3 }}>{reversedInterval ? "L " : ""}{rightValue.toFixed(dp)}{rev && <AlertTriangle className="ml-0.5 inline h-2.5 w-2.5 text-amber-500" />}</span>
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-[11px]">{tip}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      <div className="ml-[94px] mr-2 flex justify-between border-t border-foreground/30 pt-0.5 text-[10px] text-muted-foreground tnum">{ticks.map((t) => <span key={t}>{t.toLocaleString("en-US", { maximumFractionDigits: 3, useGrouping: false })}</span>)}</div>
      <div className="px-2 pb-1.5 pt-1 text-[10px] leading-snug text-muted-foreground">
        {list.length} aircraft types &middot; sorted by lower bound &middot; click a bar to filter.{" "}
        {mode === "original" ? <span data-testid={`note-mode-${kind}`}>Original stacked layout: bar starts at the lower bound and its length equals the upper bound, so bar ends are low + high. Labels show actual source values.</span> : <span data-testid={`note-mode-${kind}`}>True interval: bar spans lower to upper bound.</span>}
        {missing.length > 0 && <> Omitted (missing bounds): {missing.join(", ")}.</>}
      </div>
    </section>
  );
}
