import { useEffect, useMemo, useRef, useState } from "react";
import { initialAssistantFilters, applyStringFilters } from "@/lib/assistant-filters";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAssistantModule } from "@/lib/assistant-controller";
import { useGetRegistry, getGetRegistryQueryKey, useGetRegistryOptions, getGetRegistryOptionsQueryKey } from "@workspace/api-client-react";
import type { GetRegistryParams } from "@workspace/api-client-react";
import { AlertTriangle, ArrowLeft, BarChart3, Check, ChevronDown, Info, Moon, Printer, RefreshCw, RotateCcw, Sun, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { SingleSelect } from "@/components/single-select";
import { RegistryGraphs } from "@/components/registry-graphs";
import { RegistryTable } from "@/components/registry-table";
import { nf } from "@/lib/deliveries";

const MODULES = ["Summary", "Deliveries", "Orders", "Aircraft Utilisation", "Aviation Finance", "Airline Financials", "Market Value / Lease Rates", "Emissions", "Aircraft Registry", "Engine Profile", "Jurisdiction Risk"];
const NAV: Record<string, string> = { Summary: "/summary", "Jurisdiction Risk": "/jurisdiction-risk", "Engine Profile": "/engine-profile", Deliveries: "/deliveries", Orders: "/orders", "Aircraft Utilisation": "/aircraft-utilisation", "Aviation Finance": "/aviation-finance", "Airline Financials": "/airline-financials", "Market Value / Lease Rates": "/market-value-lease-rates", Emissions: "/emissions" };
const INTERVALS = [
  { label: "Every 5 min", ms: 5 * 60_000 },
  { label: "Every 15 min", ms: 15 * 60_000 },
  { label: "Every 1 hour", ms: 60 * 60_000 },
  { label: "Every 24 hours", ms: 24 * 60 * 60_000 },
];
const iconBtn = "flex h-[26px] items-center justify-center gap-1 rounded-[4px] bg-foreground/10 px-2 text-[12px] text-foreground/85 transition-colors hover:bg-foreground/20 disabled:opacity-50";
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
type Key = "manufacturer" | "model" | "registration" | "msn" | "operator" | "owner" | "aircraftType";
type F = Record<Key, string>;
const EMPTY: F = { manufacturer: "", model: "", registration: "", msn: "", operator: "", owner: "", aircraftType: "" };
const LABEL: Record<Key, string> = { manufacturer: "Manufacturer", model: "Model", registration: "Registration", msn: "MSN", operator: "Operator", owner: "Owner", aircraftType: "Aircraft Type" };
const KEYS = Object.keys(LABEL) as Key[];
const k2 = (n: number) => (Math.abs(n) >= 1e9 ? `${(n / 1e9).toFixed(2)}bn` : Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(2)}K` : n.toFixed(2));
const readView = (): "table" | "graphs" => (new URLSearchParams(window.location.search).get("view") === "graphs" ? "graphs" : "table");
const compact = (n: number) => (Math.abs(n) >= 1e9 ? `${(n / 1e9).toFixed(2)}bn` : Math.abs(n) >= 1e6 ? `${Math.round(n / 1e6)}M` : Math.abs(n) >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));
const monthYear = (iso: string) => { const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso); return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }); };

function setMeta(attr: string, key: string, content: string) {
  let m = document.querySelector(`meta[${attr}="${key}"]`);
  if (!m) { m = document.createElement("meta"); m.setAttribute(attr, key); document.head.appendChild(m); }
  m.setAttribute("content", content);
}

export default function RegistryPage() {
  const qc = useQueryClient();
  const [interval, setIntervalMs] = useState<number | null>(null);
  const oq = useGetRegistryOptions({ query: { queryKey: getGetRegistryOptionsQueryKey(), refetchInterval: interval ?? false } });
  const options = oq.data;
  const [f, setF] = useState<F>(() => applyStringFilters(EMPTY, initialAssistantFilters(KEYS)));
  const set = (p: Partial<F>) => setF((o) => ({ ...o, ...p }));
  useAssistantModule("aircraft-registry", { ready: true, filters: f, apply: (s) => setF(applyStringFilters(EMPTY, s)) });
  const params = useMemo<GetRegistryParams>(() => {
    const p: GetRegistryParams = {};
    for (const k of KEYS) if (f[k]) p[k] = f[k];
    return p;
  }, [f]);
  const q = useGetRegistry(params, { query: { queryKey: getGetRegistryQueryKey(params), enabled: !!options, refetchInterval: interval ?? false } });
  const data = q.data;

  const [isDark, setDark] = useState(() => localStorage.getItem("ae-theme") !== "light");
  useEffect(() => { document.documentElement.classList.toggle("dark", isDark); localStorage.setItem("ae-theme", isDark ? "dark" : "light"); }, [isDark]);
  const fetching = q.isFetching || oq.isFetching;
  const [spin, setSpin] = useState(false);
  useEffect(() => { if (fetching) { setSpin(true); return undefined; } const t = setTimeout(() => setSpin(false), 600); return () => clearTimeout(t); }, [fetching]);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("mousedown", h); document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, []);
  const [disc, setDisc] = useState(false);
  const refresh = () => { qc.invalidateQueries({ queryKey: getGetRegistryOptionsQueryKey() }); qc.invalidateQueries({ queryKey: ["/api/registry"] }); qc.invalidateQueries({ queryKey: ["/api/registry/records"] }); };

  const disp = (_k: Key, v: string) => (v === "" ? "(Blank)" : v);
  const [view, setViewState] = useState<"table" | "graphs">(readView);
  useEffect(() => { const h = () => setViewState(readView()); window.addEventListener("popstate", h); return () => window.removeEventListener("popstate", h); }, []);
  const setView = (v: "table" | "graphs") => {
    const u = new URL(window.location.href);
    if (v === "graphs") u.searchParams.set("view", "graphs"); else u.searchParams.delete("view");
    window.history.pushState(null, "", u.pathname + u.search + u.hash);
    setViewState(v);
  };
  const pickPair = (operator: string, model: string) => setF((o) => (o.operator === operator && o.model === model ? { ...o, operator: "", model: "" } : { ...o, operator, model }));
  useEffect(() => {
    const g = view === "graphs";
    const title = g ? "Aircraft Registry Graphs | AE+ Data Analytics" : "Aircraft Registry | AE+ Data Analytics";
    const desc = g ? "Aircraft registry graphs: manufacturer share of monthly observations, top operator and model pairs, owners and models by distinct aircraft, with linked detail table." : "Aircraft registry of the in-service fleet: manufacturer, type, registration, MSN, operator, owner, first flight and engine details, with LTM utilisation totals.";
    document.title = title;
    setMeta("name", "description", desc);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", desc);
    setMeta("property", "og:type", "website");
  }, [view]);
  const active = KEYS.filter((k) => f[k]).map((k) => ({ k, label: `${LABEL[k]}: ${disp(k, f[k])}`, clear: () => set({ [k]: "" }) }));
  const pick = (k: Key, v: string) => set({ [k]: f[k] === v ? "" : v });
  const optList: Record<Key, string[]> = { manufacturer: options?.manufacturers ?? [], model: options?.models ?? [], registration: options?.registrations ?? [], msn: options?.msns ?? [], operator: options?.operators ?? [], owner: options?.owners ?? [], aircraftType: options?.aircraftTypes ?? [] };
  const KPIS: [string, string, string, string][] = [
    ["Total Airlines", data ? nf(data.airlines) : "", data ? String(data.airlines) : "", "kpi-airlines"],
    ["Total Aircraft", data ? nf(data.aircraft) : "", data ? `${data.aircraft} distinct MSNs (including blank); not the table entry count` : "", "kpi-aircraft"],
    ["Total Models", data ? nf(data.models) : "", data ? String(data.models) : "", "kpi-models"],
    ["Total Manufacturers", data ? nf(data.manufacturers) : "", data ? String(data.manufacturers) : "", "kpi-manufacturers"],
    ["Total Owners", data ? nf(data.owners) : "", data ? String(data.owners) : "", "kpi-owners"],
    ["Total Flight Hours (LTM)", data ? compact(data.totalHoursLtm) : "", data ? `${data.totalHoursLtm.toLocaleString("en-US", { maximumFractionDigits: 6 })} (sum of all matching monthly source rows)` : "", "kpi-hours"],
    ["Total Flight Cycles (LTM)", data ? compact(data.totalCyclesLtm) : "", data ? `${data.totalCyclesLtm.toLocaleString("en-US", { maximumFractionDigits: 6 })} (sum of all matching monthly source rows)` : "", "kpi-cycles"],
    ["Avg FH/FC Ratio (LTT)", data ? (data.avgRatio == null ? "" : data.avgRatio.toFixed(2)) : "", data?.avgRatio != null ? String(data.avgRatio) : "No ratio in view", "kpi-ratio"],
  ];
  const GKPIS: [string, string, string, string][] = [
    KPIS[0], KPIS[1], KPIS[2], KPIS[3], KPIS[4],
    ["Avg Flight Cycles (LTM)", data ? (data.avgCyclesLtm == null ? "" : k2(data.avgCyclesLtm)) : "", data ? (data.avgCyclesLtm == null ? "No LTM cycles in view" : `${data.avgCyclesLtm.toLocaleString("en-US", { maximumFractionDigits: 5 })} mean FLIGHT_CYCLES LTM per monthly source observation`) : "", "kpi-avg-cycles"],
    ["Avg Flight Hours (LTM)", data ? compact(data.totalHoursLtm) : "", data ? `${data.totalHoursLtm.toLocaleString("en-US", { maximumFractionDigits: 2 })}. Label kept from the original report; this value is the SUM of LTM flight hours across matching monthly observations, not a true average.` : "", "kpi-avg-hours"],
  ];
  const shownKpis = view === "graphs" ? GKPIS : KPIS;
  const error = oq.isError || q.isError;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <nav className="thin-scroll flex overflow-x-auto border-b border-border bg-sidebar print:hidden" aria-label="Modules">
        {MODULES.map((m) => m === "Aircraft Registry" ? (
          <div key={m} aria-current="page" data-testid="nav-aircraft-registry" className="relative flex min-w-[110px] flex-1 items-center justify-center bg-primary px-3 py-2.5 text-center text-[13px] font-semibold leading-tight text-primary-foreground">{m}</div>
        ) : NAV[m] ? (
          <Link key={m} href={NAV[m]} data-testid={`nav-${slug(m)}`} className="flex min-w-[110px] flex-1 items-center justify-center border-r border-border/60 px-3 py-2.5 text-center text-[13px] font-medium leading-tight text-sidebar-foreground transition-colors hover:bg-primary/20 focus-visible:bg-primary/20 focus-visible:outline-none">{m}</Link>
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-1">
            {options ? KEYS.map((k) => (
              <SingleSelect key={k} id={k} label={LABEL[k]} options={optList[k]} value={f[k]} onChange={(v) => set({ [k]: v })} />
            )) : [0, 1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-11" />)}
          </div>
          <button data-testid="button-clear-filters" disabled={!active.length} onClick={() => setF(EMPTY)} className="flex h-7 items-center justify-center gap-1.5 rounded-[3px] border border-border bg-card text-[12px] font-medium transition-colors hover:border-primary focus-visible:border-primary focus-visible:outline-none disabled:opacity-50 print:hidden">
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
              <h1 className="text-[15px] font-semibold leading-tight">AE<span className="text-primary">+</span> Data Analytics <span className="font-normal text-muted-foreground">/ Aircraft Registry</span></h1>
            </div>
            <div className="flex items-center gap-1.5 print:hidden">
              <div className="relative" ref={menuRef}>
                <div className="flex h-[26px] items-center overflow-hidden rounded-[4px] bg-foreground/10 text-[12px]">
                  <button data-testid="button-refresh" onClick={refresh} disabled={fetching} className="flex h-full items-center gap-1 px-2 hover:bg-foreground/10 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${spin ? "animate-spin" : ""}`} /> Refresh</button>
                  <div className="h-4 w-px bg-foreground/20" />
                  <button data-testid="button-auto-refresh" aria-expanded={menu} aria-label="Auto refresh options" onClick={() => setMenu((o) => !o)} className="flex h-full items-center gap-1 px-1.5 hover:bg-foreground/10">{interval && <span className="text-[10px] text-primary">AUTO</span>}<ChevronDown className="h-3.5 w-3.5" /></button>
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
                  {a.label}<X className="h-3 w-3 opacity-60 group-hover:opacity-100" />
                </button>
              ))}
            </div>
          )}

          {error ? (
            <div className="panel flex flex-col items-center justify-center gap-3 rounded-[3px] border border-border bg-card px-6 py-16 text-center">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              <div className="text-[14px] font-semibold">Registry data could not be loaded</div>
              <p className="max-w-md text-[12px] text-muted-foreground">The server did not return the AIRCRAFT_REGISTRY_FLEET_DATA_FINAL summary. Check the API service, then retry.</p>
              <button data-testid="button-retry" onClick={() => { oq.refetch(); q.refetch(); }} className="rounded-[3px] bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:opacity-90">Retry</button>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2 xl:flex-row xl:items-stretch">
                <button data-testid={view === "graphs" ? "button-back" : "button-toggle-view"} aria-pressed={view === "graphs"} onClick={() => setView(view === "table" ? "graphs" : "table")}
                  className="flex h-9 shrink-0 items-center justify-center gap-1.5 self-start rounded-[3px] bg-primary px-5 text-[12px] font-semibold uppercase tracking-[0.08em] text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring print:hidden xl:mt-3 xl:w-[110px]">
                  {view === "table" ? <><BarChart3 className="h-3.5 w-3.5" /> Graphs</> : <><ArrowLeft className="h-3.5 w-3.5" /> Back</>}
                </button>
                <div className={`grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4 ${view === "graphs" ? "xl:grid-cols-7" : "2xl:grid-cols-8"}`}>
                  {shownKpis.map(([l, v, full, id]) => (
                    <Tooltip key={id}>
                      <TooltipTrigger asChild>
                        <div tabIndex={0} className="panel rounded-[3px] bg-card px-3 py-2 outline-none transition-colors hover:bg-primary/10 focus-visible:ring-1 focus-visible:ring-ring">
                          {!data ? <Skeleton className="h-6 w-16" /> : <div data-testid={id} className={`text-[20px] font-semibold leading-tight tnum transition-opacity ${q.isFetching ? "opacity-60" : ""}`}>{v}</div>}
                          <div className="text-[11px] text-muted-foreground">{l}</div>
                        </div>
                      </TooltipTrigger>
                      {full && <TooltipContent>{full}</TooltipContent>}
                    </Tooltip>
                  ))}
                </div>
              </div>

              {view === "graphs" ? (
                data && data.sourceRows === 0 ? (
                  <div className="panel rounded-[3px] border border-dashed border-border bg-card px-6 py-14 text-center" data-testid="empty-filtered">
                    <div className="text-[14px] font-semibold">No registry rows match these filters</div>
                    <button onClick={() => setF(EMPTY)} className="mt-3 rounded-[3px] bg-primary px-3 py-1.5 text-[12px] text-primary-foreground">Clear all filters</button>
                  </div>
                ) : <RegistryGraphs data={data} selected={f} onPick={(k, v) => pick(k, v)} onPickPair={pickPair}
                    table={<RegistryTable key="graphs" variant="graphs" filters={params} enabled={!!options} interval={interval} />} />
              ) : (
                <RegistryTable key="table" filters={params} enabled={!!options} interval={interval} />
              )}

              {options && (
                <details className="panel rounded-[3px] bg-card px-3 py-2 text-[11px] text-muted-foreground" data-testid="source-notes">
                  <summary className="cursor-pointer font-semibold text-foreground">Source notes and definitions</summary>
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                    <li>Imported snapshot of {options.source} covering {monthYear(options.from)} to {monthYear(options.to)} ({nf(options.sourceRows)} monthly source rows); not a live feed. All months are included.</li>
                    <li>Total Aircraft counts distinct MSNs (blank MSN counted as one category). It is not the number of table entries.</li>
                    <li>The table is not every monthly source row: repeated monthly observations with identical displayed attributes are collapsed to one entry with the latest update; entries whose attributes differ remain separate.</li>
                    <li>Total Flight Hours and Cycles (LTM) sum every matching monthly source row, matching the original report. They are not a deduplicated current-fleet annual total.</li>
                    <li>Owner, model and operator/model graphs rank distinct MSNs (top {data?.rankingLimit ?? 250}); counts are non-additive. Manufacturer donut and Total Models by Manufacturer bars count monthly source observations, not distinct aircraft or models.</li>
                    <li>Graphs view: Avg Flight Cycles (LTM) is the mean of FLIGHT_CYCLES LTM across matching monthly observations. Avg Flight Hours (LTM) keeps the original report label but shows the sum of LTM hours.</li>
                    {options.notes.map((n) => <li key={n}>{n}</li>)}
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
                <p>This report displays an imported snapshot of aircraft registry and fleet data{options ? ` (${options.source})` : ""}. It is not a live data feed.</p>
                <p>Registry attributes and utilisation figures are shown as reported, including blanks.</p>
                <p>The information is provided for general analysis only and does not constitute financial, investment or legal advice.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}
