import { useEffect, useMemo, useRef, useState } from "react";
import { initialAssistantFilters } from "@/lib/assistant-filters";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAssistantModule } from "@/lib/assistant-controller";
import { useGetAirlineFinancialOptions, getGetAirlineFinancialOptionsQueryKey, useGetAirlineFinancials, getGetAirlineFinancialsQueryKey } from "@workspace/api-client-react";
import type { GetAirlineFinancialsParams } from "@workspace/api-client-react";
import { AlertTriangle, Check, ChevronDown, Info, Moon, Printer, RefreshCw, RotateCcw, Sun } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { SingleSelect } from "@/components/single-select";
import { AirlineFinancialsTable } from "@/components/airline-financials-table";
import { CategoryTree, StatementGenerator, Waterfall } from "@/components/airline-financials-panels";

const MODULES = ["Summary", "Deliveries", "Orders", "Aircraft Utilisation", "Aviation Finance", "Airline Financials", "Market Value / Lease Rates", "Emissions", "Aircraft Registry", "Engine Profile", "Jurisdiction Risk"];
const NAV: Record<string, string> = { Summary: "/summary", "Jurisdiction Risk": "/jurisdiction-risk", "Engine Profile": "/engine-profile", Deliveries: "/deliveries", Orders: "/orders", "Aircraft Utilisation": "/aircraft-utilisation", "Aviation Finance": "/aviation-finance", "Market Value / Lease Rates": "/market-value-lease-rates", Emissions: "/emissions", "Aircraft Registry": "/aircraft-registry" };
const INTERVALS = [
  { label: "Every 5 min", ms: 5 * 60_000 },
  { label: "Every 15 min", ms: 15 * 60_000 },
  { label: "Every 1 hour", ms: 60 * 60_000 },
  { label: "Every 24 hours", ms: 24 * 60 * 60_000 },
];
const iconBtn = "flex h-[26px] items-center justify-center gap-1 rounded-[4px] bg-foreground/10 px-2 text-[12px] text-foreground/85 transition-colors hover:bg-foreground/20 disabled:opacity-50";
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const setMeta = (attr: "name" | "property", key: string, content: string) => {
  let m = document.querySelector(`meta[${attr}="${key}"]`);
  if (!m) { m = document.createElement("meta"); m.setAttribute(attr, key); document.head.appendChild(m); }
  m.setAttribute("content", content);
};

