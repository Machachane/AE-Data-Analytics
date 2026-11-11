import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useGetUtilisation, getGetUtilisationQueryKey, useGetUtilisationOptions, getGetUtilisationOptionsQueryKey } from "@workspace/api-client-react";
import type { GetUtilisationParams, UtilisationAnalysis, UtilisationDashboard, UtilisationRank } from "@workspace/api-client-react";
import { AlertTriangle, ArrowDown, ArrowUp, Check, ChevronDown, Download, Info, Moon, Printer, RefreshCw, RotateCcw, Search, Sun, X } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { SingleSelect } from "@/components/single-select";
import { downloadCSV, fmtDate, fullMonth, monthRange, nf } from "@/lib/deliveries";

const MODULES = ["Summary", "Deliveries", "Orders", "Aircraft Utilisation", "Aviation Finance", "Airline Financials", "Market Value / Lease Rates", "Emissions", "Aircraft Registry", "Engine Profile", "Jurisdiction Risk"];
const NAV: Record<string, string> = { Deliveries: "/deliveries", Orders: "/orders", "Aviation Finance": "/aviation-finance", "Market Value / Lease Rates": "/market-value-lease-rates", Emissions: "/emissions" };
const INTERVALS = [
  { label: "Every 5 min", ms: 5 * 60_000 },
  { label: "Every 15 min", ms: 15 * 60_000 },
  { label: "Every 1 hour", ms: 60 * 60_000 },
  { label: "Every 24 hours", ms: 24 * 60 * 60_000 },
];
const iconBtn = "flex h-[26px] items-center justify-center gap-1 rounded-[4px] bg-foreground/10 px-2 text-[12px] text-foreground/85 transition-colors hover:bg-foreground/20 disabled:opacity-50";
const TOP5 = ["#4f8ff7", "#c084fc", "#e2558f", "#2dd4bf", "#f2cb48"];

/** Display aliases for ICAO type codes. Query values always use the source code. */
const MODEL_LABEL: Record<string, string> = {
  B738: "B737-800", A320: "A320ceo", B38M: "B737-8", A21N: "A321neo", A20N: "A320neo", A321: "A321ceo",
  B77W: "B777-300ER", B789: "B787-9", E75L: "E175", A359: "A350-900", A319: "A319ceo", A333: "A330-300",
  B739: "B737-900", B39M: "B737-9", B788: "B787-8", B78X: "B787-10", A332: "A330-200", A339: "A330-900", AT76: "ATR 72-600", DH8D: "Dash 8-400", BCS3: "A220-300", BCS1: "A220-100",
};
const modelLabel = (c: string) => MODEL_LABEL[c] ?? c;

