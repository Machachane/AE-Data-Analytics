import { useEffect, useMemo, useRef, useState } from "react";
import { initialAssistantFilters, one } from "@/lib/assistant-filters";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAssistantModule } from "@/lib/assistant-controller";
import { useGetMarketRates, getGetMarketRatesQueryKey } from "@workspace/api-client-react";
import { AlertTriangle, Check, ChevronDown, Info, Moon, Printer, RefreshCw, RotateCcw, Sun, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { MultiSelect } from "@/components/multi-select";
import { MarketRangeChart, type ChartMode } from "@/components/market-range-chart";
import { MarketTable } from "@/components/market-table";
import { filterMarketRows, isReversed, marketRanges, missingBoundTypes, type MarketFilters } from "@/lib/market-rates";

const MODULES = ["Summary", "Deliveries", "Orders", "Aircraft Utilisation", "Aviation Finance", "Airline Financials", "Market Value / Lease Rates", "Emissions", "Aircraft Registry", "Engine Profile", "Jurisdiction Risk"];
const NAV: Record<string, string> = { Summary: "/summary", "Jurisdiction Risk": "/jurisdiction-risk", "Engine Profile": "/engine-profile", Deliveries: "/deliveries", Orders: "/orders", "Aircraft Utilisation": "/aircraft-utilisation", "Aviation Finance": "/aviation-finance", "Airline Financials": "/airline-financials", Emissions: "/emissions", "Aircraft Registry": "/aircraft-registry" };
const INTERVALS = [
  { label: "Every 5 min", ms: 5 * 60_000 },
  { label: "Every 15 min", ms: 15 * 60_000 },
  { label: "Every 1 hour", ms: 60 * 60_000 },
  { label: "Every 24 hours", ms: 24 * 60 * 60_000 },
];
const iconBtn = "flex h-[26px] items-center justify-center gap-1 rounded-[4px] bg-foreground/10 px-2 text-[12px] text-foreground/85 transition-colors hover:bg-foreground/20 disabled:opacity-50";
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const EMPTY: MarketFilters = { manufacturer: [], aircraftType: [], vintage: [] };
const uniq = (a: string[]) => [...new Set(a)].sort((x, y) => x.localeCompare(y));

export default function MarketRatesPage() {
  const qc = useQueryClient();
  const [interval, setIntervalMs] = useState<number | null>(null);
  const q = useGetMarketRates({ query: { queryKey: getGetMarketRatesQueryKey(), refetchInterval: interval ?? false } });
  const ds = q.data;
  const rows = useMemo(() => ds?.rows ?? [], [ds]);
  const loading = q.isLoading;

  useEffect(() => {
    document.title = "Market Value / Lease Rates | AE+ Data Analytics";
    let m = document.querySelector('meta[name="description"]');
    if (!m) { m = document.createElement("meta"); m.setAttribute("name", "description"); document.head.appendChild(m); }
    m.setAttribute("content", "Aircraft market value and monthly lease rate ranges by aircraft type, manufacturer and vintage, with full valuation records.");
  }, []);
  const [isDark, setDark] = useState(() => localStorage.getItem("ae-theme") !== "light");
  useEffect(() => { document.documentElement.classList.toggle("dark", isDark); localStorage.setItem("ae-theme", isDark ? "dark" : "light"); }, [isDark]);
  const [spin, setSpin] = useState(false);
  useEffect(() => { if (q.isFetching) { setSpin(true); return undefined; } const t = setTimeout(() => setSpin(false), 600); return () => clearTimeout(t); }, [q.isFetching]);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);
  const [disc, setDisc] = useState(false);
  const [mode, setMode] = useState<ChartMode>("original");
  const refresh = () => qc.invalidateQueries({ queryKey: getGetMarketRatesQueryKey() });
  const last = q.dataUpdatedAt ? new Date(q.dataUpdatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;

  const [f, setF] = useState<MarketFilters>(() => {
    const init = initialAssistantFilters(["manufacturer", "aircraftType", "vintage"] as const);
    return { manufacturer: one(init.manufacturer), aircraftType: one(init.aircraftType), vintage: one(init.vintage) };
  });
  const set = (p: Partial<MarketFilters>) => setF((o) => ({ ...o, ...p }));
  useAssistantModule("market-value-lease-rates", { ready: true, filters: f, apply: (s) => setF({ ...EMPTY, ...s }) });
  const filtered = useMemo(() => filterMarketRows(rows, f), [rows, f]);
  const opts = useMemo(() => ({
    manufacturer: uniq(rows.map((r) => r.manufacturer)),
    aircraftType: uniq(rows.map((r) => r.aircraftType)),
    vintage: [...new Set(rows.map((r) => r.vintage))].sort((a, b) => a - b).map(String),
  }), [rows]);
  const lease = useMemo(() => marketRanges(filtered, "lease"), [filtered]);
  const market = useMemo(() => marketRanges(filtered, "market"), [filtered]);
  const missLease = useMemo(() => missingBoundTypes(filtered, "lease"), [filtered]);
  const missMarket = useMemo(() => missingBoundTypes(filtered, "market"), [filtered]);
  const nTypes = new Set(filtered.map((r) => r.aircraftType)).size;
  const nMan = new Set(filtered.map((r) => r.manufacturer)).size;
  const reversed = useMemo(() => rows.filter(isReversed), [rows]);
  const pickType = (t: string) => set({ aircraftType: f.aircraftType.includes(t) ? f.aircraftType.filter((x) => x !== t) : [...f.aircraftType, t] });

  const LABEL: Record<keyof MarketFilters, string> = { manufacturer: "Manufacturer", aircraftType: "Aircraft type", vintage: "Vintage" };
  const active = (Object.keys(LABEL) as (keyof MarketFilters)[]).flatMap((d) => f[d].map((v) => ({ k: `${d}-${v}`, label: `${LABEL[d]}: ${v}`, clear: () => set({ [d]: f[d].filter((x) => x !== v) }) })));

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <nav className="thin-scroll flex overflow-x-auto border-b border-border bg-sidebar print:hidden" aria-label="Modules">
        {MODULES.map((m) => m === "Market Value / Lease Rates" ? (
          <div key={m} data-testid="nav-market-value-lease-rates" className="relative flex min-w-[110px] flex-1 items-center justify-center bg-primary px-3 py-2.5 text-center text-[13px] font-semibold leading-tight text-primary-foreground">{m}</div>
        ) : NAV[m] ? (
          <Link key={m} href={NAV[m]} data-testid={`nav-${slug(m)}`} className="flex min-w-[110px] flex-1 items-center justify-center border-r border-border/60 px-3 py-2.5 text-center text-[13px] font-medium leading-tight text-sidebar-foreground transition-colors hover:bg-primary/20">{m}</Link>
        ) : (
          <Tooltip key={m}>
            <TooltipTrigger asChild>
              <button aria-disabled data-testid={`nav-${slug(m)}`} className="flex min-w-[110px] flex-1 cursor-not-allowed items-center justify-center border-r border-border/60 px-3 py-2.5 text-center text-[13px] font-medium leading-tight text-sidebar-foreground/55 hover:text-sidebar-foreground/75">{m}</button>
            </TooltipTrigger>
            <TooltipContent>Not yet available</TooltipContent>
          </Tooltip>
        ))}
      </nav>

      <div className="flex flex-col lg:flex-row">
        <aside className="flex w-full shrink-0 flex-col gap-3 border-b border-border bg-sidebar/60 p-3 lg:min-h-[calc(100dvh-44px)] lg:w-[190px] lg:border-b-0 lg:border-r">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {ds ? (Object.keys(LABEL) as (keyof MarketFilters)[]).map((d) => (
              <MultiSelect key={d} id={slug(d)} label={LABEL[d]} options={opts[d]} value={f[d]} onChange={(v) => set({ [d]: v })} />
            )) : [0, 1, 2].map((i) => <Skeleton key={i} className="h-11" />)}
          </div>
          <button data-testid="button-clear-filters" disabled={!active.length} onClick={() => setF(EMPTY)} className="flex h-7 items-center justify-center gap-1.5 rounded-[3px] border border-border bg-card text-[12px] font-medium transition-colors hover:border-primary disabled:opacity-50 print:hidden">
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
              <h1 className="text-[15px] font-semibold leading-tight">AE<span className="text-primary">+</span> Data Analytics <span className="font-normal text-muted-foreground">/ Market Value / Lease Rates</span></h1>
              <p className="text-[11px] text-muted-foreground" data-testid="text-status">
                {ds ? <>Source: {ds.source} &middot; {ds.sheet} &middot; {rows.length} valuation records</> : "Loading valuation snapshot"}
                {last && <> &middot; Last refresh {last}</>}
                {reversed.length > 0 && (
                  <Tooltip><TooltipTrigger asChild><span data-testid="status-reversed" className="ml-1.5 inline-flex cursor-help items-center gap-0.5 rounded-[3px] bg-amber-500/15 px-1 text-amber-600 dark:text-amber-300"><AlertTriangle className="h-3 w-3" /> Data quality</span></TooltipTrigger>
                    <TooltipContent className="max-w-xs">{reversed.length} source row{reversed.length === 1 ? "" : "s"} have lease rate high below low ({reversed.map((r) => `${r.aircraftType} ${r.vintage}`).join(", ")}). Shown as reported, not corrected.</TooltipContent></Tooltip>
                )}
              </p>
            </div>
            <div className="flex items-center gap-1.5 print:hidden">
              <div className="flex h-[26px] overflow-hidden rounded-[4px] bg-foreground/10 text-[11px]" role="group" aria-label="Chart layout">
                {(["original", "interval"] as ChartMode[]).map((m) => (
                  <button key={m} data-testid={`toggle-mode-${m}`} aria-pressed={mode === m} onClick={() => setMode(m)} className={`px-2 transition-colors ${mode === m ? "bg-primary text-primary-foreground" : "hover:bg-foreground/10"}`}>{m === "original" ? "Original stacked" : "True interval"}</button>
                ))}
              </div>
              <div className="relative" ref={menuRef}>
                <div className="flex h-[26px] items-center overflow-hidden rounded-[4px] bg-foreground/10 text-[12px]">
                  <button data-testid="button-refresh" onClick={refresh} disabled={q.isFetching} className="flex h-full items-center gap-1 px-2 hover:bg-foreground/10 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${spin ? "animate-spin" : ""}`} /> Refresh</button>
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
                <button key={a.k} data-testid={`chip-${slug(a.k)}`} onClick={a.clear} className="group flex items-center gap-1 rounded-[3px] bg-primary/15 px-1.5 py-0.5 text-[11px] transition-colors hover:bg-primary/30">
                  {a.label}<X className="h-3 w-3 opacity-60 group-hover:opacity-100" />
                </button>
              ))}
            </div>
          )}

          {q.isError ? (
            <div className="panel flex flex-col items-center justify-center gap-3 rounded-[3px] border border-border bg-card px-6 py-16 text-center">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              <div className="text-[14px] font-semibold">Market value and lease rate data could not be loaded</div>
              <p className="max-w-md text-[12px] text-muted-foreground">The server did not return the MARKET_VALUE_LEASE_RATES dataset. Check the API service, then retry.</p>
              <button data-testid="button-retry" onClick={() => q.refetch()} className="rounded-[3px] bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:opacity-90">Retry</button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:max-w-[380px]">
                {([["Total Aircraft Types", nTypes, "kpi-aircraft-types"], ["Total Manufacturers", nMan, "kpi-manufacturers"]] as const).map(([l, v, id]) => (
                  <div key={id} className="panel rounded-[3px] bg-card px-3 py-2">
                    {loading ? <Skeleton className="h-6 w-12" /> : <div data-testid={id} className="text-[20px] font-semibold leading-tight tnum">{v}</div>}
                    <div className="text-[11px] text-muted-foreground">{l}</div>
                  </div>
                ))}
              </div>

              {!loading && filtered.length === 0 ? (
                <div className="panel rounded-[3px] border border-dashed border-border bg-card px-6 py-14 text-center" data-testid="empty-filtered">
                  <div className="text-[14px] font-semibold">No valuation records match these filters</div>
                  <p className="mt-1 text-[12px] text-muted-foreground">{rows.length ? "This manufacturer, aircraft type and vintage combination has no rows. Remove a filter." : "The dataset returned no rows."}</p>
                  {active.length > 0 && <button onClick={() => setF(EMPTY)} className="mt-3 rounded-[3px] bg-primary px-3 py-1.5 text-[12px] text-primary-foreground">Clear all filters</button>}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
                    <MarketRangeChart kind="lease" ranges={lease} mode={mode} selected={f.aircraftType} onPick={pickType} missing={missLease} loading={loading} />
                    <MarketRangeChart kind="market" ranges={market} mode={mode} selected={f.aircraftType} onPick={pickType} missing={missMarket} loading={loading} />
                  </div>
                  <MarketTable rows={filtered} loading={loading} />
                </>
              )}
              {ds && (
                <details className="panel rounded-[3px] bg-card px-3 py-2 text-[11px] text-muted-foreground" data-testid="source-notes">
                  <summary className="cursor-pointer font-semibold text-foreground">Source notes and definitions</summary>
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                    <li>Imported snapshot of {ds.source}, sheet {ds.sheet}; not a live feed. Records are valuations by vintage, not transactions. Values are USD millions; lease rates are monthly.</li>
                    <li>Lease range per aircraft type = MIN(lease rate low) to MAX(lease rate high). Market range = MIN to MAX market value. Null values are ignored, not zero-filled. Charts are sorted by lower bound, descending.</li>
                    <li>Original stacked layout reproduces the source report: an invisible offset equal to the lower bound plus a coloured bar whose length equals the upper bound, so bar ends sit at low + high. Labels and exports always show the actual source bounds. Use True interval to draw low to high.</li>
                    {reversed.length > 0 && <li>{reversed.length} rows have lease rate high below low ({reversed.map((r) => `${r.aircraftType} ${r.vintage}`).join(", ")}). They are kept as reported and highlighted in the table; reversed aggregate bounds are flagged in the charts.</li>}
                    <li>Table values are shown to 2 decimals; hover a cell or export CSV for full precision.</li>
                    {ds.notes.map((n) => <li key={n}>{n}</li>)}
                  </ul>
                </details>
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
                <p>This report displays an imported snapshot of aircraft market values and lease rates{ds ? ` (${ds.source}, sheet ${ds.sheet})` : ""}. It is not a live data feed.</p>
                <p>Values are indicative valuations by vintage and are shown as reported, including source anomalies.</p>
                <p>The information is provided for general analysis only and does not constitute financial, investment or legal advice.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}
