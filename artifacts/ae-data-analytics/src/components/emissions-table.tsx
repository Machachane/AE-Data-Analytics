import { useEffect, useMemo, useRef, useState } from "react";
import { useGetEmissionsRecords, getGetEmissionsRecordsQueryKey, getGetEmissionsRecordsUrl } from "@workspace/api-client-react";
import type { EmissionsRecord, GetEmissionsParams, GetEmissionsRecordsParams, GetEmissionsRecordsSort } from "@workspace/api-client-react";
import { AlertTriangle, ArrowDown, ArrowUp, Download, Loader2, Search, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { nf } from "@/lib/deliveries";

const ROW = 24;
const PAGE = 200;
const VIEW_H = 460;
const MAX_PX = 12_000_000; // stay well below browser element height limits
const OVERSCAN = 12;

type Col = { key: GetEmissionsRecordsSort; label: string; w: string; num?: boolean; render: (r: EmissionsRecord) => string };
const fx = (n: number | null, d: number) => (n == null ? "" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: d > 0 }));
export const longDate = (iso: string) => {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });
};
const COLS: Col[] = [
  { key: "msn", label: "MSN", w: "minmax(90px,0.9fr)", render: (r) => r.msn },
  { key: "icao", label: "Aircraft ICAO", w: "minmax(84px,0.7fr)", render: (r) => r.icao },
  { key: "airline", label: "Airline", w: "minmax(150px,1.6fr)", render: (r) => r.airline },
  { key: "operatorGroup", label: "Operator Group", w: "minmax(140px,1.4fr)", render: (r) => r.operatorGroup },
  { key: "engine", label: "Engine Model", w: "minmax(110px,1fr)", render: (r) => r.engine },
  { key: "co2", label: "WTW CO2 kgco2e", w: "minmax(104px,0.9fr)", num: true, render: (r) => fx(r.co2, 0) },
  { key: "perAsk", label: "WTW CO2 per ask gco2e", w: "minmax(104px,0.9fr)", num: true, render: (r) => fx(r.perAsk, 2) },
  { key: "perRpk", label: "WTW CO2 per rpk gco2e", w: "minmax(104px,0.9fr)", num: true, render: (r) => fx(r.perRpk, 2) },
  { key: "perRtk", label: "WTW co2 per rtk gco2e", w: "minmax(104px,0.9fr)", num: true, render: (r) => fx(r.perRtk, 2) },
  { key: "date", label: "Date", w: "minmax(120px,1fr)", render: (r) => longDate(r.date) },
];
const GRID = COLS.map((c) => c.w).join(" ");

type Sort = { key: GetEmissionsRecordsSort; dir: "asc" | "desc" } | null;