type Dim = "airline" | "model" | "manufacturer" | "msn" | "engine";
type F = { from: string; to: string } & Record<Dim, string>;
const DIMS: Dim[] = ["airline", "model", "manufacturer", "msn"];
const f2 = (n: number | null | undefined) => (n == null ? "-" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const compact = (n: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export default function UtilisationPage() {
  const qc = useQueryClient();
  const [interval, setIntervalMs] = useState<number | null>(null);
  const oq = useGetUtilisationOptions({ query: { queryKey: getGetUtilisationOptionsQueryKey() } });
  const options = oq.data;
  const defaults = useMemo<F | null>(() => (options ? { from: options.minDate, to: options.maxDate, airline: "", model: "", manufacturer: "", msn: "", engine: "" } : null), [options]);
  const [fs, setF] = useState<F | null>(null);
  const filters = fs ?? defaults;
  const set = (p: Partial<F>) => filters && setF({ ...filters, ...p });
  const params = useMemo<GetUtilisationParams | undefined>(() => {
    if (!filters) return undefined;
    const p: GetUtilisationParams = { from: filters.from, to: filters.to };
    for (const d of [...DIMS, "engine"] as Dim[]) if (filters[d]) p[d] = filters[d];
    return p;
  }, [filters]);
  const q = useGetUtilisation(params, { query: { queryKey: getGetUtilisationQueryKey(params), enabled: !!options, refetchInterval: interval ?? false, placeholderData: (prev) => prev } });
  const data = q.data;
  const loading = !data;

  useEffect(() => {
    document.title = "Aircraft Utilisation | AE+ Data Analytics";
    let m = document.querySelector('meta[name="description"]');
    if (!m) { m = document.createElement("meta"); m.setAttribute("name", "description"); document.head.appendChild(m); }
    m.setAttribute("content", "Fleet flight hours, cycles and utilisation by aircraft type, engine, airline, MSN and manufacturer.");
  }, []);
  const [isDark, setDark] = useState(() => localStorage.getItem("ae-theme") !== "light");
  useEffect(() => { document.documentElement.classList.toggle("dark", isDark); localStorage.setItem("ae-theme", isDark ? "dark" : "light"); }, [isDark]);

  const [spin, setSpin] = useState(false);
  const fetching = q.isFetching || oq.isFetching;
  useEffect(() => { if (fetching) { setSpin(true); return undefined; } const t = setTimeout(() => setSpin(false), 600); return () => clearTimeout(t); }, [fetching]);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);
  const [disc, setDisc] = useState(false);
  const [analysis, setAnalysis] = useState(false);
  const refresh = () => { qc.invalidateQueries({ queryKey: getGetUtilisationOptionsQueryKey() }); qc.invalidateQueries({ queryKey: ["/api/utilisation"] }); };
  const last = q.dataUpdatedAt ? new Date(q.dataUpdatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;

  const disp = (d: Dim, v: string) => (v === "" ? "(Blank)" : d === "model" ? `${modelLabel(v)}${modelLabel(v) !== v ? ` (${v})` : ""}` : v);
  const active = filters && defaults ? [
    ...(filters.from !== defaults.from || filters.to !== defaults.to ? [{ k: "date", label: `${fmtDate(filters.from)} - ${fmtDate(filters.to)}`, clear: () => set({ from: defaults.from, to: defaults.to }) }] : []),
    ...([...DIMS, "engine"] as Dim[]).filter((d) => filters[d]).map((d) => ({ k: d, label: `${d === "msn" ? "MSN" : d}: ${disp(d, filters[d])}`, clear: () => set({ [d]: "" }) })),
  ] : [];
  const pick = (d: Dim, v: string) => filters && set({ [d]: filters[d] === v ? "" : v });
  const optList: Record<Dim, string[]> = { airline: options?.airlines ?? [], model: options?.models ?? [], manufacturer: options?.manufacturers ?? [], msn: options?.msns ?? [], engine: options?.engines ?? [] };
  const k = data?.kpis;
  const KPIS: [string, string, string][] = [
    ["Total Airlines", k ? nf(k.airlines) : "", "kpi-airlines"],
    ["Total Models", k ? nf(k.models) : "", "kpi-models"],
    ["Total Aircraft", k ? nf(k.aircraft) : "", "kpi-aircraft"],
    ["Avg Monthly Flight Hours", k ? f2(k.avgMonthlyHours) : "", "kpi-hours"],
    ["Avg Monthly Flight Cycle", k ? f2(k.avgMonthlyCycles) : "", "kpi-cycles"],
    ["Avg FH/FC Ratio (LTT)", k ? f2(k.avgRatio) : "", "kpi-ratio"],
  ];
  const error = oq.isError || q.isError;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <nav className="thin-scroll flex overflow-x-auto border-b border-border bg-sidebar print:hidden" aria-label="Modules">
        {MODULES.map((m) => m === "Aircraft Utilisation" ? (
          <div key={m} data-testid="nav-aircraft-utilisation" className="relative flex min-w-[110px] flex-1 items-center justify-center bg-primary px-3 py-2.5 text-center text-[13px] font-semibold text-primary-foreground" style={{ clipPath: "polygon(6px 0, calc(100% - 6px) 0, 100% 100%, 0 100%)" }}>{m}</div>
        ) : NAV[m] ? (
          <Link key={m} href={NAV[m]} data-testid={`nav-${m.toLowerCase()}`} className="flex min-w-[110px] flex-1 items-center justify-center border-r border-border/60 px-3 py-2.5 text-center text-[13px] font-medium leading-tight text-sidebar-foreground transition-colors hover:bg-primary/20">{m}</Link>
        ) : (
          <Tooltip key={m}>
            <TooltipTrigger asChild>
              <button aria-disabled data-testid={`nav-${m.toLowerCase().replace(/[^a-z]+/g, "-")}`} className="flex min-w-[110px] flex-1 cursor-not-allowed items-center justify-center border-r border-border/60 px-3 py-2.5 text-center text-[13px] font-medium leading-tight text-sidebar-foreground/55 hover:text-sidebar-foreground/75">{m}</button>
            </TooltipTrigger>
            <TooltipContent>Not yet available</TooltipContent>
          </Tooltip>
        ))}
      </nav>

      <div className="flex flex-col lg:flex-row">
        <aside className="flex w-full shrink-0 flex-col gap-3 border-b border-border bg-sidebar/60 p-3 lg:min-h-[calc(100dvh-44px)] lg:w-[190px] lg:border-b-0 lg:border-r">
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Date range</div>
            {filters ? (
              <div className="grid grid-cols-2 gap-1 lg:grid-cols-1">
                <input data-testid="input-date-from" type="date" value={filters.from} min={options?.minDate} max={filters.to} onChange={(e) => e.target.value && set({ from: e.target.value })} className="h-7 rounded-[3px] border border-input bg-card px-1.5 text-[12px] tnum" />
                <input data-testid="input-date-to" type="date" value={filters.to} min={filters.from} max={options?.maxDate} onChange={(e) => e.target.value && set({ to: e.target.value })} className="h-7 rounded-[3px] border border-input bg-card px-1.5 text-[12px] tnum" />
              </div>
            ) : <Skeleton className="h-14" />}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-1">
            {filters ? DIMS.map((d) => (
              <SingleSelect key={d} id={d} label={d === "msn" ? "MSN" : d} options={optList[d]} value={filters[d]} onChange={(v) => set({ [d]: v })} display={d === "model" ? modelLabel : undefined} />
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
          <div className="flex flex-wrap items-start gap-2">
            <div className="mr-auto min-w-0">
              <h1 className="text-[15px] font-semibold leading-tight">AE<span className="text-primary">+</span> Data Analytics <span className="font-normal text-muted-foreground">/ Aircraft Utilisation</span></h1>
              <p className="text-[11px] text-muted-foreground">
                {options ? <>Source: {options.source} &middot; {nf(options.rowCount)} rows &middot; dataset {fmtDate(options.minDate)} - {fmtDate(options.maxDate)}{filters && <> &middot; viewing {fmtDate(filters.from)} - {fmtDate(filters.to)}</>}</> : "Loading registry snapshot"}
                {last && <> &middot; Last refresh {last}</>}
                {data && data.negativeHoursCount > 0 && (
                  <Tooltip><TooltipTrigger asChild><span data-testid="status-negative-hours" className="ml-1.5 inline-flex cursor-help items-center gap-0.5 rounded-[3px] bg-amber-500/15 px-1 text-amber-600 dark:text-amber-300"><AlertTriangle className="h-3 w-3" /> Data quality</span></TooltipTrigger>
                    <TooltipContent className="max-w-xs">Source includes negative monthly adjustments ({nf(data.negativeHoursCount)} records in view). They are shown as reported, not corrected.{data.missingMsnCount > 0 ? ` ${nf(data.missingMsnCount)} records have a blank MSN.` : ""}</TooltipContent></Tooltip>
                )}
              </p>
            </div>
            <div className="flex items-center gap-1.5 print:hidden">
              <div className="relative" ref={menuRef}>
                <div className="flex h-[26px] items-center overflow-hidden rounded-[4px] bg-foreground/10 text-[12px]">
                  <button data-testid="button-refresh" onClick={refresh} disabled={fetching} className="flex h-full items-center gap-1 px-2 hover:bg-foreground/10 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${spin ? "animate-spin" : ""}`} /> Refresh</button>
                  <div className="h-4 w-px bg-foreground/20" />
                  <button data-testid="button-auto-refresh" onClick={() => setMenu((o) => !o)} className="flex h-full items-center gap-1 px-1.5 hover:bg-foreground/10">{interval && <span className="text-[10px] text-primary">AUTO</span>}<ChevronDown className="h-3.5 w-3.5" /></button>
                </div>
                {menu && (
                  <div className="absolute right-0 z-50 mt-1 w-48 rounded-[4px] border border-border bg-popover p-1 text-[12px] shadow-lg">
                    <button onClick={() => setIntervalMs(interval ? null : INTERVALS[0].ms)} className="flex w-full items-center justify-between rounded-[3px] px-2 py-1.5 hover:bg-accent">
                      Auto refresh
                      <span className={`relative h-4 w-7 rounded-full transition-colors ${interval ? "bg-primary" : "bg-foreground/25"}`}><span className={`absolute top-0.5 h-3 w-3 rounded-full bg-background transition-transform ${interval ? "translate-x-3.5" : "translate-x-0.5"}`} /></span>
                    </button>
                    <div className="my-1 h-px bg-border" />
                    {INTERVALS.map((o) => (
                      <button key={o.ms} onClick={() => { setIntervalMs(o.ms); setMenu(false); }} className="flex w-full items-center justify-between rounded-[3px] px-2 py-1.5 hover:bg-accent">{o.label}{interval === o.ms && <Check className="h-3.5 w-3.5 text-primary" />}</button>
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
                <button key={a.k} data-testid={`chip-${a.k}`} onClick={a.clear} className="group flex items-center gap-1 rounded-[3px] bg-primary/15 px-1.5 py-0.5 text-[11px] transition-colors hover:bg-primary/30">
                  <span className="capitalize">{a.label}</span><X className="h-3 w-3 opacity-60 group-hover:opacity-100" />
                </button>
              ))}
            </div>
          )}

          {error ? (
            <div className="panel flex flex-col items-center justify-center gap-3 rounded-[3px] border border-border bg-card px-6 py-16 text-center">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              <div className="text-[14px] font-semibold">Utilisation data could not be loaded</div>
              <p className="max-w-md text-[12px] text-muted-foreground">The server did not return the aircraft registry fleet aggregates. Check the API service, then retry.</p>
              <button data-testid="button-retry" onClick={() => { oq.refetch(); q.refetch(); }} className="rounded-[3px] bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:opacity-90">Retry</button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-stretch gap-2">
                <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                  {KPIS.map(([l, v, id]) => (
                    <div key={id} className="panel rounded-[3px] bg-card px-3 py-2">
                      {loading ? <Skeleton className="h-6 w-16" /> : <div data-testid={id} className={`text-[20px] font-semibold leading-tight tnum transition-opacity ${q.isFetching ? "opacity-60" : ""}`}>{v}</div>}
                      <div className="text-[11px] text-muted-foreground">{l}</div>
                    </div>
                  ))}
                </div>
                <button data-testid="button-fhfc-analysis" disabled={!data} onClick={() => setAnalysis(true)} className="flex items-center justify-center self-center rounded-[3px] bg-[#2ecc71] px-6 py-2.5 text-[13px] font-semibold tracking-wide text-[#0b2a1a] transition-opacity hover:opacity-90 disabled:opacity-50 print:hidden">FH/FC ANALYSIS</button>
              </div>

              {data && data.kpis.recordCount === 0 ? (
                <div className="panel rounded-[3px] border border-dashed border-border bg-card px-6 py-14 text-center">
                  <div className="text-[14px] font-semibold">No utilisation records match these filters</div>
                  <p className="mt-1 text-[12px] text-muted-foreground">Widen the date range or remove a filter.</p>
                  {active.length > 0 && <button onClick={() => defaults && setF(defaults)} className="mt-3 rounded-[3px] bg-primary px-3 py-1.5 text-[12px] text-primary-foreground">Clear all filters</button>}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
                    <Ranking title="Aircraft Type" dim="model" color="#e8743b" rows={data?.modelRanking} count={data?.rankingCounts.model} selected={filters?.model ?? ""} onPick={(v) => pick("model", v)} label={modelLabel} />
                    <Ranking title="Engine" dim="engine" color="#1fa3d9" rows={data?.engineRanking} count={data?.rankingCounts.engine} selected={filters?.engine ?? ""} onPick={(v) => pick("engine", v)} />
                    <Ranking title="Airline" dim="airline" color="#2ecc71" rows={data?.airlineRanking} count={data?.rankingCounts.airline} selected={filters?.airline ?? ""} onPick={(v) => pick("airline", v)} />
                    <Ranking title="MSN" dim="msn" color="#2563eb" rows={data?.msnRanking} count={data?.rankingCounts.msn} selected={filters?.msn ?? ""} onPick={(v) => pick("msn", v)} />
                    <Ranking title="Manufacturer" dim="manufacturer" color="#2ecc71" rows={data?.manufacturerRanking} count={data?.rankingCounts.manufacturer} selected={filters?.manufacturer ?? ""} onPick={(v) => pick("manufacturer", v)} />
                  </div>
                  <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
                    <MonthlyChart data={data} isDark={isDark} />
                    <TopAirlinesChart data={data} isDark={isDark} />
                  </div>
                </>
              )}
              {options && options.notes.length > 0 && (
                <details className="panel rounded-[3px] bg-card px-3 py-2 text-[11px] text-muted-foreground" data-testid="source-notes">
                  <summary className="cursor-pointer font-semibold text-foreground">Source notes and metric definitions</summary>
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                    <li>Imported snapshot of {options.source}; not a live feed. Rankings are SUM of monthly total flight hours; KPIs are means across records.</li>
                    {options.notes.map((n) => <li key={n}>{n}</li>)}
                  </ul>
                </details>
              )}
            </>
          )}
          <div className="pt-1 text-[11px] text-muted-foreground lg:hidden">AIRLINE ECONOMICS<span className="text-primary">+</span></div>
        </main>
      </div>

      <AnalysisDialog open={analysis} onOpenChange={setAnalysis} rows={data?.analysis ?? []} />

      <Dialog open={disc} onOpenChange={setDisc}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Disclaimer</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-[13px] leading-relaxed">
                <p>This dashboard displays an imported snapshot of the aircraft registry fleet utilisation dataset{options ? ` (${options.source})` : ""}. It is not a live data feed.</p>
                <p>Figures are aggregated server-side directly from the imported rows. Negative monthly hours are source adjustments and are shown as reported, without correction.</p>
                <p>The information is provided for general analysis only and does not constitute financial, investment or legal advice.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CsvBtn({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button onClick={onClick} data-testid={`csv-${name}`} aria-label={`Download ${name} as CSV`} className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[3px] bg-foreground/10 text-foreground/80 transition-colors hover:bg-foreground/20 print:hidden">
      <Download className="h-3 w-3" />
    </button>
  );
}

function Ranking({ title, dim, color, rows, count, selected, onPick, label }: { title: string; dim: Dim; color: string; rows?: UtilisationRank[]; count?: number; selected: string; onPick: (v: string) => void; label?: (v: string) => string }) {
  const max = Math.max(1, ...(rows ?? []).map((r) => Math.abs(r.value)));
  const show = (v: string) => (v === "" ? "(Blank)" : label ? label(v) : v);
  return (
    <section className="panel flex min-w-0 flex-col rounded-[3px] bg-card">
      <div className="flex items-center gap-2 px-2 pb-1 pt-1.5">
        <h2 className="mr-auto text-[12px] font-semibold">{title}</h2>
        {rows && <CsvBtn name={`rank-${dim}`} onClick={() => downloadCSV(`utilisation-by-${dim}.csv`, rows.map((r) => ({ [dim]: r.name, ...(label ? { label: show(r.name) } : {}), total_flight_hours: r.value })))} />}
      </div>
      <div className="grid grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] gap-1 border-b border-foreground/30 px-2 pb-1 text-[11px] font-semibold"><span>{title}</span><span>Total Flight Hours</span></div>
      <div className="thin-scroll h-[300px] overflow-y-auto">
        {!rows ? Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="mx-2 my-1 h-3.5" />) : rows.length === 0 ? (
          <div className="px-2 py-8 text-center text-[11px] text-muted-foreground">No {title.toLowerCase()} in view</div>
        ) : rows.map((d) => {
          const on = selected === d.name;
          return (
            <button key={d.name} data-testid={`rank-${dim}-${d.name}`} onClick={() => onPick(d.name)} title={`${show(d.name)}${label && show(d.name) !== d.name ? ` (${d.name})` : ""}: ${f2(d.value)}`}
              className={`grid w-full grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] items-center gap-1 px-2 py-[2.5px] text-left text-[11px] transition-colors hover:bg-primary/10 ${on ? "bg-primary/20" : selected ? "opacity-60" : ""}`}>
              <span className="truncate font-medium">{show(d.name)}</span>
              <span className="relative h-[13px]">
                <span className="absolute inset-y-0 left-0 rounded-[1px] transition-[width] duration-300" style={{ background: d.value < 0 ? "#ef6461" : color, width: `${Math.max(2, (Math.abs(d.value) / max) * 100)}%` }} />
                <span className="relative block pr-1 text-right tnum">{f2(d.value)}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="border-t border-foreground/30 px-2 py-1 text-[10.5px] text-muted-foreground tnum">
        {rows && count != null ? (rows.length < count ? <span data-testid={`note-top-${dim}`}>Top {nf(rows.length)} of {nf(count)} &middot; full list in filters</span> : <>{nf(count)} {title.toLowerCase()}{count === 1 ? "" : "s"}</>) : "\u00a0"}
      </div>
    </section>
  );
}

function axisColors(isDark: boolean) {
  return { grid: isDark ? "rgba(255,255,255,0.08)" : "#dfe5eb", tick: isDark ? "#9fb3c4" : "#5b6b7b", zero: isDark ? "#c8d6e2" : "#3a4a5a" };
}
const tickMonth = (m: string) => `${fullMonth(m).slice(0, 3)} ${m.slice(0, 4)}`;

function TipBox({ label, items }: { label: string; items: { name: string; value: number; color: string }[] }) {
  return (
    <div className="max-w-[260px] rounded-[4px] border border-[#d5dde6] bg-[#fbfcfd] px-3 py-2 text-[12px] text-[#13293d]">
      <div className="mb-1 font-semibold">{fullMonth(label)}</div>
      {items.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-[1px]" style={{ background: p.color }} />
          <span className="truncate">{p.name}</span><span className={`ml-auto pl-3 font-semibold tnum ${p.value < 0 ? "text-[#c0392b]" : ""}`}>{f2(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function useMonths(data?: UtilisationDashboard) {
  return useMemo(() => (data ? monthRange(data.from, data.to) : []), [data]);
}

function MonthlyChart({ data, isDark }: { data?: UtilisationDashboard; isDark: boolean }) {
  const months = useMonths(data);
  const rows = useMemo(() => {
    const m = new Map(data?.monthlyTrend.map((t) => [t.month, t.hours]));
    return months.map((month) => ({ month, hours: m.get(month) ?? 0 }));
  }, [data, months]);
  const c = axisColors(isDark);
  return (
    <section className="panel min-w-0 rounded-[3px] bg-card">
      <div className="flex items-center gap-2 px-2 pb-1 pt-1.5">
        <h2 className="mr-auto text-[12px] font-semibold">Monthly Flight Hour Trends</h2>
        {data && <CsvBtn name="monthly-trend" onClick={() => downloadCSV("monthly-flight-hour-trends.csv", rows.map((r) => ({ month: r.month, flight_hours: r.hours })))} />}
      </div>
      <div className="h-[280px] px-1 pb-2">
        {!data ? <Skeleton className="h-full" /> : (
          <ResponsiveContainer width="100%" height="100%" debounce={0}>
            <AreaChart data={rows} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
              <defs><linearGradient id="gMonthly" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2f7fe0" stopOpacity={0.85} /><stop offset="100%" stopColor="#2f7fe0" stopOpacity={0.35} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
              <XAxis dataKey="month" tickFormatter={tickMonth} tick={{ fontSize: 10, fill: c.tick }} stroke={c.tick} />
              <YAxis tickFormatter={compact} tick={{ fontSize: 10, fill: c.tick }} stroke={c.tick} width={44} />
              <ReferenceLine y={0} stroke={c.zero} strokeWidth={1} />
              <RTooltip isAnimationActive={false} cursor={{ stroke: c.tick, strokeDasharray: "3 3" }} content={({ active, payload, label }) => active && payload?.length ? <TipBox label={String(label)} items={[{ name: "Flight hours", value: Number(payload[0].value), color: "#2f7fe0" }]} /> : null} />
              <Area type="linear" dataKey="hours" stroke="#2f7fe0" strokeWidth={2} fill="url(#gMonthly)" fillOpacity={1} isAnimationActive={false} dot={{ r: 2.5, fill: "#2f7fe0" }}
                label={{ position: "top", fontSize: 10, fill: c.tick, formatter: (v: unknown) => compact(Number(v)) }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

function TopAirlinesChart({ data, isDark }: { data?: UtilisationDashboard; isDark: boolean }) {
  const months = useMonths(data);
  const series = useMemo(() => data?.topAirlineTrends ?? [], [data]);
  const rows = useMemo(() => {
    const maps = series.map((s) => new Map(s.points.map((p) => [p.month, p.hours])));
    return months.map((month) => {
      const o: Record<string, number | string> = { month };
      series.forEach((s, i) => { o[s.airline] = maps[i].get(month) ?? 0; });
      return o;
    });
  }, [series, months]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const c = axisColors(isDark);
  const color = (a: string) => TOP5[series.findIndex((s) => s.airline === a) % TOP5.length];
  return (
    <section className="panel min-w-0 rounded-[3px] bg-card">
      <div className="flex items-center gap-2 px-2 pb-1 pt-1.5">
        <h2 className="mr-auto text-[12px] font-semibold">Top 5 Airline's Monthly Flight Hour Trends</h2>
        {data && <CsvBtn name="top-airlines" onClick={() => downloadCSV("top-5-airline-monthly-flight-hours.csv", rows)} />}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-2 text-[10.5px]">
        <span className="font-semibold">Airline</span>
        {series.map((s) => (
          <button key={s.airline} data-testid={`legend-${s.airline}`} onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(s.airline)) n.delete(s.airline); else n.add(s.airline); return n; })} className={`flex items-center gap-1 transition-opacity ${hidden.has(s.airline) ? "opacity-40" : ""}`}>
            <span className="h-2 w-2 rounded-full" style={{ background: color(s.airline) }} />{s.airline}
          </button>
        ))}
      </div>
      <div className="h-[262px] px-1 pb-2">
        {!data ? <Skeleton className="h-full" /> : series.length === 0 ? <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground">No airline trends in view</div> : (
          <ResponsiveContainer width="100%" height="100%" debounce={0}>
            <AreaChart data={rows} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
              <XAxis dataKey="month" tickFormatter={tickMonth} tick={{ fontSize: 10, fill: c.tick }} stroke={c.tick} />
              <YAxis tickFormatter={compact} tick={{ fontSize: 10, fill: c.tick }} stroke={c.tick} width={44} />
              <ReferenceLine y={0} stroke={c.zero} strokeWidth={1} />
              <RTooltip isAnimationActive={false} cursor={{ stroke: c.tick, strokeDasharray: "3 3" }} content={({ active, payload, label }) => active && payload?.length ? <TipBox label={String(label)} items={payload.map((p) => ({ name: String(p.name), value: Number(p.value), color: color(String(p.name)) })).sort((a, b) => b.value - a.value)} /> : null} />
              {series.filter((s) => !hidden.has(s.airline)).map((s) => (
                <Area key={s.airline} type="linear" dataKey={s.airline} name={s.airline} stroke={color(s.airline)} strokeWidth={1.5} fill={color(s.airline)} fillOpacity={0.35} isAnimationActive={false} dot={{ r: 2 }} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

type AKey = keyof UtilisationAnalysis;
const ACOLS: { k: AKey; l: string }[] = [
  { k: "model", l: "Model" }, { k: "aircraft", l: "Aircraft" }, { k: "totalHours", l: "Total FH" },
  { k: "avgMonthlyHours", l: "Avg Monthly FH" }, { k: "avgMonthlyCycles", l: "Avg Monthly FC (LTT)" },
  { k: "avgLtmHours", l: "Avg FH (LTM)/Month" }, { k: "avgLtmCycles", l: "Avg FC (LTM)/Month" }, { k: "avgRatio", l: "FH/FC Ratio (LTT)" },
];

function AnalysisDialog({ open, onOpenChange, rows }: { open: boolean; onOpenChange: (o: boolean) => void; rows: UtilisationAnalysis[] }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ k: AKey; dir: 1 | -1 }>({ k: "totalHours", dir: -1 });
  const view = useMemo(() => {
    const s = search.trim().toLowerCase();
    const r = s ? rows.filter((x) => `${x.model} ${modelLabel(x.model)}`.toLowerCase().includes(s)) : rows.slice();
    return r.sort((a, b) => {
      const av = a[sort.k], bv = b[sort.k];
      if (av == null) return 1; if (bv == null) return -1;
      return (typeof av === "number" ? av - (bv as number) : String(av).localeCompare(String(bv))) * sort.dir;
    });
  }, [rows, search, sort]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl gap-2 p-4">
        <DialogHeader>
          <DialogTitle className="text-[15px]">FH/FC Analysis by Model</DialogTitle>
          <DialogDescription className="text-[11px]">Per-model aggregates for the current filters. FH = flight hours, FC = flight cycles.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <div className="flex h-7 items-center gap-1 rounded-[3px] border border-input px-1.5">
            <Search className="h-3 w-3 opacity-60" />
            <input data-testid="input-analysis-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search models" className="w-40 bg-transparent text-[12px] outline-none" />
          </div>
          <span className="mr-auto text-[11px] text-muted-foreground tnum">{nf(view.length)} models</span>
          <CsvBtn name="analysis" onClick={() => downloadCSV("fh-fc-analysis.csv", view.map((r) => ({ model: r.model, label: modelLabel(r.model), aircraft: r.aircraft, total_fh: r.totalHours, avg_monthly_fh: r.avgMonthlyHours, avg_monthly_fc_ltt: r.avgMonthlyCycles, avg_fh_ltm_month: r.avgLtmHours, avg_fc_ltm_month: r.avgLtmCycles, fh_fc_ratio_ltt: r.avgRatio })))} />
        </div>
        <div className="thin-scroll max-h-[55vh] overflow-auto rounded-[3px] border border-border">
          <table className="w-full min-w-[820px] text-[11.5px]">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-foreground/30">
                {ACOLS.map((c) => (
                  <th key={c.k} className={`whitespace-nowrap px-2 py-1.5 font-semibold ${c.k === "model" ? "text-left" : "text-right"}`}>
                    <button data-testid={`sort-analysis-${c.k}`} onClick={() => setSort((s) => ({ k: c.k, dir: s.k === c.k ? (s.dir === 1 ? -1 : 1) : c.k === "model" ? 1 : -1 }))} className="inline-flex items-center gap-0.5 hover:text-primary">
                      {c.l}{sort.k === c.k && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.length === 0 ? <tr><td colSpan={8} className="px-2 py-8 text-center text-muted-foreground">No models match</td></tr> : view.map((r) => (
                <tr key={r.model} data-testid={`row-analysis-${r.model}`} className="border-b border-border/40 hover:bg-primary/10">
                  <td className="px-2 py-1 font-medium" title={r.model}>{r.model === "" ? <span className="italic text-muted-foreground">(Blank)</span> : <>{modelLabel(r.model)}{modelLabel(r.model) !== r.model && <span className="ml-1 font-mono text-[10px] text-muted-foreground">{r.model}</span>}</>}</td>
                  <td className="px-2 py-1 text-right tnum">{nf(r.aircraft)}</td>
                  <td className={`px-2 py-1 text-right tnum ${r.totalHours < 0 ? "text-destructive" : ""}`}>{f2(r.totalHours)}</td>
                  <td className="px-2 py-1 text-right tnum">{f2(r.avgMonthlyHours)}</td>
                  <td className="px-2 py-1 text-right tnum">{f2(r.avgMonthlyCycles)}</td>
                  <td className="px-2 py-1 text-right tnum">{f2(r.avgLtmHours)}</td>
                  <td className="px-2 py-1 text-right tnum">{f2(r.avgLtmCycles)}</td>
                  <td className="px-2 py-1 text-right tnum">{f2(r.avgRatio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="list-disc space-y-0.5 pl-4 text-[10.5px] text-muted-foreground">
          <li>Aircraft = distinct MSN. Total FH = SUM(MONTHLY_HOURS_TTL), negative source adjustments included.</li>
          <li>Avg Monthly FH = mean MONTHLY_HOURS_TTL; Avg Monthly FC (LTT) = mean AVG_FC_LTT.</li>
          <li>LTM columns = mean last-twelve-month hours/cycles divided per month; Ratio (LTT) = mean HRS_PER_CYCLE. Blank values excluded from means.</li>
        </ul>
      </DialogContent>
    </Dialog>
  );
}
