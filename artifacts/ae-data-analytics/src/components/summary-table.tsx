import { useEffect, useMemo, useRef, useState } from "react";
import { useGetSummaryRecords, getGetSummaryRecordsQueryKey, getExportSummaryUrl } from "@workspace/api-client-react";
import type { GetSummaryParams, GetSummaryRecordsParams, GetSummaryRecordsSort, SummaryFleetRecord } from "@workspace/api-client-react";
import { AlertTriangle, ArrowDown, ArrowUp, Download, Loader2, Search, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { fmt2, fmtFull, fmtInt } from "@/lib/summary";

const ROW = 22;
const PAGE = 200;
const VIEW_H = 300;
const MAX_PX = 12_000_000;
const OVERSCAN = 12;
const DEFAULT_SORT = { key: "lastUpdate" as GetSummaryRecordsSort, dir: "desc" as const };

type Col = { key: GetSummaryRecordsSort; label: string; w: string; num?: boolean; render: (r: SummaryFleetRecord) => string; tip?: (r: SummaryFleetRecord) => string };
const COLS: Col[] = [
  { key: "msn", label: "MSN", w: "minmax(70px,0.6fr)", render: (r) => r.msn },
  { key: "registration", label: "Registration", w: "minmax(80px,0.7fr)", render: (r) => r.registration },
  { key: "model", label: "Aircraft Model", w: "minmax(70px,0.6fr)", render: (r) => r.model, tip: (r) => `${r.model} (${r.aircraftType})` },
  { key: "hoursLtm", label: "Total Flight Hours (LTM)", w: "minmax(100px,0.8fr)", num: true, render: (r) => fmt2(r.hoursLtm), tip: (r) => fmtFull(r.hoursLtm) },
  { key: "cyclesLtm", label: "Total Flight Cycles", w: "minmax(80px,0.7fr)", num: true, render: (r) => fmtInt(r.cyclesLtm), tip: (r) => fmtFull(r.cyclesLtm) },
  { key: "operator", label: "Airline", w: "minmax(140px,1.3fr)", render: (r) => r.operator },
  { key: "owner", label: "Owner", w: "minmax(140px,1.3fr)", render: (r) => r.owner },
  { key: "country", label: "Aircraft Register", w: "minmax(100px,0.9fr)", render: (r) => r.country },
  { key: "manufacturer", label: "Manufacturer", w: "minmax(80px,0.7fr)", render: (r) => r.manufacturer },
  { key: "engineManufacturer", label: "Engine Manufacturer", w: "minmax(120px,1fr)", render: (r) => r.engineManufacturer },
  { key: "engineFamily", label: "Engine Family", w: "minmax(80px,0.7fr)", render: (r) => r.engineFamily },
  { key: "engineModel", label: "Engine Model", w: "minmax(90px,0.8fr)", render: (r) => r.engineModel },
  { key: "lastUpdate", label: "Last Update", w: "minmax(90px,0.8fr)", render: (r) => r.lastUpdate },
];
const GRID = COLS.map((c) => c.w).join(" ");

export function SummaryTable({ filters, enabled, interval }: { filters: GetSummaryParams; enabled: boolean; interval: number | null }) {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => { clearTimeout(timer.current); timer.current = setTimeout(() => setSearch(input.trim().slice(0, 200)), 300); return () => clearTimeout(timer.current); }, [input]);
  const [sort, setSort] = useState<{ key: GetSummaryRecordsSort; dir: "asc" | "desc" }>(DEFAULT_SORT);

  const base = useMemo<GetSummaryRecordsParams>(() => {
    const p: GetSummaryRecordsParams = { ...filters, sort: sort.key, direction: sort.dir };
    if (search) p.search = search;
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
  const opts = { gcTime: 60_000, refetchInterval: interval ?? (false as const) };
  const qa = useGetSummaryRecords(pA, { query: { queryKey: getGetSummaryRecordsQueryKey(pA), ...opts, enabled } });
  const qb = useGetSummaryRecords(pB, { query: { queryKey: getGetSummaryRecordsQueryKey(pB), ...opts, enabled: enabled && offB !== offA && known?.k === baseKey && offB < known.n } });
  const total = qa.data?.total ?? (known?.k === baseKey ? known.n : undefined);
  useEffect(() => { if (qa.data) setKnown({ k: baseKey, n: qa.data.total }); }, [qa.data, baseKey]);

  const rowAt = (i: number) => {
    const useB = i >= offB && offB !== offA;
    return (useB ? qb.data : qa.data)?.rows[i - (useB ? offB : offA)];
  };
  const end = Math.min(total ?? 0, last + 1);
  const items: number[] = [];
  for (let i = first; i < end; i++) items.push(i);

  const toggleSort = (k: GetSummaryRecordsSort) =>
    setSort((s) => (s.key !== k ? { key: k, dir: "asc" } : s.dir === "asc" ? { key: k, dir: "desc" } : DEFAULT_SORT));

  const [exp, setExp] = useState<{ busy: boolean; err: string | null }>({ busy: false, err: null });
  const exportCsv = async () => {
    setExp({ busy: true, err: null });
    try {
      const res = await fetch(getExportSummaryUrl(base), { credentials: "include" });
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "summary-fleet-filtered.csv";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      setExp({ busy: false, err: null });
    } catch (e) {
      setExp({ busy: false, err: e instanceof Error ? e.message : "Export failed" });
    }
  };
  const error = qa.isError || qb.isError;

  return (
    <section className="panel min-w-0 rounded-[3px] bg-card" aria-label="Fleet records">
      <div className="flex flex-wrap items-center gap-2 px-2 py-1.5">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.04em]">Fleet records</h2>
        <span className="text-[11px] text-muted-foreground tnum" data-testid="text-record-total">
          {total == null ? "Counting aircraft" : `${total.toLocaleString("en-US")} distinct record${total === 1 ? "" : "s"}`} &middot; latest matching update per aircraft
        </span>
        <div className="ml-auto flex items-center gap-1.5 print:hidden">
          <label className="flex h-[26px] w-[230px] items-center gap-1.5 rounded-[3px] border border-input bg-background/40 px-2 focus-within:border-primary">
            <Search className="h-3.5 w-3.5 opacity-60" />
            <input data-testid="input-search-records" value={input} maxLength={200} onChange={(e) => setInput(e.target.value)} placeholder="Search table only: MSN, reg, airline" className="h-full w-full bg-transparent text-[12px] outline-none" aria-label="Search table" />
            {input && <button onClick={() => setInput("")} aria-label="Clear search" data-testid="button-clear-search"><X className="h-3.5 w-3.5" /></button>}
          </label>
          <button data-testid="button-export-records" onClick={exportCsv} disabled={exp.busy || !total} className="flex h-[26px] items-center gap-1 rounded-[4px] bg-foreground/10 px-2 text-[12px] transition-colors hover:bg-foreground/20 disabled:opacity-50">
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
        <div className="min-w-[1380px]">
          <div role="row" className="grid border-y border-foreground/30 bg-card text-[10.5px] font-semibold uppercase tracking-[0.02em]" style={{ gridTemplateColumns: GRID }}>
            {COLS.map((c) => {
              const on = sort.key === c.key;
              return (
                <button key={c.key} role="columnheader" aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} data-testid={`sort-${c.key}`} onClick={() => toggleSort(c.key)} title={`Sort by ${c.label}`}
                  className={`flex items-center gap-1 px-2 py-1.5 text-left transition-colors hover:bg-primary/10 ${c.num ? "justify-end text-right" : ""} ${on ? "text-primary" : ""}`}>
                  <span className="truncate leading-tight">{c.label}</span>
                  {on && (sort.dir === "asc" ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ArrowDown className="h-3 w-3 shrink-0" />)}
                </button>
              );
            })}
          </div>
          {error ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <div className="text-[13px] font-semibold">Fleet records could not be loaded</div>
              <button data-testid="button-retry-records" onClick={() => { qa.refetch(); qb.refetch(); }} className="rounded-[3px] bg-primary px-3 py-1 text-[12px] text-primary-foreground hover:opacity-90">Retry</button>
            </div>
          ) : total === 0 ? (
            <div className="py-12 text-center" data-testid="empty-records">
              <div className="text-[13px] font-semibold">No fleet records match</div>
              <p className="mt-1 text-[11px] text-muted-foreground">{search ? `Nothing contains "${search}" under the current filters.` : "No fleet snapshot rows match these filters. Change a filter."}</p>
              {input && <button onClick={() => setInput("")} className="mt-2 rounded-[3px] bg-primary px-3 py-1 text-[12px] text-primary-foreground">Clear search</button>}
            </div>
          ) : (
            <div ref={scroller} data-testid="table-records" onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} className="thin-scroll relative overflow-y-auto" style={{ height: VIEW_H }} tabIndex={0} aria-label="Scrollable fleet records" role="rowgroup">
              <div style={{ height: Math.max(virtH, VIEW_H) }} />
              {total == null ? (
                <div className="absolute inset-x-0 top-0 space-y-1 p-2">{Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-4" />)}</div>
              ) : items.map((i) => {
                const r = rowAt(i);
                return (
                  <div key={i} role="row" data-testid={`row-record-${i}`} className={`absolute inset-x-0 grid items-center text-[11.5px] transition-colors hover:bg-primary/12 ${i % 2 ? "bg-foreground/[0.045]" : ""}`}
                    style={{ gridTemplateColumns: GRID, height: ROW, top: scrollTop + i * ROW - realTop }}>
                    {r ? COLS.map((c) => {
                      const v = c.render(r);
                      return <div key={c.key} role="cell" title={c.tip ? c.tip(r) : v} className={`truncate px-2 ${c.num ? "text-right tnum" : ""} ${c.key === "msn" ? "font-medium" : ""}`}>{v}</div>;
                    }) : <div className="col-span-full px-2"><Skeleton className="h-3.5" /></div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <div className="border-t border-foreground/30 px-2 py-1 text-[10.5px] text-muted-foreground">
        Continuous scroll, {PAGE} rows per fetch. Identical aircraft attributes across selected months are shown once at their latest matching update; KPI totals still sum LTM source rows across months. Default order last update descending, ties by MSN. The Model (orders/deliveries) filter does not narrow this table: no verified commercial-model to fleet mapping exists. CSV covers every filtered, searched, sorted record.
      </div>
    </section>
  );
}