export function EmissionsTable({ filters, enabled, interval }: { filters: GetEmissionsParams; enabled: boolean; interval: number | null }) {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => { clearTimeout(timer.current); timer.current = setTimeout(() => setSearch(input.trim().slice(0, 200)), 300); return () => clearTimeout(timer.current); }, [input]);
  const [sort, setSort] = useState<Sort>(null);

  const base = useMemo<GetEmissionsRecordsParams>(() => {
    const p: GetEmissionsRecordsParams = { ...filters };
    if (search) p.search = search;
    if (sort) { p.sort = sort.key; p.direction = sort.dir; }
    return p;
  }, [filters, search, sort]);
  const baseKey = JSON.stringify(base);

  const scroller = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = 0; setScrollTop(0); }, [baseKey]);

  const [known, setKnown] = useState<{ k: string; n: number } | null>(null);
  const realH = (known?.k === baseKey ? known.n : 0) * ROW;
  const virtH = Math.min(realH, MAX_PX);
  const ratio = virtH > VIEW_H ? (realH - VIEW_H) / (virtH - VIEW_H) : 1;
  const realTop = scrollTop * ratio;
  const first = Math.max(0, Math.floor(realTop / ROW) - OVERSCAN);
  const last = Math.floor((realTop + VIEW_H) / ROW) + OVERSCAN;
  const offA = Math.floor(first / PAGE) * PAGE;
  const offB = Math.floor(last / PAGE) * PAGE;
  const pA = useMemo(() => ({ ...base, offset: offA, limit: PAGE }), [base, offA]);
  const pB = useMemo(() => ({ ...base, offset: offB, limit: PAGE }), [base, offB]);
  const opts = { enabled, gcTime: 60_000, refetchInterval: interval ?? (false as const) };
  const qa = useGetEmissionsRecords(pA, { query: { queryKey: getGetEmissionsRecordsQueryKey(pA), ...opts } });
  const qb = useGetEmissionsRecords(pB, { query: { queryKey: getGetEmissionsRecordsQueryKey(pB), ...opts, enabled: enabled && offB !== offA && known?.k === baseKey && offB < known.n } });
  const total = qa.data?.total ?? (known?.k === baseKey ? known.n : undefined);
  useEffect(() => { if (qa.data) setKnown({ k: baseKey, n: qa.data.total }); }, [qa.data, baseKey]);

  const rowAt = (i: number): EmissionsRecord | undefined => {
    const src = i >= offB && offB !== offA ? qb.data : qa.data;
    const o = i >= offB && offB !== offA ? offB : offA;
    return src?.rows[i - o];
  };
  const end = Math.min(total ?? 0, last + 1);
  const items: number[] = [];
  for (let i = first; i < end; i++) items.push(i);

  const toggleSort = (k: GetEmissionsRecordsSort) => setSort((s) => (!s || s.key !== k ? { key: k, dir: "asc" } : s.dir === "asc" ? { key: k, dir: "desc" } : null));

  const [exp, setExp] = useState<{ busy: boolean; err: string | null }>({ busy: false, err: null });
  const exportCsv = async () => {
    setExp({ busy: true, err: null });
    try {
      const url = getGetEmissionsRecordsUrl(base).replace("/records", "/export");
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "emissions-analysis-filtered.csv";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      setExp({ busy: false, err: null });
    } catch (e) {
      setExp({ busy: false, err: e instanceof Error ? e.message : "Export failed" });
    }
  };

  const error = qa.isError || qb.isError;

  return (
    <section className="panel min-w-0 rounded-[3px] bg-card" aria-label="Emissions records">
      <div className="flex flex-wrap items-center gap-2 px-2 py-1.5">
        <h2 className="text-[12px] font-semibold">Emissions records</h2>
        <span className="text-[11px] text-muted-foreground tnum" data-testid="text-record-total">
          {total == null ? "Counting rows" : `${nf(total)} row${total === 1 ? "" : "s"}`}
          {!sort && " \u00b7 Latest date, then MSN A-Z"}
        </span>
        <div className="ml-auto flex items-center gap-1.5 print:hidden">
          <label className="flex h-[26px] w-[220px] items-center gap-1.5 rounded-[3px] border border-input bg-background/40 px-2 focus-within:border-primary">
            <Search className="h-3.5 w-3.5 opacity-60" />
            <input data-testid="input-search-records" value={input} maxLength={200} onChange={(e) => setInput(e.target.value)} placeholder="Search MSN, ICAO, airline, engine" className="h-full w-full bg-transparent text-[12px] outline-none" aria-label="Search records" />
            {input && <button onClick={() => setInput("")} aria-label="Clear search" data-testid="button-clear-search"><X className="h-3.5 w-3.5" /></button>}
          </label>
          <button data-testid="button-export-records" onClick={exportCsv} disabled={exp.busy || !total} className="flex h-[26px] items-center gap-1 rounded-[4px] bg-foreground/10 px-2 text-[12px] transition-colors hover:bg-foreground/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50">
            {exp.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} {exp.busy ? "Exporting" : "Export CSV"}
          </button>
        </div>
        {exp.err && (
          <div role="alert" data-testid="status-export-error" className="flex w-full items-center gap-1.5 rounded-[3px] bg-destructive/15 px-2 py-1 text-[11px] text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" /> CSV export failed: {exp.err}
            <button onClick={exportCsv} className="ml-auto font-semibold underline">Retry</button>
            <button onClick={() => setExp({ busy: false, err: null })} aria-label="Dismiss"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}
      </div>

      <div className="thin-scroll overflow-x-auto">
        <div className="min-w-[1180px]">
          <div role="row" className="grid border-y border-foreground/30 bg-card text-[11px] font-semibold uppercase tracking-[0.02em]" style={{ gridTemplateColumns: GRID }}>
            {COLS.map((c) => {
              const on = sort?.key === c.key;
              return (
                <button key={c.key} role="columnheader" aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} data-testid={`sort-${c.key}`} onClick={() => toggleSort(c.key)}
                  className={`flex items-center gap-1 px-2 py-1.5 text-left transition-colors hover:bg-primary/10 focus-visible:bg-primary/15 focus-visible:outline-none ${c.num ? "justify-end text-right" : ""} ${on ? "text-primary" : ""}`}>
                  <span className="leading-tight">{c.label}</span>
                  {on && (sort.dir === "asc" ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ArrowDown className="h-3 w-3 shrink-0" />)}
                </button>
              );
            })}
          </div>

          {error ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <div className="text-[13px] font-semibold">Records could not be loaded</div>
              <button data-testid="button-retry-records" onClick={() => { qa.refetch(); qb.refetch(); }} className="rounded-[3px] bg-primary px-3 py-1 text-[12px] text-primary-foreground hover:opacity-90">Retry</button>
            </div>
          ) : total === 0 ? (
            <div className="py-12 text-center" data-testid="empty-records">
              <div className="text-[13px] font-semibold">No records match</div>
              <p className="mt-1 text-[11px] text-muted-foreground">{search ? `Nothing contains "${search}" under the current filters.` : "Remove a filter to see records."}</p>
              {input && <button onClick={() => setInput("")} className="mt-2 rounded-[3px] bg-primary px-3 py-1 text-[12px] text-primary-foreground">Clear search</button>}
            </div>
          ) : (
            <div ref={scroller} data-testid="table-records" onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} className="thin-scroll relative overflow-y-auto" style={{ height: VIEW_H }} tabIndex={0} aria-label="Scrollable records" role="rowgroup">
              <div style={{ height: Math.max(virtH, VIEW_H) }} />
              {total == null ? (
                <div className="absolute inset-x-0 top-0 space-y-1 p-2">{Array.from({ length: 14 }).map((_, i) => <Skeleton key={i} className="h-4" />)}</div>
              ) : items.map((i) => {
                const r = rowAt(i);
                return (
                  <div key={i} role="row" data-testid={`row-record-${i}`} className={`absolute inset-x-0 grid items-center text-[11.5px] transition-colors hover:bg-primary/12 ${i % 2 ? "bg-foreground/[0.045]" : ""}`}
                    style={{ gridTemplateColumns: GRID, height: ROW, top: scrollTop + i * ROW - realTop }}>
                    {r ? COLS.map((c) => {
                      const v = c.render(r);
                      return <div key={c.key} role="cell" title={c.num ? String((r as unknown as Record<string, unknown>)[c.key] ?? "") : v} className={`truncate px-2 ${c.num ? "text-right tnum" : ""} ${c.key === "msn" || c.key === "airline" ? "font-medium" : ""}`}>{v}</div>;
                    }) : <div className="col-span-full px-2"><Skeleton className="h-3.5" /></div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <div className="border-t border-foreground/30 px-2 py-1 text-[10.5px] text-muted-foreground">
        Continuous scroll, fetched {PAGE} rows at a time. Blank measures stay blank; reported zeros show as 0. Hover a value for full precision; CSV export keeps source precision.
      </div>
    </section>
  );
}
