import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetDeliveries, getGetDeliveriesQueryKey } from "@workspace/api-client-react";
import type { DeliveryRecord } from "@workspace/api-client-react";
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronLeft, ChevronRight, Download, Info, Moon, Printer, RefreshCw, RotateCcw, Search, Sun, X, AlertTriangle } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { MultiSelect } from "@/components/multi-select";
import { applyFilters, distinct, downloadCSV, fmtDate, fullMonth, monthly, monthRange, nf, PALETTE, rank, type Dim, type Filters } from "@/lib/deliveries";

const MODULES = ["Summary", "Deliveries", "Orders", "Aircraft Utilisation", "Aviation Finance", "Airline Financials", "Market Value / Lease Rates", "Emissions", "Aircraft Registry", "Engine Profile", "Jurisdiction Risk"];
const DEFAULT_FROM = "2016-01-01";
const DEFAULT_TO = "2026-10-31";
const INTERVALS = [
  { label: "Every 5 min", ms: 5 * 60_000 },
  { label: "Every 15 min", ms: 15 * 60_000 },
  { label: "Every 1 hour", ms: 60 * 60_000 },
  { label: "Every 24 hours", ms: 24 * 60 * 60_000 },
];
const iconBtn = "flex h-[26px] items-center justify-center gap-1 rounded-[4px] bg-foreground/10 px-2 text-[12px] text-foreground/85 transition-colors hover:bg-foreground/20 disabled:opacity-50";

