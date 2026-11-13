import { useEffect, useMemo, useRef, useState } from "react";
import { initialAssistantFilters, applyStringFilters, isIsoDate } from "@/lib/assistant-filters";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAssistantModule } from "@/lib/assistant-controller";
import { useGetSummaryOptions, getGetSummaryOptionsQueryKey, useGetSummary, getGetSummaryQueryKey } from "@workspace/api-client-react";
import type { SummaryShortcut } from "@workspace/api-client-react";
import { AlertTriangle, Check, ChevronDown, ExternalLink, Info, Printer, RefreshCw, RotateCcw } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DisclaimerText, DISCLAIMER_TITLE } from "@/components/disclaimer-text";
import { Skeleton } from "@/components/ui/skeleton";
import { SingleSelect } from "@/components/single-select";
import { JurisdictionRiskMap } from "@/components/jurisdiction-risk-map";
import { COL_CAT, COL_COUNTRY, COL_DEREG, COL_REPO, CountryTable } from "@/components/jurisdiction-risk-tables";
import { EngineTable, FinanceTable, IntensityBars, ManufacturerColumns, ManufacturerDonut, RegionBars } from "@/components/summary-panels";
import { SummaryTable } from "@/components/summary-table";
import { FeedbackButton } from "@/components/feedback-button";
import { SUMMARY_COLORS, fmt2, fmtCompact, fmtFull, fmtInt, summaryParams, type SummaryFilterState } from "@/lib/summary";

const MODULES = ["Summary", "Deliveries", "Orders", "Aircraft Utilisation", "Aviation Finance", "Airline Financials", "Market Value / Lease Rates", "Emissions", "Aircraft Registry", "Engine Profile", "Jurisdiction Risk"];
const NAV: Record<string, string> = { Summary: "/summary", "Jurisdiction Risk": "/jurisdiction-risk", "Engine Profile": "/engine-profile", Deliveries: "/deliveries", Orders: "/orders", "Aircraft Utilisation": "/aircraft-utilisation", "Aviation Finance": "/aviation-finance", "Airline Financials": "/airline-financials", "Market Value / Lease Rates": "/market-value-lease-rates", Emissions: "/emissions", "Aircraft Registry": "/aircraft-registry" };
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
const EMPTY = { country: "", airline: "", model: "", manufacturer: "", aircraftModel: "" };
const RISK_W = "minmax(0,1.3fr) minmax(0,1fr) minmax(0,1fr) minmax(0,0.7fr)";

