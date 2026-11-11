import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useGetJurisdictionRisk, getGetJurisdictionRiskQueryKey, useGetRegistry, getGetRegistryQueryKey } from "@workspace/api-client-react";
import { AlertTriangle, Check, ChevronDown, Info, Moon, Printer, RefreshCw, RotateCcw, Sun, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { MultiSelect } from "@/components/multi-select";
import { JurisdictionRiskMap } from "@/components/jurisdiction-risk-map";
import { COL_CAT, COL_COUNTRY, COL_DEREG, COL_REGION, COL_REPO, COL_TYPE, CountryTable } from "@/components/jurisdiction-risk-tables";
import { EMPTY_JURISDICTION_FILTERS, JURISDICTION_DIMS, filterJurisdictions, prettyRegion, prettyType, summarizeJurisdictions, type JurisdictionFilterKey, type JurisdictionFilters } from "@/lib/jurisdiction-risk";

const MODULES = ["Summary", "Deliveries", "Orders", "Aircraft Utilisation", "Aviation Finance", "Airline Financials", "Market Value / Lease Rates", "Emissions", "Aircraft Registry", "Engine Profile", "Jurisdiction Risk"];
const NAV: Record<string, string> = { Summary: "/summary", "Engine Profile": "/engine-profile", Deliveries: "/deliveries", Orders: "/orders", "Aircraft Utilisation": "/aircraft-utilisation", "Aviation Finance": "/aviation-finance", "Airline Financials": "/airline-financials", "Market Value / Lease Rates": "/market-value-lease-rates", Emissions: "/emissions", "Aircraft Registry": "/aircraft-registry" };
const INTERVALS = [
  { label: "Every 5 min", ms: 5 * 60_000 },
  { label: "Every 15 min", ms: 15 * 60_000 },
  { label: "Every 1 hour", ms: 60 * 60_000 },
  { label: "Every 24 hours", ms: 24 * 60 * 60_000 },
];
const iconBtn = "flex h-[26px] items-center justify-center gap-1 rounded-[4px] bg-foreground/10 px-2 text-[12px] text-foreground/85 transition-colors hover:bg-foreground/20 disabled:opacity-50";
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const uniq = (a: string[]) => [...new Set(a)].sort((x, y) => x.localeCompare(y));
const LABEL: Record<JurisdictionFilterKey, string> = { country: "Country", jurisdictionType: "Jurisdiction Type", region: "Region", repossessionCategory: "Rep Category", lawCompliance: "Law Compliance" };
const FMT: Partial<Record<JurisdictionFilterKey, (v: string) => string>> = { jurisdictionType: prettyType, region: prettyRegion };
const fmtVal = (d: JurisdictionFilterKey, v: string) => (v === "" ? "(Blank)" : (FMT[d] ?? ((x: string) => x))(v));
const setMeta = (attr: "name" | "property", key: string, content: string) => {
  let m = document.querySelector(`meta[${attr}="${key}"]`);
  if (!m) { m = document.createElement("meta"); m.setAttribute(attr, key); document.head.appendChild(m); }
  m.setAttribute("content", content);
};

const W1 = "minmax(120px,1.3fr) minmax(110px,1fr)";
const W2 = "minmax(120px,1.4fr) minmax(80px,0.8fr) minmax(90px,0.9fr)";
const W3 = "minmax(120px,1.3fr) minmax(110px,1fr) 70px";

export default function JurisdictionRiskPage() {
  const qc = useQueryClient();
  const [interval, setIntervalMs] = useState<number | null>(null);
  const q = useGetJurisdictionRisk({ query: { queryKey: getGetJurisdictionRiskQueryKey(), refetchInterval: interval ?? false } });
  const reg = useGetRegistry({}, { query: { queryKey: getGetRegistryQueryKey({}), refetchInterval: interval ?? false } });
  const ds = q.data;
  const rows = useMemo(() => ds?.rows ?? [], [ds]);
  const loading = q.isLoading;

  useEffect(() => {
    const t = "Jurisdiction Risk | AE+ Data Analytics";
    const d = "Compare aircraft repossession and deregistration conditions across 116 jurisdictions: scores, source categories, legal system and region, mapped by country.";
    document.title = t;
    setMeta("name", "description", d);
    setMeta("property", "og:title", t);
    setMeta("property", "og:description", d);
    setMeta("property", "og:type", "website");
  }, []);
  const [isDark, setDark] = useState(() => localStorage.getItem("ae-theme") !== "light");
  useEffect(() => { document.documentElement.classList.toggle("dark", isDark); localStorage.setItem("ae-theme", isDark ? "dark" : "light"); }, [isDark]);
  const [spin, setSpin] = useState(false);
  useEffect(() => { if (q.isFetching || reg.isFetching) { setSpin(true); return undefined; } const t = setTimeout(() => setSpin(false), 600); return () => clearTimeout(t); }, [q.isFetching]);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);
  const [disc, setDisc] = useState(false);
  const refresh = () => { qc.invalidateQueries({ queryKey: getGetJurisdictionRiskQueryKey() }); qc.invalidateQueries({ queryKey: getGetRegistryQueryKey({}) }); };
  const last = q.dataUpdatedAt ? new Date(q.dataUpdatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;

  const [f, setF] = useState<JurisdictionFilters>(EMPTY_JURISDICTION_FILTERS);
  const set = (p: Partial<JurisdictionFilters>) => setF((o) => ({ ...o, ...p }));
  const toggle = (d: JurisdictionFilterKey, v: string) => setF((o) => ({ ...o, [d]: o[d].includes(v) ? o[d].filter((x) => x !== v) : [...o[d], v] }));
  const toggleCountry = (c: string) => toggle("country", c);
  const filtered = useMemo(() => filterJurisdictions(rows, f), [rows, f]);
  const opts = useMemo(() => Object.fromEntries(JURISDICTION_DIMS.map((d) => [d, uniq(rows.map((r) => r[d]))])) as Record<JurisdictionFilterKey, string[]>, [rows]);
  const sum = useMemo(() => summarizeJurisdictions(filtered), [filtered]);
  const active = JURISDICTION_DIMS.flatMap((d) => f[d].map((v) => ({ k: `${d}-${v}`, label: `${LABEL[d]}: ${fmtVal(d, v)}`, clear: () => toggle(d, v) })));
  const models = reg.data?.models;

  type Kpi = { l: string; v: string; id: string; tip: string; load: boolean; extra?: ReactNode };
  const kpis: Kpi[] = [
    { l: "Number of Countries", v: String(sum.countries), id: "kpi-countries", tip: "Distinct jurisdictions (source country labels) in the filtered selection.", load: loading },
    { l: "Number of Regions", v: String(sum.regions), id: "kpi-regions", tip: "Distinct regions in the filtered selection.", load: loading },
    { l: "Total Models", v: models != null ? String(models) : "", id: "kpi-models", load: reg.isLoading,
      tip: "Fleet context: distinct aircraft models across the whole Aircraft Registry dataset. This global metric is not part of the jurisdiction sheet and does NOT change with jurisdiction filters.",
      extra: reg.isError ? (
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">Unavailable <button data-testid="button-retry-models" onClick={(e) => { e.stopPropagation(); reg.refetch(); }} className="text-primary hover:underline">Retry</button></span>
      ) : <span className="text-[9.5px] font-semibold uppercase tracking-wide text-primary">Fleet context, unfiltered</span> },
    { l: "Total of contributors", v: String(sum.contributors), id: "kpi-contributors", tip: "Distinct contributor reference IDs across the filtered countries (not a row count).", load: loading },
    { l: "Avg Repossession Overall Score", v: sum.avgRepossessionOverall == null ? "" : sum.avgRepossessionOverall.toFixed(2), id: "kpi-avg-repossession", load: loading,
      tip: sum.avgRepossessionOverall == null ? "No non-blank repossession overall scores in the selection." : `Mean of source repossession_overall over countries with a score: ${sum.avgRepossessionOverall}` },
    { l: "Avg Deregistration Score", v: sum.avgDeregistration == null ? "" : sum.avgDeregistration.toFixed(1), id: "kpi-avg-deregistration", load: loading,
      tip: sum.avgDeregistration == null ? "No non-blank deregistration scores in the selection." : `Mean of source deregistration score over countries with a score: ${sum.avgDeregistration}` },
  ];

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <nav className="thin-scroll flex overflow-x-auto border-b border-border bg-sidebar print:hidden" aria-label="Modules">
        {MODULES.map((m) => m === "Jurisdiction Risk" ? (
          <div key={m} data-testid="nav-jurisdiction-risk" className="relative flex min-w-[110px] flex-1 items-center justify-center bg-primary px-3 py-2.5 text-center text-[13px] font-semibold leading-tight text-primary-foreground" style={{ clipPath: "polygon(6px 0, calc(100% - 6px) 0, 100% 100%, 0 100%)" }}>{m}</div>
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
            {ds ? JURISDICTION_DIMS.map((d) => (
              <MultiSelect key={d} id={slug(d)} label={LABEL[d]} options={opts[d]} value={f[d]} onChange={(v) => set({ [d]: v })} format={FMT[d]} />
            )) : [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-11" />)}
          </div>
          <button data-testid="button-clear-filters" disabled={!active.length} onClick={() => setF(EMPTY_JURISDICTION_FILTERS)} className="flex h-7 items-center justify-center gap-1.5 rounded-[3px] border border-border bg-card text-[12px] font-medium transition-colors hover:border-primary disabled:opacity-50 print:hidden">
            <RotateCcw className="h-3 w-3" /> Clear All Filters
          </button>
          <div className="mt-auto hidden space-y-3 pt-6 lg:block">
            <div className="text-[11px] text-muted-foreground" data-testid="text-powered-by">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em]">Powered by:</div>
              <div className="text-[13px] font-bold tracking-[0.15em] text-foreground">GARI</div>
              <div className="leading-tight">Reference attribution; imported workbook snapshot</div>
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
              <h1 className="text-[15px] font-semibold leading-tight">AE<span className="text-primary">+</span> Data Analytics <span className="font-normal text-muted-foreground">/ Jurisdiction Risk</span></h1>
              <p className="text-[11px] text-muted-foreground" data-testid="text-status">
                {ds ? <>Source: {ds.source} &middot; {ds.sheet} &middot; {rows.length} jurisdictions</> : "Loading jurisdiction snapshot"}
                {last && <> &middot; Last refresh {last}</>}
              </p>
            </div>
            <div className="flex items-center gap-1.5 print:hidden">
              <div className="relative" ref={menuRef}>
                <div className="flex h-[26px] items-center overflow-hidden rounded-[4px] bg-foreground/10 text-[12px]">
                  <button data-testid="button-refresh" onClick={refresh} disabled={q.isFetching || reg.isFetching} className="flex h-full items-center gap-1 px-2 hover:bg-foreground/10 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${spin ? "animate-spin" : ""}`} /> Refresh</button>
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
              <button onClick={() => setF(EMPTY_JURISDICTION_FILTERS)} className="px-1 text-[11px] text-primary hover:underline">Clear all</button>
            </div>
          )}

          {q.isError ? (
            <div className="panel flex flex-col items-center justify-center gap-3 rounded-[3px] border border-border bg-card px-6 py-16 text-center">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              <div className="text-[14px] font-semibold">Jurisdiction risk data could not be loaded</div>
              <p className="max-w-md text-[12px] text-muted-foreground">The server did not return the jurisdiction dataset. Check the API service, then retry.</p>
              <button data-testid="button-retry" onClick={() => q.refetch()} className="rounded-[3px] bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:opacity-90">Retry</button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:max-w-[1100px] xl:grid-cols-6">
                {kpis.map((k) => (
                  <Tooltip key={k.id}>
                    <TooltipTrigger asChild>
                      <div tabIndex={0} className="panel cursor-help rounded-[3px] bg-card px-3 py-2 outline-none focus-visible:ring-1 focus-visible:ring-ring">
                        {k.load ? <Skeleton className="h-6 w-12" /> : <div data-testid={k.id} className="min-h-[25px] text-[20px] font-semibold leading-tight tnum">{k.v}</div>}
                        <div className="text-[11px] text-muted-foreground">{k.l}</div>
                        {k.extra}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">{k.tip}</TooltipContent>
                  </Tooltip>
                ))}
              </div>

              {!loading && filtered.length === 0 ? (
                <div className="panel rounded-[3px] border border-dashed border-border bg-card px-6 py-14 text-center" data-testid="empty-filtered">
                  <div className="text-[14px] font-semibold">No jurisdictions match these filters</div>
                  <p className="mt-1 text-[12px] text-muted-foreground">{rows.length ? "No country in the source meets every selected condition. Remove a filter." : "The dataset returned no rows."}</p>
                  {active.length > 0 && <button data-testid="button-clear-empty" onClick={() => setF(EMPTY_JURISDICTION_FILTERS)} className="mt-3 rounded-[3px] bg-primary px-3 py-1.5 text-[12px] text-primary-foreground">Clear all filters</button>}
                </div>
              ) : (
                <>
                  <JurisdictionRiskMap rows={filtered} selected={f.country} onToggle={toggleCountry} loading={loading} geography={ds?.mapGeography ?? ""} filteredView={active.length > 0} />
                  <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
                    <CountryTable id="deregistration" title="Deregistration score by country" cols={[COL_COUNTRY, COL_DEREG]} widths={W1} rows={filtered} selected={f.country} onToggle={toggleCountry} loading={loading} />
                    <CountryTable id="jurisdiction" title="Jurisdiction type and region by country" cols={[COL_COUNTRY, COL_TYPE, COL_REGION]} widths={W2} rows={filtered} selected={f.country} onToggle={toggleCountry} loading={loading} />
                    <CountryTable id="repossession" title="Repossession overall score by country" cols={[COL_COUNTRY, COL_REPO, COL_CAT]} widths={W3} rows={filtered} selected={f.country} onToggle={toggleCountry} loading={loading} />
                  </div>
                </>
              )}
              {ds && (
                <details className="panel rounded-[3px] bg-card px-3 py-2 text-[11px] text-muted-foreground" data-testid="source-notes">
                  <summary className="cursor-pointer font-semibold text-foreground">Source notes and definitions</summary>
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                    <li>Imported snapshot of {ds.source}, sheet {ds.sheet}. The "Powered by GARI" label is reference attribution from the original report; this is not a live GARI connection.</li>
                    <li>Repossession uses the source repossession_overall score. Category (high / moderate / low) is the source classification: high means a higher (better) score, not higher risk. No re-thresholding is applied.</li>
                    <li>Law Compliance is the source rule_of_law_compliance_severity field. Blank scores show as a dash and are excluded from averages; zeros are kept.</li>
                    <li>Total Models is fleet context from the Aircraft Registry dataset and does not respond to jurisdiction filters. All other KPIs, the map and the tables follow the sidebar filters.</li>
                    <li>Map markers are approximate country centroids ({ds.coordinateSource}), not aircraft locations. The bundled Natural Earth country boundaries do not require external tile services or a map API key.</li>
                    <li>Bars use a fixed 0 to 100 scale. CSV exports keep raw source values and full precision.</li>
                    {ds.notes.map((n) => <li key={n}>{n}</li>)}
                  </ul>
                </details>
              )}
            </>
          )}
          <div className="pt-1 text-[11px] text-muted-foreground lg:hidden">Powered by GARI (reference attribution) &middot; AIRLINE ECONOMICS<span className="text-primary">+</span></div>
        </main>
      </div>

      <Dialog open={disc} onOpenChange={setDisc}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Disclaimer</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-[13px] leading-relaxed">
                <p>This report displays an imported snapshot of jurisdiction scoring data{ds ? ` (${ds.source}, sheet ${ds.sheet})` : ""}. It is not a live data feed or an official GARI service.</p>
                <p>Scores and categories are shown as reported. Legal conditions change; verify with qualified local counsel before relying on them.</p>
                <p>The information is provided for general analysis only and does not constitute legal or investment advice.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}
