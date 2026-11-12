import { useEffect, useMemo, useRef, useState } from "react";
import { initialAssistantFilters, applyStringFilters } from "@/lib/assistant-filters";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useGetEmissions, getGetEmissionsQueryKey, useGetEmissionsOptions, getGetEmissionsOptionsQueryKey } from "@workspace/api-client-react";
import type { GetEmissionsParams } from "@workspace/api-client-react";
import { AlertTriangle, Check, ChevronDown, Info, Moon, Printer, RefreshCw, RotateCcw, Sun, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { SingleSelect } from "@/components/single-select";
import { EmissionsRanking } from "@/components/emissions-ranking";
import { EmissionsTable, longDate } from "@/components/emissions-table";
import { nf } from "@/lib/deliveries";

const MODULES = ["Summary", "Deliveries", "Orders", "Aircraft Utilisation", "Aviation Finance", "Airline Financials", "Market Value / Lease Rates", "Emissions", "Aircraft Registry", "Engine Profile", "Jurisdiction Risk"];
const NAV: Record<string, string> = { Summary: "/summary", "Jurisdiction Risk": "/jurisdiction-risk", "Engine Profile": "/engine-profile", Deliveries: "/deliveries", Orders: "/orders", "Aircraft Utilisation": "/aircraft-utilisation", "Aviation Finance": "/aviation-finance", "Airline Financials": "/airline-financials", "Market Value / Lease Rates": "/market-value-lease-rates", "Aircraft Registry": "/aircraft-registry" };
const INTERVALS = [
  { label: "Every 5 min", ms: 5 * 60_000 },
  { label: "Every 15 min", ms: 15 * 60_000 },
  { label: "Every 1 hour", ms: 60 * 60_000 },
  { label: "Every 24 hours", ms: 24 * 60 * 60_000 },
];
const iconBtn = "flex h-[26px] items-center justify-center gap-1 rounded-[4px] bg-foreground/10 px-2 text-[12px] text-foreground/85 transition-colors hover:bg-foreground/20 disabled:opacity-50";
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
type Key = "date" | "msn" | "icao" | "airline" | "engine";
type F = Record<Key, string>;
const EMPTY: F = { date: "", msn: "", icao: "", airline: "", engine: "" };
const LABEL: Record<Key, string> = { date: "Date as at", msn: "MSN", icao: "Aircraft ICAO", airline: "Airline", engine: "Engine model" };
const KEYS = Object.keys(LABEL) as Key[];
const f2 = (n: number | null | undefined) => (n == null ? "-" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

function setMeta(attr: string, key: string, content: string) {
  let m = document.querySelector(`meta[${attr}="${key}"]`);
  if (!m) { m = document.createElement("meta"); m.setAttribute(attr, key); document.head.appendChild(m); }
  m.setAttribute("content", content);
}

export default function EmissionsPage() {
  const qc = useQueryClient();
  const [interval, setIntervalMs] = useState<number | null>(null);
  const oq = useGetEmissionsOptions({ query: { queryKey: getGetEmissionsOptionsQueryKey(), refetchInterval: interval ?? false } });
  const options = oq.data;
  const [f, setF] = useState<F>(() => applyStringFilters(EMPTY, initialAssistantFilters(KEYS)));
  const set = (p: Partial<F>) => setF((o) => ({ ...o, ...p }));
  const params = useMemo<GetEmissionsParams>(() => {
    const p: GetEmissionsParams = {};
    for (const k of KEYS) if (f[k]) p[k] = f[k];
    return p;
  }, [f]);
  const q = useGetEmissions(params, { query: { queryKey: getGetEmissionsQueryKey(params), enabled: !!options, refetchInterval: interval ?? false } });
  const data = q.data;

  useEffect(() => {
    const title = "Emissions | AE+ Data Analytics";
    const desc = "Well-to-wake CO2 emissions and transport-weighted CO2 intensity per RTK by engine model, airline and MSN, with monthly aircraft-level records.";
    document.title = title;
    setMeta("name", "description", desc);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", desc);
    setMeta("property", "og:type", "website");
  }, []);
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
  const refresh = () => { qc.invalidateQueries({ queryKey: getGetEmissionsOptionsQueryKey() }); qc.invalidateQueries({ queryKey: ["/api/emissions"] }); qc.invalidateQueries({ queryKey: ["/api/emissions/records"] }); };
  const last = q.dataUpdatedAt ? new Date(q.dataUpdatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;

  const disp = (k: Key, v: string) => (v === "" ? "(Blank)" : k === "date" ? longDate(v) : v);
  const active = KEYS.filter((k) => f[k]).map((k) => ({ k, label: `${LABEL[k]}: ${disp(k, f[k])}`, clear: () => set({ [k]: "" }) }));
  const pick = (k: Key, v: string) => set({ [k]: f[k] === v ? "" : v });
  const optList: Record<Key, string[]> = { date: options?.dates ?? [], msn: options?.msns ?? [], icao: options?.icaos ?? [], airline: options?.airlines ?? [], engine: options?.engines ?? [] };
  const KPIS: [string, string, string][] = [
    ["Total Aircraft", data ? nf(data.aircraft) : "", "kpi-aircraft"],
    ["Total Engine Models", data ? nf(data.engines) : "", "kpi-engines"],
    ["Total Airlines", data ? nf(data.airlines) : "", "kpi-airlines"],
    ["Avg Flight Hours", data ? f2(data.avgHours) : "", "kpi-hours"],
    ["Avg Flight Cycles", data ? f2(data.avgCycles) : "", "kpi-cycles"],
  ];
  const error = oq.isError || q.isError;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <nav className="thin-scroll flex overflow-x-auto border-b border-border bg-sidebar print:hidden" aria-label="Modules">
        {MODULES.map((m) => m === "Emissions" ? (
          <div key={m} aria-current="page" data-testid="nav-emissions" className="relative flex min-w-[110px] flex-1 items-center justify-center bg-primary px-3 py-2.5 text-center text-[13px] font-semibold leading-tight text-primary-foreground">{m}</div>
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 lg:grid-cols-1">
            {options ? KEYS.map((k) => (
              <SingleSelect key={k} id={k} label={LABEL[k]} options={optList[k]} value={f[k]} onChange={(v) => set({ [k]: v })} display={k === "date" ? longDate : undefined} />
            )) : [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-11" />)}
          </div>
          <button data-testid="button-clear-filters" disabled={!active.length} onClick={() => setF(EMPTY)} className="flex h-7 items-center justify-center gap-1.5 rounded-[3px] border border-border bg-card text-[12px] font-medium transition-colors hover:border-primary focus-visible:border-primary focus-visible:outline-none disabled:opacity-50 print:hidden">
            <RotateCcw className="h-3 w-3" /> Clear All Filters
          </button>
          <div className="mt-auto hidden space-y-3 pt-6 lg:block">
            <div data-testid="text-powered-by">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Powered by:</div>
              <div className="mt-0.5 text-[15px] font-semibold tracking-[0.18em]">ESTUAIRE</div>
            </div>
            <div className="text-[13px] font-semibold tracking-wide">AIRLINE ECONOMICS<span className="text-primary">+</span></div>
            <button data-testid="button-disclaimer" onClick={() => setDisc(true)} className="flex items-center gap-2 text-[12px] font-medium hover:text-primary print:hidden">
              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-foreground/60"><Info className="h-3.5 w-3.5" /></span> Disclaimer
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-2 p-2 sm:p-3">
          <div className="flex flex-wrap items-start gap-2">
            <div className="mr-auto min-w-0">
              <h1 className="text-[15px] font-semibold leading-tight">AE<span className="text-primary">+</span> Data Analytics <span className="font-normal text-muted-foreground">/ Emissions</span></h1>
              <p className="text-[11px] text-muted-foreground" data-testid="text-status">
                {options ? <>Source: {options.source} &middot; {options.sheet} &middot; {nf(options.rowCount)} rows{data && <> &middot; {nf(data.recordCount)} in view</>}</> : "Loading emissions snapshot"}
                {last && <> &middot; Last refresh {last}</>}
              </p>
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
              <div className="text-[14px] font-semibold">Emissions data could not be loaded</div>
              <p className="max-w-md text-[12px] text-muted-foreground">The server did not return the EMISSIONS_ANALYSIS aggregates. Check the API service, then retry.</p>
              <button data-testid="button-retry" onClick={() => { oq.refetch(); q.refetch(); }} className="rounded-[3px] bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:opacity-90">Retry</button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:max-w-[900px] xl:grid-cols-5">
                {KPIS.map(([l, v, id]) => (
                  <div key={id} className="panel rounded-[3px] bg-card px-3 py-2">
                    {!data ? <Skeleton className="h-6 w-16" /> : <div data-testid={id} className={`text-[20px] font-semibold leading-tight tnum transition-opacity ${q.isFetching ? "opacity-60" : ""}`}>{v}</div>}
                    <div className="text-[11px] text-muted-foreground">{l}</div>
                  </div>
                ))}
              </div>

              {data && data.recordCount === 0 ? (
                <div className="panel rounded-[3px] border border-dashed border-border bg-card px-6 py-14 text-center" data-testid="empty-filtered">
                  <div className="text-[14px] font-semibold">No emissions records match these filters</div>
                  <p className="mt-1 text-[12px] text-muted-foreground">This date, MSN, ICAO, airline and engine combination has no rows. Remove a filter.</p>
                  <button onClick={() => setF(EMPTY)} className="mt-3 rounded-[3px] bg-primary px-3 py-1.5 text-[12px] text-primary-foreground">Clear all filters</button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  <EmissionsRanking title="Engine Model" id="engine" rows={data?.engineRanking} limit={data?.rankingLimit} selected={f.engine} onPick={(v) => pick("engine", v)} />
                  <EmissionsRanking title="Airline" id="airline" rows={data?.airlineRanking} limit={data?.rankingLimit} selected={f.airline} onPick={(v) => pick("airline", v)} />
                  <EmissionsRanking title="MSN" id="msn" rows={data?.msnRanking} limit={data?.rankingLimit} selected={f.msn} onPick={(v) => pick("msn", v)} />
                </div>
              )}

              <EmissionsTable filters={params} enabled={!!options} interval={interval} />

              {options && (
                <details className="panel rounded-[3px] bg-card px-3 py-2 text-[11px] text-muted-foreground" data-testid="source-notes">
                  <summary className="cursor-pointer font-semibold text-foreground">Source notes and definitions</summary>
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                    <li>Imported snapshot of {options.source}, sheet {options.sheet}; not a live feed. Date as at selects one exact monthly snapshot; All spans every snapshot.</li>
                    <li>Rankings show CO2 intensity in gCO2e per revenue tonne-kilometre, transport-weighted across records (not an arithmetic average of row values). Top {data?.rankingLimit ?? 250} per dimension; blank names are omitted.</li>
                    <li>WTW = well-to-wake. Blank measures are left blank in the table; reported zeros are shown as 0.</li>
                    {options.notes.map((n) => <li key={n}>{n}</li>)}
                  </ul>
                </details>
              )}
            </>
          )}
          <div className="pt-1 text-[11px] text-muted-foreground lg:hidden">Powered by ESTUAIRE &middot; AIRLINE ECONOMICS<span className="text-primary">+</span></div>
        </main>
      </div>

      <Dialog open={disc} onOpenChange={setDisc}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Disclaimer</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-[13px] leading-relaxed">
                <p>This report displays an imported snapshot of aircraft emissions estimates{options ? ` (${options.source}, sheet ${options.sheet})` : ""}, powered by ESTUAIRE. It is not a live data feed.</p>
                <p>Emissions and intensity figures are modelled estimates and are shown as reported, including blanks.</p>
                <p>The information is provided for general analysis only and does not constitute financial, investment, environmental or legal advice.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}