export default function SummaryPage() {
  const qc = useQueryClient();
  const [interval, setIntervalMs] = useState<number | null>(null);
  const oq = useGetSummaryOptions({ query: { queryKey: getGetSummaryOptionsQueryKey(), refetchInterval: interval ?? false } });
  const options = oq.data;

  useEffect(() => {
    const t = "Summary | AE+ Data Analytics";
    const d = "Cross-source aviation overview: fleet KPIs, orders and deliveries by region and manufacturer, CO2 intensity, engine codes, airline financials and repossession scores.";
    document.title = t;
    setMeta("name", "description", d); setMeta("property", "og:title", t); setMeta("property", "og:description", d); setMeta("property", "og:type", "website");
  }, []);

  const [assistantInit] = useState(() => initialAssistantFilters(["from", "to", "country", "airline", "model", "manufacturer", "aircraftModel"] as const));
  const [dates, setDates] = useState<{ from?: string; to?: string } | null>(() => {
    // A single supplied bound is combined with the canonical default for the other once options load.
    const d: { from?: string; to?: string } = {};
    if (isIsoDate(assistantInit.from)) d.from = assistantInit.from;
    if (isIsoDate(assistantInit.to)) d.to = assistantInit.to;
    return d.from || d.to ? d : null;
  });
  const [sel, setSel] = useState(() => applyStringFilters(EMPTY, assistantInit));
  const from = dates?.from ?? options?.defaultFrom ?? "";
  const to = dates?.to ?? options?.defaultTo ?? "";
  const state: SummaryFilterState = { from, to, ...sel };
  const stateKey = JSON.stringify(state);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const params = useMemo(() => summaryParams(state), [stateKey]);
  const set = (k: keyof typeof EMPTY, v: string) => setSel((s) => ({ ...s, [k]: v }));
  const dq = useGetSummary(params, { query: { queryKey: getGetSummaryQueryKey(params), enabled: !!options, refetchInterval: interval ?? false, placeholderData: (p) => p } });
  const dash = dq.data;
  const loading = !dash;

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
  const [shortcut, setShortcut] = useState<SummaryShortcut | null>(null);
  const refresh = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/summary") });
  const dirty = !!dates || Object.values(sel).some(Boolean);
  const reset = () => { setDates(null); setSel(EMPTY); };
  useAssistantModule("summary", {
    ready: !!options,
    filters: { from, to, ...sel },
    apply: (s) => {
      const d: { from?: string; to?: string } = {};
      if (s.from && isIsoDate(s.from) && s.from !== options?.defaultFrom) d.from = s.from;
      if (s.to && isIsoDate(s.to) && s.to !== options?.defaultTo) d.to = s.to;
      setDates(d.from || d.to ? d : null);
      setSel({ country: s.country ?? "", airline: s.airline ?? "", model: s.model ?? "", manufacturer: s.manufacturer ?? "", aircraftModel: s.aircraftModel ?? "" });
    },
  });

  const countryName = useMemo(() => new Map((options?.countries ?? []).map((c) => [c.id, c.name])), [options]);
  const countryIds = useMemo(() => (options?.countries ?? []).map((c) => c.id), [options]);
  const riskRows = dash?.riskRows ?? [];
  const selectedRisk = useMemo(() => (sel.country ? riskRows.filter((r) => r.alpha3 === sel.country).map((r) => r.country) : []), [riskRows, sel.country]);
  const toggleRiskCountry = (name: string) => {
    const row = riskRows.find((r) => r.country === name);
    const id = row && countryName.has(row.alpha3) ? row.alpha3 : null;
    if (!id) return;
    set("country", sel.country === id ? "" : id);
  };

  const k = dash?.kpis;
  const kpis = [
    { id: "airlines", l: "Total Airlines", v: fmtInt(k?.airlines), tip: "Distinct fleet operators in the filtered snapshot months." },
    { id: "aircraft", l: "Total Aircraft", v: fmtInt(k?.aircraft), tip: "Distinct MSNs in the filtered fleet snapshot." },
    { id: "models", l: "Total Models", v: fmtInt(k?.models), tip: "Distinct fleet ICAO aircraft models." },
    { id: "hours", l: "Total Flight Hours (LTM)", v: fmtCompact(k?.hoursLtm), tip: `Sum of LTM hours over ${fmtInt(k?.sourceRows)} source rows across all selected months: ${fmtFull(k?.hoursLtm)}` },
    { id: "cycles", l: "Total Flight Cycles (LTM)", v: fmtCompact(k?.cyclesLtm), tip: `Sum of LTM cycles across all selected months: ${fmtFull(k?.cyclesLtm)}` },
    { id: "ratio", l: "Avg FH/FC Ratio (LTM)", v: fmt2(k?.avgRatio), tip: `Average source FH/FC ratio: ${fmtFull(k?.avgRatio)}` },
  ];

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <nav className="thin-scroll flex overflow-x-auto border-b border-border bg-sidebar print:hidden" aria-label="Modules">
        {MODULES.map((m) => m === "Summary" ? (
          <div key={m} data-testid="nav-summary" className="relative flex min-w-[110px] flex-1 items-center justify-center bg-primary px-3 py-2.5 text-center text-[13px] font-semibold leading-tight text-primary-foreground">{m}</div>
        ) : (
          <Link key={m} href={NAV[m]} data-testid={`nav-${slug(m)}`} className="flex min-w-[110px] flex-1 items-center justify-center border-r border-border/60 px-3 py-2.5 text-center text-[13px] font-medium leading-tight text-sidebar-foreground transition-colors hover:bg-primary/20">{m}</Link>
        ))}
      </nav>

      <div className="flex flex-col lg:flex-row">
        <aside className="flex w-full shrink-0 flex-col gap-3 border-b border-border bg-sidebar/60 p-3 lg:min-h-[calc(100dvh-44px)] lg:w-[200px] lg:border-b-0 lg:border-r">
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Date range</div>
            {options ? (
              <div className="grid grid-cols-2 gap-1 lg:grid-cols-1">
                <input type="date" data-testid="input-from" aria-label="From date" value={from} max={to} onChange={(e) => e.target.value && setDates({ from: e.target.value, to })} className="h-7 rounded-[3px] border border-input bg-card px-1.5 text-[12px]" />
                <input type="date" data-testid="input-to" aria-label="To date" value={to} min={from} onChange={(e) => e.target.value && setDates({ from, to: e.target.value })} className="h-7 rounded-[3px] border border-input bg-card px-1.5 text-[12px]" />
              </div>
            ) : <Skeleton className="h-7" />}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {options ? (
              <>
                <SingleSelect id="country" label="Country" options={countryIds} value={sel.country} onChange={(v) => set("country", v)} display={(v) => countryName.get(v) ?? v} />
                <SingleSelect id="airline" label="Airline" options={options.airlines} value={sel.airline} onChange={(v) => set("airline", v)} />
                <SingleSelect id="model" label="Model (orders / deliveries)" options={options.models} value={sel.model} onChange={(v) => set("model", v)} />
                <SingleSelect id="manufacturer" label="Manufacturer" options={options.manufacturers} value={sel.manufacturer} onChange={(v) => set("manufacturer", v)} />
                <SingleSelect id="aircraft-model" label="Aircraft Model (fleet ICAO)" options={options.aircraftModels} value={sel.aircraftModel} onChange={(v) => set("aircraftModel", v)} />
              </>
            ) : [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-11" />)}
          </div>
          <button data-testid="button-clear-filters" disabled={!dirty} onClick={reset} className="flex h-7 items-center justify-center gap-1.5 rounded-[3px] border border-border bg-card text-[12px] font-medium transition-colors hover:border-primary disabled:opacity-50 print:hidden">
            <RotateCcw className="h-3 w-3" /> Clear All Filters
          </button>
          <FeedbackButton />
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
              <h1 className="text-[15px] font-semibold leading-tight">AE<span className="text-primary">+</span> Data Analytics <span className="font-normal text-muted-foreground">/ Summary</span></h1>
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
              <button onClick={() => setDisc(true)} className={`${iconBtn} lg:hidden`} aria-label="Disclaimer"><Info className="h-3.5 w-3.5" /></button>
            </div>
          </div>

          {oq.isError || dq.isError ? (
            <div className="panel flex flex-col items-center justify-center gap-3 rounded-[3px] border border-border bg-card px-6 py-16 text-center">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              <div className="text-[14px] font-semibold">Summary data could not be loaded</div>
              <p className="max-w-md text-[12px] text-muted-foreground">The server did not return the cross-source summary. Check the API service, then retry.</p>
              <button data-testid="button-retry" onClick={() => { oq.refetch(); dq.refetch(); }} className="rounded-[3px] bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:opacity-90">Retry</button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-2 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-6">
                  {kpis.map((x) => (
                    <Tooltip key={x.id}>
                      <TooltipTrigger asChild>
                        <div tabIndex={0} className="panel cursor-help rounded-[3px] bg-card px-3 py-2 outline-none focus-visible:ring-1 focus-visible:ring-ring">
                          {loading ? <Skeleton className="h-6 w-16" /> : <div data-testid={`kpi-${x.id}`} className="text-[22px] font-semibold leading-tight tnum">{x.v}</div>}
                          <div className="text-[11px] text-muted-foreground">{x.l}</div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">{x.tip}</TooltipContent>
                    </Tooltip>
                  ))}
                </div>
                <div className="grid grid-cols-2 content-start gap-2 print:hidden">
                  {options ? options.shortcuts.map((s) => s.url ? (
                    <a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer" data-testid={`shortcut-${s.id}`} className="flex items-center justify-center gap-1 rounded-[3px] px-2 py-2 text-center text-[12.5px] font-bold text-[#062b1d] transition-opacity hover:opacity-90" style={{ background: SUMMARY_COLORS.bar }}>{s.label}<ExternalLink className="h-3 w-3" /></a>
                  ) : (
                    <button key={s.id} onClick={() => setShortcut(s)} data-testid={`shortcut-${s.id}`} className="rounded-[3px] px-2 py-2 text-[12.5px] font-bold text-[#062b1d] transition-opacity hover:opacity-90" style={{ background: SUMMARY_COLORS.bar }}>{s.label}</button>
                  )) : [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9" />)}
                  {options && (
                    <button type="button" disabled title="Coming soon" data-testid="button-create-portfolio" className="flex cursor-default items-center justify-center rounded-[3px] px-2 py-2 text-center text-[12.5px] font-bold text-[#062b1d]" style={{ background: SUMMARY_COLORS.bar }}>
                      Create Portfolio
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
                <RegionBars id="delivery-regions" title={`Deliveries by region (${fmtInt(dash?.deliveries)})`} valueLabel="Total Deliveries" rows={dash?.deliveryRegions ?? []} color={SUMMARY_COLORS.delivery} loading={loading} />
                <RegionBars id="order-regions" title={`Orders by region (${fmtInt(dash?.orders)})`} valueLabel="Total Orders" rows={dash?.orderRegions ?? []} color={SUMMARY_COLORS.order} loading={loading} />
                <ManufacturerColumns rows={dash?.manufacturerVolumes ?? []} loading={loading} />
                <ManufacturerDonut rows={dash?.deliveryManufacturerShares ?? []} loading={loading} />
              </div>

              <div className="grid grid-cols-1 gap-2">
                <CountryTable id="summary-risk" title="Deregistration and repossession score by country" cols={[COL_COUNTRY, COL_DEREG, COL_REPO, COL_CAT]} widths={RISK_W} rows={riskRows} selected={selectedRisk} onToggle={toggleRiskCountry} loading={loading} fluid />
              </div>

              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.15fr]">
                <IntensityBars rows={dash?.intensities ?? []} loading={loading} limit={dash?.rankingLimit ?? 250} />
                <EngineTable rows={dash?.engines ?? []} loading={loading} />
                <FinanceTable rows={dash?.finance ?? []} year={dash?.financeYear ?? ""} sourceRows={dash?.financeRows ?? 0} loading={loading} />
              </div>

              <JurisdictionRiskMap rows={riskRows} selected={selectedRisk} onToggle={toggleRiskCountry} loading={loading} geography={dash?.riskGeography ?? ""} filteredView overview expanded />

              <SummaryTable filters={params} enabled={!!options} interval={interval} />

              {options && (
                <details className="panel rounded-[3px] bg-card px-3 py-2 text-[11px] text-muted-foreground" data-testid="source-notes">
                  <summary className="cursor-pointer font-semibold text-foreground">Source scope and definitions</summary>
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                    <li>Dates filter fleet and emissions by snapshot month, and orders/deliveries by actual event date. Default range {options.defaultFrom} to {options.defaultTo}. Jurisdiction risk has no date.</li>
                    <li>Country is the registry country, order/delivery customer country and risk country (ISO alpha-3 via verified aliases). It is not airline headquarters.</li>
                    <li>Airline matches exactly and independently: order/delivery customer, emissions airline, fleet operator and financial airline. No fuzzy joins.</li>
                    <li>Model applies only to order/delivery commercial models. Aircraft Model applies only to fleet and emissions ICAO codes. Manufacturer applies to fleet, orders/deliveries and emissions via exact fleet bridge.</li>
                    <li>Emission country, manufacturer and ICAO filters use exact month + MSN + ICAO fleet matches; unmatched rows are excluded. CO2 intensity is transport-weighted gCO2e/RTK; unavailable means missing weights, not zero emissions.</li>
                    <li>Financials use the financial year of the range end year and respond only to Airline. Amounts sum all periods, scopes and fiscal year-ends as an exploratory total in USD at source scale. Liability categories and Total Equity are shown negative for presentation; hover for the unchanged source value.</li>
                    <li>All source categories are kept, including Unidentified regions, manufacturers and engine codes. Rankings show up to {dash?.rankingLimit ?? 250} rows with full CSV export.</li>
                    {options.notes.map((n) => <li key={n}>{n}</li>)}
                  </ul>
                </details>
              )}
            </>
          )}
          <div className="pt-1 text-[11px] text-muted-foreground lg:hidden">AIRLINE ECONOMICS<span className="text-primary">+</span></div>
        </main>
      </div>

      <Dialog open={!!shortcut} onOpenChange={(o) => !o && setShortcut(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{shortcut?.label}</DialogTitle>
            <DialogDescription>This shortcut has no destination configured yet. Once a link is supplied it will open here in a new tab.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
      <Dialog open={disc} onOpenChange={setDisc}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="pr-6 text-left">{DISCLAIMER_TITLE}</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-4 text-left text-[13px] leading-relaxed">
                <DisclaimerText />
              </div>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}
