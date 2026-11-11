import { Download } from "lucide-react";
import type { RegistryRank } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadCSV, nf } from "@/lib/deliveries";

function Ranking({ title, id, rows, limit, selected, onPick }: { title: string; id: string; rows?: RegistryRank[]; limit?: number; selected: string; onPick: (v: string) => void }) {
  const max = Math.max(1, ...(rows ?? []).map((r) => r.aircraft));
  const truncated = rows && limit != null && rows.length >= limit;
  return (
    <section className="panel flex min-w-0 flex-col rounded-[3px] bg-card" aria-label={`Aircraft by ${title}`}>
      <div className="flex items-center gap-2 border-b border-foreground/30 px-2 pb-1 pt-1.5 text-[11px] font-semibold">
        <span className="mr-auto">Aircraft (distinct MSN) by {title}</span>
        {rows && rows.length > 0 && (
          <button data-testid={`csv-rank-${id}`} aria-label={`Download ${title} ranking as CSV`} onClick={() => downloadCSV(`aircraft-registry-by-${id}.csv`, rows.map((r) => ({ [id]: r.name, aircraft_distinct_msn: r.aircraft })))}
            className="flex h-[22px] w-[22px] items-center justify-center rounded-[3px] bg-foreground/10 hover:bg-foreground/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring print:hidden">
            <Download className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="thin-scroll h-[300px] overflow-y-auto py-0.5" role="list">
        {!rows ? Array.from({ length: 14 }).map((_, i) => <Skeleton key={i} className="mx-2 my-1 h-3.5" />) : rows.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">No {title.toLowerCase()} in view</div>
        ) : rows.map((d) => {
          const on = selected === d.name;
          return (
            <button key={d.name} role="listitem" data-testid={`rank-${id}-${d.name}`} aria-pressed={on} onClick={() => onPick(d.name)} title={`${d.name === "" ? "(Blank)" : d.name}: ${d.aircraft.toLocaleString("en-US")} aircraft${on ? " (click to clear filter)" : " (click to filter)"}`}
              className={`grid w-full grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] items-center gap-1.5 px-2 py-[2px] text-left text-[11px] transition-colors hover:bg-primary/10 focus-visible:bg-primary/15 focus-visible:outline-none ${on ? "bg-primary/20 font-semibold" : selected ? "opacity-55" : ""}`}>
              <span className={`truncate ${d.name === "" ? "italic text-muted-foreground" : "font-medium"}`}>{d.name === "" ? "(Blank)" : d.name}</span>
              <span className="relative h-[13px]">
                <span className="absolute inset-y-0 left-0 rounded-[1px] bg-primary transition-[width] duration-300" style={{ width: `${(d.aircraft / max) * 100}%` }} />
                <span className="relative block pr-1 text-right tnum">{nf(d.aircraft)}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="border-t border-foreground/30 px-2 py-1 text-[10.5px] text-muted-foreground">
        {rows ? (truncated ? `Top ${limit} shown` : `${rows.length} shown`) : "\u00a0"} &middot; non-additive across categories
      </div>
    </section>
  );
}

type Sel = { manufacturer: string; model: string; operator: string; owner: string };
type Data = { manufacturerRanking: RegistryRank[]; modelRanking: RegistryRank[]; operatorRanking: RegistryRank[]; ownerRanking: RegistryRank[]; rankingLimit: number };

export function RegistryGraphs({ data, selected, onPick }: { data?: Data; selected: Sel; onPick: (k: keyof Sel, v: string) => void }) {
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
        <Ranking title="Manufacturer" id="manufacturer" rows={data?.manufacturerRanking} limit={data?.rankingLimit} selected={selected.manufacturer} onPick={(v) => onPick("manufacturer", v)} />
        <Ranking title="Model" id="model" rows={data?.modelRanking} limit={data?.rankingLimit} selected={selected.model} onPick={(v) => onPick("model", v)} />
        <Ranking title="Operator" id="operator" rows={data?.operatorRanking} limit={data?.rankingLimit} selected={selected.operator} onPick={(v) => onPick("operator", v)} />
        <Ranking title="Owner" id="owner" rows={data?.ownerRanking} limit={data?.rankingLimit} selected={selected.owner} onPick={(v) => onPick("owner", v)} />
      </div>
      <p className="text-[10.5px] text-muted-foreground">Bars count distinct MSNs (including blank MSN) across the full source history. An aircraft can appear under several operators or owners over time, so values do not sum to the Total Aircraft KPI. Click a bar to toggle that filter.</p>
    </div>
  );
}