export default function AirlineFinancialsPage() {
  const qc = useQueryClient();
  const [interval, setIntervalMs] = useState<number | null>(null);
  const oq = useGetAirlineFinancialOptions({ query: { queryKey: getGetAirlineFinancialOptionsQueryKey(), refetchInterval: interval ?? false } });
  const options = oq.data;

  useEffect(() => {
    const t = "Airline Financials | AE+ Data Analytics";
    const d = "Airline balance sheet and profit and loss reference: imported source statement lines by airline, financial year and reporting period, with metric waterfall and statement generator.";
    document.title = t;
    setMeta("name", "description", d); setMeta("property", "og:title", t); setMeta("property", "og:description", d); setMeta("property", "og:type", "website");
  }, []);
  const [isDark, setDark] = useState(() => localStorage.getItem("ae-theme") !== "light");
  useEffect(() => { document.documentElement.classList.toggle("dark", isDark); localStorage.setItem("ae-theme", isDark ? "dark" : "light"); }, [isDark]);

  const [assistantInit] = useState(() => initialAssistantFilters(["airline", "financialYear", "period", "metricIds"] as const));
  const [airline, setAirline] = useState(assistantInit.airline ?? "");
  const [year, setYear] = useState(assistantInit.financialYear ?? "");
  const [period, setPeriod] = useState<string | null>(assistantInit.period ?? null); // null = default (Yr) until options load; "" = All
  const effPeriod = period ?? options?.defaultPeriod ?? "Yr";
  const [metricIds, setMetricIds] = useState<number[]>(() => (assistantInit.metricIds ?? "").split(",").filter((x) => /^\d+$/.test(x.trim())).map(Number).filter((n) => Number.isSafeInteger(n) && n >= 0));
  const filters = useMemo<GetAirlineFinancialsParams>(() => {
    const p: GetAirlineFinancialsParams = {};
    if (airline) p.airline = airline;
    if (year) p.financialYear = year;
    if (effPeriod) p.period = effPeriod;
    if (metricIds.length) p.metricIds = metricIds.join(",");
    return p;
  }, [airline, year, effPeriod, metricIds]);
  const dq = useGetAirlineFinancials(filters, { query: { queryKey: getGetAirlineFinancialsQueryKey(filters), enabled: !!options, refetchInterval: interval ?? false } });
  const dash = dq.data;

  const fetching = oq.isFetching || dq.isFetching;
  const [spin, setSpin] = useState(false);
  useEffect(() => { if (fetching) { setSpin(true); return undefined; } const t = setTimeout(() => setSpin(false), 600); return () => clearTimeout(t); }, [fetching]);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);
  const [disc, setDisc] = useState(false);
  const [gen, setGen] = useState(false);
  const refresh = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/airline-financials") });
  const last = dq.dataUpdatedAt ? new Date(dq.dataUpdatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;
  const dirty = !!airline || !!year || effPeriod !== (options?.defaultPeriod ?? "Yr") || metricIds.length > 0;
  const reset = () => { setAirline(""); setYear(""); setPeriod(null); setMetricIds([]); };
  useAssistantModule("airline-financials", {
    ready: !!options,
    filters: { airline, financialYear: year, period: effPeriod, metricIds: metricIds.join(",") },
    apply: (s) => {
      setAirline(s.airline ?? "");
      setYear(s.financialYear ?? "");
      setPeriod(s.period === undefined ? null : s.period);
      setMetricIds((s.metricIds ?? "").split(",").map((x) => x.trim()).filter((x) => /^\d+$/.test(x)).map(Number).filter((n) => Number.isSafeInteger(n) && n >= 0));
    },
  });

  const card = (label: string, selected: string, first: string | undefined, count: number | undefined, id: string) => {
    const multi = !selected && (count ?? 0) > 1;
    const value = selected || first || "";
    return (
      <Tooltip key={id}>
        <TooltipTrigger asChild>
          <div tabIndex={0} className="panel min-w-[150px] cursor-help rounded-[3px] bg-card px-3 py-1.5 outline-none focus-visible:ring-1 focus-visible:ring-ring">
            {!dash ? <Skeleton className="h-6 w-24" /> : <div data-testid={`card-${id}`} className="truncate text-[19px] font-semibold leading-tight">{value || "\u2014"}</div>}
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">{label}{multi && <span className="rounded-[2px] bg-primary/15 px-1 text-[10px] text-primary" data-testid={`badge-${id}`}>First in view ({count})</span>}</div>
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{selected ? `Selected ${label.toLowerCase()}.` : multi ? `First alphabetical ${label.toLowerCase()} among ${count} in the filtered result. The three cards are independent labels, not one valid statement combination.` : `Only ${label.toLowerCase()} in the filtered result.`}</TooltipContent>
      </Tooltip>
    );
  };
  const mixed = dash && ((dash.airlineCount > 1) || (dash.yearCount > 1) || (dash.periodCount > 1))
    ? [dash.airlineCount > 1 && `${dash.airlineCount} airlines`, dash.yearCount > 1 && `${dash.yearCount} years`, dash.periodCount > 1 && `${dash.periodCount} periods`].filter(Boolean).join(", ") : null;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <nav className="thin-scroll flex overflow-x-auto border-b border-border bg-sidebar print:hidden" aria-label="Modules">
        {MODULES.map((m) => m === "Airline Financials" ? (
          <div key={m} data-testid="nav-airline-financials" className="relative flex min-w-[110px] flex-1 items-center justify-center bg-primary px-3 py-2.5 text-center text-[13px] font-semibold leading-tight text-primary-foreground">{m}</div>
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
          <button data-testid="button-open-generator" disabled={!options} onClick={() => setGen(true)} className="rounded-[3px] bg-[hsl(var(--chart-3))] px-2 py-2 text-[11px] font-bold uppercase leading-tight tracking-[0.03em] text-white transition-opacity hover:opacity-90 disabled:opacity-50 print:hidden">Balance Sheet and Profit &amp; Loss Generator</button>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {options ? (
              <>
                <SingleSelect id="airline" label="Airline" options={options.airlines} value={airline} onChange={setAirline} />
                <SingleSelect id="financial-year" label="Financial Year" options={options.financialYears} value={year} onChange={setYear} />
                <div>
                  <SingleSelect id="period" label="Reporting Period" options={options.periods} value={effPeriod} onChange={(v) => setPeriod(v)} />
                  {!effPeriod && <p className="mt-1 text-[10px] leading-snug text-[hsl(var(--chart-4))]" data-testid="warning-all-periods">All periods: annual, half-year and quarterly figures overlap. Do not add them together.</p>}
                </div>
              </>
            ) : [0, 1, 2].map((i) => <Skeleton key={i} className="h-11" />)}
          </div>
          <button data-testid="button-clear-filters" disabled={!dirty} onClick={reset} className="flex h-7 items-center justify-center gap-1.5 rounded-[3px] border border-border bg-card text-[12px] font-medium transition-colors hover:border-primary disabled:opacity-50 print:hidden">
            <RotateCcw className="h-3 w-3" /> Clear All Filters
          </button>
          <div className="mt-auto hidden space-y-3 pt-6 lg:block">
            <div className="text-[10px] uppercase leading-snug text-muted-foreground">Powered by Tiralis data from a user-supplied snapshot</div>
            <div className="text-[13px] font-semibold tracking-wide">AIRLINE ECONOMICS<span className="text-primary">+</span></div>
            <button data-testid="button-disclaimer" onClick={() => setDisc(true)} className="flex items-center gap-2 text-[12px] font-medium hover:text-primary print:hidden">
              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-foreground/60"><Info className="h-3.5 w-3.5" /></span> Disclaimer
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-2 p-2 sm:p-3">
          <div className="flex flex-wrap items-start gap-2">
            <div className="mr-auto min-w-0">
              <h1 className="text-[15px] font-semibold leading-tight">AE<span className="text-primary">+</span> Data Analytics <span className="font-normal text-muted-foreground">/ Airline Financials</span></h1>
              <p className="text-[11px] text-muted-foreground" data-testid="text-status">
                {options ? <>Source: {options.source} &middot; {options.sheet} &middot; {options.sourceRows.toLocaleString("en-US")} rows &middot; dated {options.sourceDate} &middot; USD (source scale)</> : "Loading airline financial snapshot"}
                {last && <> &middot; Last refresh {last}</>}
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

          {oq.isError || dq.isError ? (
            <div className="panel flex flex-col items-center justify-center gap-3 rounded-[3px] border border-border bg-card px-6 py-16 text-center">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              <div className="text-[14px] font-semibold">Airline financial data could not be loaded</div>
              <p className="max-w-md text-[12px] text-muted-foreground">The server did not return the TIRALIS_AIRLINE_FINANCIAL dataset. Check the API service, then retry.</p>
              <button data-testid="button-retry" onClick={() => { oq.refetch(); dq.refetch(); }} className="rounded-[3px] bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:opacity-90">Retry</button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {card("Airline", airline, dash?.firstAirline, dash?.airlineCount, "airline")}
                {card("Financial Year", year, dash?.firstFinancialYear, dash?.yearCount, "financial-year")}
                {card("Reporting Period", effPeriod, dash?.firstPeriod, dash?.periodCount, "period")}
              </div>
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_230px]">
                <div className="min-w-0 space-y-2">
                  <AirlineFinancialsTable filters={filters} enabled={!!options} interval={interval} />
                  <Waterfall totals={dash?.metricTotals ?? []} hasSelection={metricIds.length > 0} loading={dq.isLoading || (dq.isFetching && !dash?.metricTotals.length)} mixed={mixed} />
                </div>
                <CategoryTree metrics={options?.metrics ?? []} selected={metricIds} onChange={setMetricIds} loading={!options} />
              </div>
              {options && (
                <details className="panel rounded-[3px] bg-card px-3 py-2 text-[11px] text-muted-foreground" data-testid="source-notes">
                  <summary className="cursor-pointer font-semibold text-foreground">Source notes and definitions</summary>
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                    <li>Imported snapshot of {options.source}, sheet {options.sheet}, source date {options.sourceDate}. Powered by Tiralis data from a user-supplied snapshot; not an official or live feed.</li>
                    <li>Currency is USD. The sheet does not declare a unit multiplier, so amounts are shown at source scale and are not rescaled to thousands or millions.</li>
                    <li>Default reporting period is {options.defaultPeriod}. Selecting All periods mixes annual, half-year and quarterly lines that overlap.</li>
                    <li>Context cards show the first alphabetical value in the filtered result when several exist. They are independent labels, not a valid statement combination.</li>
                    <li>The waterfall is an exploratory sum of signed source amounts for ticked metrics. It can double count nested subtotals and is not an accounting reconciliation.</li>
                    <li>The statement generator uses actual airline / year / period / scope / fiscal year-end combinations and shows only reported lines.</li>
                    {options.notes.map((n) => <li key={n}>{n}</li>)}
                  </ul>
                </details>
              )}
            </>
          )}
          <div className="pt-1 text-[11px] text-muted-foreground lg:hidden">Powered by Tiralis (user-supplied snapshot) &middot; AIRLINE ECONOMICS<span className="text-primary">+</span></div>
        </main>
      </div>

      <StatementGenerator open={gen} onOpenChange={setGen} options={options} airline={airline || undefined} />
      <Dialog open={disc} onOpenChange={setDisc}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Disclaimer</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-[13px] leading-relaxed">
                <p>This report displays an imported snapshot of airline financial statement lines{options ? ` (${options.source}, sheet ${options.sheet})` : ""}, powered by Tiralis data supplied by the user. It is not a live or official data feed.</p>
                <p>Amounts are shown as reported in USD at source scale; no unit multiplier is declared. No totals or subtotals are calculated for statements. Verify against audited filings before relying on any figure.</p>
                <p>The information is provided for general analysis only and does not constitute financial or investment advice.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}