export default function DeliveriesPage() {
  const qc = useQueryClient();
  const [interval, setIntervalMs] = useState<number | null>(null);
  const q = useGetDeliveries({ query: { queryKey: getGetDeliveriesQueryKey(), refetchInterval: interval ?? false } });
  const ds = q.data;
  const rows = useMemo(() => ds?.rows ?? [], [ds]);
  const [isDark, setDark] = useState(() => localStorage.getItem("ae-theme") !== "light");
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem("ae-theme", isDark ? "dark" : "light");
  }, [isDark]);

  const [f, setF] = useState<Filters | null>(null);
  const defaults = useMemo<Filters | null>(() => (ds ? { from: ds.minDate > DEFAULT_FROM ? ds.minDate : DEFAULT_FROM, to: ds.maxDate < DEFAULT_TO ? ds.maxDate : DEFAULT_TO, customer: [], region: [], model: [], manufacturer: [] } : null), [ds]);
  useEffect(() => { if (defaults && !f) setF(defaults); }, [defaults, f]);
  const filters = f ?? defaults;
  const filtered = useMemo(() => (filters ? applyFilters(rows, filters) : []), [rows, filters]);
  const set = (patch: Partial<Filters>) => filters && setF({ ...filters, ...patch });
  const toggleDim = (dim: Dim, v: string) => {
    if (!filters) return;
    const cur = filters[dim];
    set({ [dim]: cur.length === 1 && cur[0] === v ? [] : [v] } as Partial<Filters>);
  };

  const opts = useMemo(() => ({ customer: distinct(rows, "customer"), region: distinct(rows, "region"), model: distinct(rows, "model"), manufacturer: distinct(rows, "manufacturer") }), [rows]);
  const total = filtered.reduce((s, r) => s + r.quantity, 0);
  const nModels = new Set(filtered.map((r) => r.model)).size;
  const nCust = new Set(filtered.map((r) => r.customer)).size;

  const active = filters && defaults ? ([
    ...(filters.from !== defaults.from || filters.to !== defaults.to ? [{ k: "date", label: `${fmtDate(filters.from)} - ${fmtDate(filters.to)}`, clear: () => set({ from: defaults.from, to: defaults.to }) }] : []),
    ...(["customer", "region", "model", "manufacturer"] as Dim[]).flatMap((d) => filters[d].map((v) => ({ k: `${d}-${v}`, label: `${d}: ${v}`, clear: () => set({ [d]: filters[d].filter((x) => x !== v) } as Partial<Filters>) }))),
  ]) : [];

  const [spin, setSpin] = useState(false);
  useEffect(() => {
    if (q.isFetching) { setSpin(true); return undefined; }
    else { const t = setTimeout(() => setSpin(false), 600); return () => clearTimeout(t); }
  }, [q.isFetching]);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const [disc, setDisc] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: getGetDeliveriesQueryKey() });
  const last = q.dataUpdatedAt ? new Date(q.dataUpdatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      {/* Module nav */}
      <nav className="thin-scroll flex overflow-x-auto border-b border-border bg-sidebar print:hidden" aria-label="Modules">
        {MODULES.map((m) =>
          m === "Deliveries" ? (
            <div key={m} data-testid="nav-deliveries" className="relative flex min-w-[110px] flex-1 items-center justify-center bg-primary px-3 py-2.5 text-center text-[13px] font-semibold text-primary-foreground" style={{ clipPath: "polygon(6px 0, calc(100% - 6px) 0, 100% 100%, 0 100%)" }}>{m}</div>
          ) : (
            <Tooltip key={m}>
              <TooltipTrigger asChild>
                <button aria-disabled data-testid={`nav-${m.toLowerCase().replace(/[^a-z]+/g, "-")}`} className="flex min-w-[110px] flex-1 cursor-not-allowed items-center justify-center border-r border-border/60 px-3 py-2.5 text-center text-[13px] font-medium leading-tight text-sidebar-foreground/55 transition-colors hover:text-sidebar-foreground/75">{m}</button>
              </TooltipTrigger>
              <TooltipContent>Not yet available</TooltipContent>
            </Tooltip>
          ),
        )}
      </nav>

      <div className="flex flex-col lg:flex-row">
        {/* Left filters */}
        <aside className="flex w-full shrink-0 flex-col gap-3 border-b border-border bg-sidebar/60 p-3 lg:min-h-[calc(100dvh-44px)] lg:w-[190px] lg:border-b-0 lg:border-r">
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Date range</div>
            {filters ? (
              <div className="grid grid-cols-2 gap-1 lg:grid-cols-1">
                <input data-testid="input-date-from" type="date" value={filters.from} min={ds?.minDate} max={filters.to} onChange={(e) => e.target.value && set({ from: e.target.value })} className="h-7 rounded-[3px] border border-input bg-card px-1.5 text-[12px] tnum" />
                <input data-testid="input-date-to" type="date" value={filters.to} min={filters.from} max={ds?.maxDate} onChange={(e) => e.target.value && set({ to: e.target.value })} className="h-7 rounded-[3px] border border-input bg-card px-1.5 text-[12px] tnum" />
              </div>
            ) : <Skeleton className="h-14" />}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-1">
            {filters ? (["customer", "region", "model", "manufacturer"] as Dim[]).map((d) => (
              <MultiSelect key={d} id={d} label={d} options={opts[d]} value={filters[d]} onChange={(v) => set({ [d]: v } as Partial<Filters>)} />
            )) : [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-11" />)}
          </div>
          <button data-testid="button-clear-filters" disabled={!active.length} onClick={() => defaults && setF(defaults)} className="flex h-7 items-center justify-center gap-1.5 rounded-[3px] border border-border bg-card text-[12px] font-medium transition-colors hover:border-primary disabled:opacity-50 print:hidden">
            <RotateCcw className="h-3 w-3" /> Clear All Filters
          </button>
          <div className="mt-auto hidden space-y-3 pt-6 lg:block">
            <div className="text-[13px] font-semibold tracking-wide">AIRLINE ECONOMICS<span className="text-primary">+</span></div>
            <button data-testid="button-disclaimer" onClick={() => setDisc(true)} className="flex items-center gap-2 text-[12px] font-medium hover:text-primary print:hidden">
              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-foreground/60"><Info className="h-3.5 w-3.5" /></span> Disclaimer
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-2 p-2 sm:p-3">
          {/* Header row */}
          <div className="flex flex-wrap items-start gap-2">
            <div className="mr-auto">
              <h1 className="text-[15px] font-semibold leading-tight">AE<span className="text-primary">+</span> Data Analytics <span className="font-normal text-muted-foreground">/ Deliveries</span></h1>
              <p className="text-[11px] text-muted-foreground">
                {ds ? <>Source: {ds.source} &middot; {ds.sheet} &middot; dataset {fmtDate(ds.minDate)} - {fmtDate(ds.maxDate)} &middot; viewing {filters ? `${fmtDate(filters.from)} - ${fmtDate(filters.to)}` : ""}</> : "Loading workbook snapshot"}
                {last && <> &middot; Last refresh {last}</>}
              </p>
            </div>
            <div className="flex items-center gap-1.5 print:hidden">
              <div className="relative" ref={menuRef}>
                <div className="flex h-[26px] items-center overflow-hidden rounded-[4px] bg-foreground/10 text-[12px]">
                  <button data-testid="button-refresh" onClick={refresh} disabled={q.isFetching} className="flex h-full items-center gap-1 px-2 hover:bg-foreground/10 disabled:opacity-50">
                    <RefreshCw className={`h-3.5 w-3.5 ${spin ? "animate-spin" : ""}`} /> Refresh
                  </button>
                  <div className="h-4 w-px bg-foreground/20" />
                  <button data-testid="button-auto-refresh" onClick={() => setMenu((o) => !o)} className="flex h-full items-center gap-1 px-1.5 hover:bg-foreground/10">
                    {interval && <span className="text-[10px] text-primary">AUTO</span>}<ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                {menu && (
                  <div className="absolute right-0 z-50 mt-1 w-48 rounded-[4px] border border-border bg-popover p-1 text-[12px] shadow-lg">
                    <button onClick={() => setIntervalMs(interval ? null : INTERVALS[0].ms)} className="flex w-full items-center justify-between rounded-[3px] px-2 py-1.5 hover:bg-accent">
                      Auto refresh
                      <span className={`relative h-4 w-7 rounded-full transition-colors ${interval ? "bg-primary" : "bg-foreground/25"}`}><span className={`absolute top-0.5 h-3 w-3 rounded-full bg-background transition-transform ${interval ? "translate-x-3.5" : "translate-x-0.5"}`} /></span>
                    </button>
                    <div className="my-1 h-px bg-border" />
                    {INTERVALS.map((o) => (
                      <button key={o.ms} onClick={() => { setIntervalMs(o.ms); setMenu(false); }} className="flex w-full items-center justify-between rounded-[3px] px-2 py-1.5 hover:bg-accent">
                        {o.label}{interval === o.ms && <Check className="h-3.5 w-3.5 text-primary" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button data-testid="button-print" onClick={() => window.print()} className={iconBtn} aria-label="Print or save as PDF"><Printer className="h-3.5 w-3.5" /></button>
              <button data-testid="button-theme" onClick={() => setDark((d) => !d)} className={iconBtn} aria-label="Toggle theme">{isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}</button>
              <button onClick={() => setDisc(true)} className={`${iconBtn} lg:hidden`} aria-label="Disclaimer"><Info className="h-3.5 w-3.5" /></button>
            </div>
          </div>

          {active.length > 0 && (
            <div className="flex flex-wrap items-center gap-1" data-testid="active-filters">
              {active.map((a) => (
                <button key={a.k} onClick={a.clear} className="group flex items-center gap-1 rounded-[3px] bg-primary/15 px-1.5 py-0.5 text-[11px] text-foreground transition-colors hover:bg-primary/30">
                  <span className="capitalize">{a.label}</span><X className="h-3 w-3 opacity-60 group-hover:opacity-100" />
                </button>
              ))}
            </div>
          )}

          {q.isError ? (
            <div className="panel flex flex-col items-center justify-center gap-3 rounded-[3px] border border-border bg-card px-6 py-16 text-center">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              <div className="text-[14px] font-semibold">The delivery workbook could not be loaded</div>
              <p className="max-w-md text-[12px] text-muted-foreground">The server did not return the OD_DELIVERIES dataset. Check the API service, then retry.</p>
              <button data-testid="button-retry" onClick={() => q.refetch()} className="rounded-[3px] bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:opacity-90">Retry</button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 sm:max-w-[560px]">
                {[["Total Deliveries", total, "kpi-total"], ["Models", nModels, "kpi-models"], ["Customers", nCust, "kpi-customers"]].map(([l, v, id]) => (
                  <div key={id as string} className="panel rounded-[3px] bg-card px-3 py-2">
                    {q.isLoading ? <Skeleton className="h-6 w-16" /> : <div data-testid={id as string} className="text-[20px] font-semibold leading-tight tnum">{nf(v as number)}</div>}
                    <div className="text-[11px] text-muted-foreground">{l}</div>
                  </div>
                ))}
              </div>

              {!q.isLoading && filtered.length === 0 ? (
                <div className="panel rounded-[3px] border border-dashed border-border bg-card px-6 py-14 text-center">
                  <div className="text-[14px] font-semibold">No deliveries match these filters</div>
                  <p className="mt-1 text-[12px] text-muted-foreground">{rows.length ? "Widen the date range or remove a filter." : "The dataset returned no rows."}</p>
                  {active.length > 0 && <button onClick={() => defaults && setF(defaults)} className="mt-3 rounded-[3px] bg-primary px-3 py-1.5 text-[12px] text-primary-foreground">Clear all filters</button>}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-2 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
                    <DeliveryTable rows={filtered} loading={q.isLoading} />
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {(["customer", "model", "region"] as Dim[]).map((d) => (
                        <Ranking key={d} dim={d} rows={filtered} loading={q.isLoading} selected={filters?.[d] ?? []} onPick={(v) => toggleDim(d, v)} />
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
                    <TrendChart title="Quantity by Date of Delivery and Model" dim="model" kind="line" rows={filtered} filters={filters} loading={q.isLoading} isDark={isDark} />
                    <TrendChart title="Quantity by Date of Delivery and Region" dim="region" kind="bar" rows={filtered} filters={filters} loading={q.isLoading} isDark={isDark} />
                  </div>
                </>
              )}
            </>
          )}
          <div className="pt-1 text-[11px] text-muted-foreground lg:hidden">AIRLINE ECONOMICS<span className="text-primary">+</span></div>
        </main>
      </div>

      <Dialog open={disc} onOpenChange={setDisc}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Disclaimer</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-[13px] leading-relaxed">
                <p>This dashboard displays an imported snapshot of a workbook{ds ? ` (${ds.source}, sheet ${ds.sheet})` : ""}. It is not a live data feed and may not reflect the latest aircraft deliveries.</p>
                <p>Figures are aggregated directly from the imported rows and may contain errors or omissions from the source file.</p>
                <p>The information is provided for general analysis only and does not constitute financial, investment or legal advice.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PanelHead({ title, onCsv, children }: { title: string; onCsv?: () => void; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-2 pb-1 pt-1.5">
      <h2 className="mr-auto text-[12px] font-semibold">{title}</h2>
      {children}
      {onCsv && (
        <button onClick={onCsv} data-testid={`csv-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`} aria-label={`Download ${title} as CSV`} className="flex h-[22px] w-[22px] items-center justify-center rounded-[3px] bg-foreground/10 text-foreground/80 transition-colors hover:bg-foreground/20 print:hidden">
          <Download className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

type SortKey = keyof DeliveryRecord;
const COLS: { k: SortKey; l: string; num?: boolean }[] = [
  { k: "customer", l: "Customer" }, { k: "model", l: "Model" }, { k: "quantity", l: "Quantity", num: true }, { k: "date", l: "Date" },
  { k: "manufacturer", l: "Manufacturer" }, { k: "engine", l: "Engine" }, { k: "region", l: "Region" },
];

function DeliveryTable({ rows, loading }: { rows: DeliveryRecord[]; loading: boolean }) {
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: "date", dir: -1 });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const size = 15;
  const view = useMemo(() => {
    const s = search.trim().toLowerCase();
    const r = s ? rows.filter((x) => `${x.customer} ${x.model} ${x.manufacturer} ${x.engine} ${x.region} ${x.country} ${x.date}`.toLowerCase().includes(s)) : rows.slice();
    return r.sort((a, b) => {
      const av = a[sort.k], bv = b[sort.k];
      const c = typeof av === "number" ? av - (bv as number) : String(av).localeCompare(String(bv));
      return (c || b.id - a.id) * sort.dir;
    });
  }, [rows, search, sort]);
  useEffect(() => setPage(0), [rows, search, sort]);
  const pages = Math.max(1, Math.ceil(view.length / size));
  const slice = view.slice(page * size, page * size + size);
  return (
    <section className="panel flex min-w-0 flex-col rounded-[3px] bg-card">
      <PanelHead title="Deliveries" onCsv={() => downloadCSV("deliveries-filtered.csv", view.map((r) => ({ customer: r.customer, country: r.country, region: r.region, model: r.model, engine: r.engine, manufacturer: r.manufacturer, date: r.date, quantity: r.quantity })))}>
        <div className="flex h-[22px] items-center gap-1 rounded-[3px] border border-input px-1.5 print:hidden">
          <Search className="h-3 w-3 opacity-60" />
          <input data-testid="input-table-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search rows" className="w-28 bg-transparent text-[11px] outline-none sm:w-40" />
        </div>
      </PanelHead>
      <div className="thin-scroll overflow-x-auto">
        <table className="w-full min-w-[640px] text-[11.5px]">
          <thead>
            <tr className="border-b border-foreground/30">
              {COLS.map((c) => (
                <th key={c.k} className={`whitespace-nowrap px-2 py-1 font-semibold ${c.num ? "text-right" : "text-left"}`}>
                  <button data-testid={`sort-${c.k}`} onClick={() => setSort((s) => ({ k: c.k, dir: s.k === c.k ? (s.dir === 1 ? -1 : 1) : c.num || c.k === "date" ? -1 : 1 }))} className="inline-flex items-center gap-0.5 hover:text-primary">
                    {c.l}{sort.k === c.k && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? Array.from({ length: 10 }).map((_, i) => (
              <tr key={i}><td colSpan={7} className="px-2 py-1"><Skeleton className="h-4" /></td></tr>
            )) : slice.length === 0 ? (
              <tr><td colSpan={7} className="px-2 py-8 text-center text-muted-foreground">No rows match "{search}"</td></tr>
            ) : slice.map((r) => (
              <tr key={r.id} data-testid={`row-delivery-${r.id}`} className="border-b border-border/40 transition-colors hover:bg-primary/10">
                <td className="max-w-[260px] px-2 py-[3px] font-medium uppercase">{r.customer}</td>
                <td className="whitespace-nowrap px-2 py-[3px]">{r.model}</td>
                <td className="px-2 py-[3px] text-right tnum">{r.quantity}</td>
                <td className="whitespace-nowrap px-2 py-[3px] tnum">{fmtDate(r.date)}</td>
                <td className="px-2 py-[3px] uppercase">{r.manufacturer}</td>
                <td className="px-2 py-[3px]">{r.engine}</td>
                <td className="whitespace-nowrap px-2 py-[3px]">{r.region}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-auto flex items-center justify-between px-2 py-1.5 text-[11px] text-muted-foreground print:hidden">
        <span className="tnum">{view.length ? `${nf(page * size + 1)}-${nf(Math.min(view.length, (page + 1) * size))} of ${nf(view.length)} rows` : "0 rows"}</span>
        <div className="flex items-center gap-1">
          <button data-testid="button-prev-page" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="rounded-[3px] p-0.5 hover:bg-foreground/10 disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /></button>
          <span className="tnum">{page + 1} / {pages}</span>
          <button data-testid="button-next-page" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} className="rounded-[3px] p-0.5 hover:bg-foreground/10 disabled:opacity-40"><ChevronRight className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    </section>
  );
}

function Ranking({ dim, rows, loading, selected, onPick }: { dim: Dim; rows: DeliveryRecord[]; loading: boolean; selected: string[]; onPick: (v: string) => void }) {
  const data = useMemo(() => rank(rows, dim), [rows, dim]);
  const max = data[0]?.value ?? 1;
  const total = data.reduce((s, d) => s + d.value, 0);
  const label = dim[0].toUpperCase() + dim.slice(1);
  return (
    <section className="panel flex min-w-0 flex-col rounded-[3px] bg-card">
      <PanelHead title={`${label}`} onCsv={() => downloadCSV(`deliveries-by-${dim}.csv`, data.map((d) => ({ [dim]: d.name, total_deliveries: d.value })))} />
      <div className="flex justify-between border-b border-foreground/30 px-2 pb-1 text-[11px] font-semibold"><span>{label}</span><span>Total Deliveries</span></div>
      <div className="thin-scroll max-h-[328px] flex-1 overflow-y-auto">
        {loading ? Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="mx-2 my-1 h-3.5" />) : data.map((d) => {
          const on = selected.includes(d.name);
          return (
            <button key={d.name} data-testid={`rank-${dim}-${d.name}`} onClick={() => onPick(d.name)} title={`${d.name}: ${nf(d.value)}`}
              className={`grid w-full grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] items-center gap-1 px-2 py-[2.5px] text-left text-[11px] transition-colors hover:bg-primary/10 ${on ? "bg-primary/20" : selected.length ? "opacity-60" : ""}`}>
              <span className="truncate font-medium uppercase">{d.name}</span>
              <span className="relative h-[13px]">
                <span className="absolute inset-y-0 left-0 rounded-[1px] bg-[#1d5fd6] transition-[width] duration-300" style={{ width: `${Math.max(2, (d.value / max) * 100)}%` }} />
                <span className="relative block pr-1 text-right tnum">{nf(d.value)}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex justify-between border-t border-foreground/30 px-2 py-1 text-[11px] font-semibold tnum"><span>Total ({nf(data.length)})</span><span>{nf(total)}</span></div>
    </section>
  );
}

function ChartTip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const items = payload.filter((p) => p.value > 0).sort((a, b) => b.value - a.value);
  const sum = payload.reduce((s, p) => s + p.value, 0);
  return (
    <div className="max-w-[240px] rounded-[4px] border border-[#d5dde6] bg-[#fbfcfd] px-3 py-2 text-[12px] text-[#13293d]">
      <div className="mb-1 flex justify-between gap-4 font-semibold"><span>{label ? fullMonth(label) : ""}</span><span className="tnum">{nf(sum)}</span></div>
      {items.length === 0 && <div className="text-[#5b6b7b]">No deliveries</div>}
      {items.slice(0, 14).map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-[1px]" style={{ background: p.color }} />
          <span className="truncate">{p.name}</span><span className="ml-auto font-semibold tnum">{nf(p.value)}</span>
        </div>
      ))}
      {items.length > 14 && <div className="mt-0.5 text-[#5b6b7b]">+{items.length - 14} more series</div>}
    </div>
  );
}

function TrendChart({ title, dim, kind, rows, filters, loading, isDark }: { title: string; dim: Dim; kind: "line" | "bar"; rows: DeliveryRecord[]; filters: Filters | null; loading: boolean; isDark: boolean }) {
  const months = useMemo(() => (filters ? monthRange(filters.from, filters.to) : []), [filters]);
  const { keys, data } = useMemo(() => monthly(rows, dim, months), [rows, dim, months]);
  const color = useMemo(() => {
    const all = [...keys].sort();
    return (k: string) => PALETTE[all.indexOf(k) % PALETTE.length];
  }, [keys]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const visible = keys.filter((k) => !hidden.has(k));
  const grid = isDark ? "rgba(255,255,255,0.08)" : "#dfe5eb";
  const tick = isDark ? "#9fb3c4" : "#5b6b7b";
  const toggle = (k: string) => setHidden((h) => { const n = new Set(h); n.has(k) ? n.delete(k) : n.add(k); return n; });
  return (
    <section className="panel min-w-0 rounded-[3px] bg-card">
      <PanelHead title={title} onCsv={() => downloadCSV(`${title.toLowerCase().replace(/[^a-z]+/g, "-")}.csv`, data)}>
        <span className="text-[10px] text-muted-foreground tnum">{visible.length}/{keys.length} series</span>
        <button onClick={() => setHidden(new Set())} className="text-[10px] text-primary hover:underline print:hidden">All</button>
        <button onClick={() => setHidden(new Set(keys))} className="text-[10px] text-primary hover:underline print:hidden">None</button>
        {keys.length > 10 && <button onClick={() => setHidden(new Set(keys.slice(10)))} className="text-[10px] text-primary hover:underline print:hidden">Top 10</button>}
      </PanelHead>
      <div className="thin-scroll flex max-h-[62px] flex-wrap gap-x-2 gap-y-0.5 overflow-y-auto px-2 pb-1 text-[10.5px]">
        <span className="font-semibold capitalize">{dim}</span>
        {keys.map((k) => (
          <button key={k} data-testid={`legend-${dim}-${k}`} onClick={() => toggle(k)} className={`flex items-center gap-1 transition-opacity hover:opacity-100 ${hidden.has(k) ? "opacity-35 line-through" : ""}`}>
            <span className="h-2 w-2 rounded-full" style={{ background: color(k) }} />{k}
          </button>
        ))}
      </div>
      {loading ? <Skeleton className="m-2 h-[260px]" /> : (
        <div className="h-[280px] px-1 pb-2">
          <ResponsiveContainer width="100%" height="100%" debounce={0}>
            {kind === "line" ? (
              <LineChart data={data} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: tick }} stroke={tick} tickFormatter={(m: string) => m.slice(0, 4)} minTickGap={28} />
                <YAxis tick={{ fontSize: 11, fill: tick }} stroke={tick} allowDecimals={false} />
                <RTooltip content={<ChartTip />} isAnimationActive={false} cursor={{ stroke: tick, strokeDasharray: "3 3" }} />
                {visible.map((k) => <Line key={k} dataKey={k} name={k} stroke={color(k)} strokeWidth={1.4} dot={false} isAnimationActive={false} />)}
              </LineChart>
            ) : (
              <BarChart data={data} margin={{ top: 6, right: 10, left: -18, bottom: 0 }} barGap={0} barCategoryGap="10%">
                <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: tick }} stroke={tick} tickFormatter={(m: string) => m.slice(0, 4)} minTickGap={28} />
                <YAxis tick={{ fontSize: 11, fill: tick }} stroke={tick} allowDecimals={false} />
                <RTooltip content={<ChartTip />} isAnimationActive={false} cursor={{ fill: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)" }} />
                {visible.map((k) => <Bar key={k} dataKey={k} name={k} fill={color(k)} fillOpacity={0.9} isAnimationActive={false} />)}
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
