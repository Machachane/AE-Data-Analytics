import { Download } from "lucide-react";
import type { EmissionsRank } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadCSV, nf } from "@/lib/deliveries";

const f2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Green horizontal ranking of transport-weighted CO2 intensity (gCO2e/RTK). Click a row to toggle the filter. */
export function EmissionsRanking({ title, id, rows, limit, selected, onPick }: { title: string; id: string; rows?: EmissionsRank[]; limit?: number; selected: string; onPick: (v: string) => void }) {
  const max = Math.max(1e-9, ...(rows ?? []).map((r) => Math.abs(r.value)));
  return (
    <section className="panel flex min-w-0 flex-col rounded-[3px] bg-card" aria-label={`${title} by CO2 intensity`}>
      <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_22px] items-end gap-1.5 border-b border-foreground/30 px-2 pb-1 pt-1.5 text-[11px] font-semibold">
        <span>{title}</span>
        <span className="leading-tight">CO<sub>2</sub> intensity (in CO<sub>2</sub>/RTK)</span>
        {rows && rows.length > 0 ? (
          <button data-testid={`csv-rank-${id}`} aria-label={`Download ${title} ranking as CSV`} onClick={() => downloadCSV(`emissions-co2-intensity-by-${id}.csv`, rows.map((r) => ({ [id]: r.name, gco2e_per_rtk_transport_weighted: r.value })))}
            className="flex h-[22px] w-[22px] items-center justify-center rounded-[3px] bg-foreground/10 text-foreground/80 transition-colors hover:bg-foreground/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring print:hidden">
            <Download className="h-3 w-3" />
          </button>
        ) : <span />}
      </div>
      <div className="thin-scroll h-[220px] overflow-y-auto py-0.5" role="list">
        {!rows ? Array.from({ length: 11 }).map((_, i) => <Skeleton key={i} className="mx-2 my-1 h-3.5" />) : rows.length === 0 ? (
          <div className="flex h-full items-center justify-center px-3 text-center text-[11px] text-muted-foreground">No {title.toLowerCase()} with a CO<sub>2</sub>/RTK value in view</div>
        ) : rows.map((d) => {
          const on = selected === d.name;
          return (
            <button key={d.name} role="listitem" data-testid={`rank-${id}-${d.name}`} aria-pressed={on} onClick={() => onPick(d.name)} title={`${d.name}: ${d.value} gCO2e/RTK${on ? " (click to clear filter)" : " (click to filter)"}`}
              className={`grid w-full grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_22px] items-center gap-1.5 px-2 py-[2px] text-left text-[11px] transition-colors hover:bg-primary/10 focus-visible:bg-primary/15 focus-visible:outline-none ${on ? "bg-primary/20 font-semibold" : selected ? "opacity-55" : ""}`}>
              <span className="truncate font-medium">{d.name}</span>
              <span className="relative h-[13px]">
                <span className="absolute inset-y-0 left-0 rounded-[1px] bg-[#2ecc8f] transition-[width] duration-300" style={{ width: `${(Math.abs(d.value) / max) * 100}%` }} />
                <span className="relative block pr-1 text-right tnum">{f2(d.value)}</span>
              </span>
              <span />
            </button>
          );
        })}
      </div>
      <div className="border-t border-foreground/30 px-2 py-1 text-[10.5px] text-muted-foreground tnum" data-testid={`note-rank-${id}`}>
        {rows ? <>Top {nf(limit ?? rows.length)} &middot; gCO<sub>2</sub>e/RTK &middot; blank names omitted<br />0 may indicate incomplete intensity data; see source notes.</> : "\u00a0"}
      </div>
    </section>
  );
}
