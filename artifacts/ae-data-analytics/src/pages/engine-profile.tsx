import { useEffect, useMemo, useRef, useState } from "react";
import { initialAssistantFilters, one } from "@/lib/assistant-filters";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAssistantModule } from "@/lib/assistant-controller";
import { useGetEngineProfile, getGetEngineProfileQueryKey } from "@workspace/api-client-react";
import { AlertTriangle, Check, ChevronDown, Info, Printer, RefreshCw, RotateCcw, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DisclaimerText, DISCLAIMER_TITLE } from "@/components/disclaimer-text";
import { ThemeToggle, useDashboardTheme } from "@/components/theme-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { MultiSelect } from "@/components/multi-select";
import { CertificationList, EngineDetailTable, EngineDonut } from "@/components/engine-profile-charts";
import { EMPTY_ENGINE_FILTERS, certificationEntries, countBy, filterEngineProfiles, summarizeEngineProfiles, type EngineFilterKey, type EngineFilters } from "@/lib/engine-profile";

const MODULES = ["Summary", "Deliveries", "Orders", "Aircraft Utilisation", "Aviation Finance", "Airline Financials", "Market Value / Lease Rates", "Emissions", "Aircraft Registry", "Engine Profile", "Jurisdiction Risk"];
const NAV: Record<string, string> = { Summary: "/summary", "Jurisdiction Risk": "/jurisdiction-risk", Deliveries: "/deliveries", Orders: "/orders", "Aircraft Utilisation": "/aircraft-utilisation", "Aviation Finance": "/aviation-finance", "Airline Financials": "/airline-financials", "Market Value / Lease Rates": "/market-value-lease-rates", Emissions: "/emissions", "Aircraft Registry": "/aircraft-registry" };
const INTERVALS = [
  { label: "Every 5 min", ms: 5 * 60_000 },
  { label: "Every 15 min", ms: 15 * 60_000 },
  { label: "Every 1 hour", ms: 60 * 60_000 },
  { label: "Every 24 hours", ms: 24 * 60 * 60_000 },
];
const iconBtn = "flex h-[26px] items-center justify-center gap-1 rounded-[4px] bg-foreground/10 px-2 text-[12px] text-foreground/85 transition-colors hover:bg-foreground/20 disabled:opacity-50";
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const uniq = (a: string[]) => [...new Set(a)].sort((x, y) => x.localeCompare(y));
const LABEL: Record<EngineFilterKey, string> = { aircraftManufacturer: "Aircraft Manufacturer", engineManufacturer: "Engine Manufacturer", engineVariant: "Engine Variant", engineFamily: "Engine Family", aircraftType: "Aircraft Type" };
const DIMS = Object.keys(LABEL) as EngineFilterKey[];
const setMeta = (attr: "name" | "property", key: string, content: string) => {
  let m = document.querySelector(`meta[${attr}="${key}"]`);
  if (!m) { m = document.createElement("meta"); m.setAttribute(attr, key); document.head.appendChild(m); }
  m.setAttribute("content", content);
};

export default function EngineProfilePage() {
  const qc = useQueryClient();
  const [interval, setIntervalMs] = useState<number | null>(null);
  const q = useGetEngineProfile({ query: { queryKey: getGetEngineProfileQueryKey(), refetchInterval: interval ?? false } });
  const ds = q.data;
  const rows = useMemo(() => ds?.rows ?? [], [ds]);
  const loading = q.isLoading;

  useEffect(() => {
    const t = "Engine Profile | AE+ Data Analytics";
    const d = "Aircraft and engine compatibility reference: engine manufacturers, families, variants, certification dates, sole-supplier status and thrust by aircraft type.";
    document.title = t;
    setMeta("name", "description", d);
    setMeta("property", "og:title", t);
    setMeta("property", "og:description", d);
    setMeta("property", "og:type", "website");
  }, []);
  const { isDark, setDark } = useDashboardTheme();
  const [spin, setSpin] = useState(false);
  useEffect(() => { if (q.isFetching) { setSpin(true); return undefined; } const t = setTimeout(() => setSpin(false), 600); return () => clearTimeout(t); }, [q.isFetching]);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);
  const [disc, setDisc] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: getGetEngineProfileQueryKey() });

  const [f, setF] = useState<EngineFilters>(() => {
    const keys = Object.keys(EMPTY_ENGINE_FILTERS) as EngineFilterKey[];
    const init = initialAssistantFilters(keys);
    return Object.fromEntries(keys.map((k) => [k, one(init[k])])) as EngineFilters;
  });
  const set = (p: Partial<EngineFilters>) => setF((o) => ({ ...o, ...p }));
  useAssistantModule("engine-profile", { ready: true, filters: f, apply: (s) => setF({ ...EMPTY_ENGINE_FILTERS, ...s }) });
  const toggle = (d: EngineFilterKey, v: string) => setF((o) => ({ ...o, [d]: o[d].includes(v) ? o[d].filter((x) => x !== v) : [...o[d], v] }));
  const filtered = useMemo(() => filterEngineProfiles(rows, f), [rows, f]);
  const opts = useMemo(() => Object.fromEntries(DIMS.map((d) => [d, uniq(rows.map((r) => r[d]))])) as Record<EngineFilterKey, string[]>, [rows]);
  const sum = useMemo(() => summarizeEngineProfiles(filtered), [filtered]);
  const byEngMfr = useMemo(() => countBy(filtered, "engineManufacturer"), [filtered]);
  const byFamily = useMemo(() => countBy(filtered, "engineFamily"), [filtered]);
  const byAcMfr = useMemo(() => countBy(filtered, "aircraftManufacturer"), [filtered]);
  const certs = useMemo(() => certificationEntries(filtered), [filtered]);
  const active = DIMS.flatMap((d) => f[d].map((v) => ({ k: `${d}-${v}`, label: `${LABEL[d]}: ${v === "" ? "(Blank)" : v}`, clear: () => toggle(d, v) })));
  const soleTip = sum.rows === 0 ? "No profile entries selected." : `${sum.soleYes} Yes, ${sum.soleNo} No${sum.soleOther ? `, ${sum.soleOther} blank/other` : ""} of ${sum.rows} selected profile entries. Shows Yes only when every selected entry is a sole-supplier entry; No means not all selected entries are sole-supplier, not that each row is No.`;
  const kpis: [string, string, string, string][] = [
    ["Sole Supplier", sum.soleSupplier ?? "\u2014", "kpi-sole-supplier", soleTip],
    ["Total Engine Manufacturers", String(sum.engineManufacturers), "kpi-engine-manufacturers", "Distinct non-blank engine manufacturers (case-insensitive) in the selected profile entries."],
    ["Total Engine Variants", String(sum.engineVariants), "kpi-engine-variants", "Distinct non-blank engine variants (case-insensitive) in the selected profile entries."],
  ];

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <nav className="thin-scroll flex overflow-x-auto border-b border-border bg-sidebar print:hidden" aria-label="Modules">
        {MODULES.map((m) => m === "Engine Profile" ? (
          <div key={m} data-testid="nav-engine-profile" className="relative flex min-w-[110px] flex-1 items-center justify-center bg-primary px-3 py-2.5 text-center text-[13px] font-semibold leading-tight text-primary-foreground">{m}</div>
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
            {ds ? DIMS.map((d) => (
              <MultiSelect key={d} id={slug(d)} label={LABEL[d]} options={opts[d]} value={f[d]} onChange={(v) => set({ [d]: v })} />
            )) : [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-11" />)}
          </div>
          <button data-testid="button-clear-filters" disabled={!active.length} onClick={() => setF(EMPTY_ENGINE_FILTERS)} className="flex h-7 items-center justify-center gap-1.5 rounded-[3px] border border-border bg-card text-[12px] font-medium transition-colors hover:border-primary disabled:opacity-50 print:hidden">
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
              <h1 className="text-[15px] font-semibold leading-tight">AE<span className="text-primary">+</span> Data Analytics <span className="font-normal text-muted-foreground">/ Engine Profile</span></h1>
            </div>
            <div className="flex items-center gap-1.5 print:hidden">
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
              <ThemeToggle isDark={isDark} onToggle={() => setDark((d) => !d)} />
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
              <div className="text-[14px] font-semibold">Engine profile data could not be loaded</div>
              <p className="max-w-md text-[12px] text-muted-foreground">The server did not return the ENGINE_PROFILE dataset. Check the API service, then retry.</p>
              <button data-testid="button-retry" onClick={() => q.refetch()} className="rounded-[3px] bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:opacity-90">Retry</button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-2 sm:max-w-[600px] sm:grid-cols-3">
                {kpis.map(([l, v, id, tip]) => (
                  <Tooltip key={id}>
                    <TooltipTrigger asChild>
                      <div tabIndex={0} className="panel cursor-help rounded-[3px] bg-card px-3 py-2 outline-none focus-visible:ring-1 focus-visible:ring-ring">
                        {loading ? <Skeleton className="h-6 w-12" /> : <div data-testid={id} className="text-[20px] font-semibold leading-tight tnum">{v}</div>}
                        <div className="text-[11px] text-muted-foreground">{l}</div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">{tip}</TooltipContent>
                  </Tooltip>
                ))}
              </div>

              {!loading && filtered.length === 0 ? (
                <div className="panel rounded-[3px] border border-dashed border-border bg-card px-6 py-14 text-center" data-testid="empty-filtered">
                  <div className="text-[14px] font-semibold">No engine profile entries match these filters</div>
                  <p className="mt-1 text-[12px] text-muted-foreground">{rows.length ? "This aircraft and engine combination has no rows in the source. Remove a filter." : "The dataset returned no rows."}</p>
                  {active.length > 0 && <button onClick={() => setF(EMPTY_ENGINE_FILTERS)} className="mt-3 rounded-[3px] bg-primary px-3 py-1.5 text-[12px] text-primary-foreground">Clear all filters</button>}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)]">
                    <EngineDonut id="engine-manufacturer" title="Share of Aircraft by Engine Manufacturer" legendTitle="Engine Manufacturer" data={byEngMfr} total={filtered.length} selected={f.engineManufacturer} onPick={(v) => toggle("engineManufacturer", v)} loading={loading} />
                    <EngineDonut id="engine-family" title="Share of Aircraft by Engine Family" legendTitle="Engine Family" data={byFamily} total={filtered.length} selected={f.engineFamily} onPick={(v) => toggle("engineFamily", v)} loading={loading} />
                    <EngineDonut id="aircraft-manufacturer" title="Share of Engine Manufacturer by Aircraft Manufacturer" legendTitle="Aircraft Manufacturer" data={byAcMfr} total={filtered.length} selected={f.aircraftManufacturer} onPick={(v) => toggle("aircraftManufacturer", v)} loading={loading} />
                    <CertificationList entries={certs} selected={f.engineVariant} onPick={(v) => toggle("engineVariant", v)} loading={loading} />
                  </div>
                  <EngineDetailTable rows={filtered} loading={loading} />
                </>
              )}
              {ds && (
                <details className="panel rounded-[3px] bg-card px-3 py-2 text-[11px] text-muted-foreground" data-testid="source-notes">
                  <summary className="cursor-pointer font-semibold text-foreground">Source notes and definitions</summary>
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                    <li>Imported snapshot of {ds.source}, sheet {ds.sheet}; not a live feed. Each row is an aircraft model / engine variant profile entry, so aircraft models repeat once per compatible variant.</li>
                    <li>The three donuts keep the reference report titles but count filtered profile entries by engine manufacturer, engine family and aircraft manufacturer. They are not fleet counts or installed-engine market share.</li>
                    <li>The reference screenshot shows 611 variants and 7 manufacturers with different shares; those figures do not reconcile with the supplied ENGINE_PROFILE sheet. This page reports the actual source ({rows.length} rows) and does not hardcode the screenshot values.</li>
                    <li>Sole Supplier is Yes only when every selected entry is Yes; otherwise No. Manufacturer and variant totals are distinct non-blank values, case-insensitive.</li>
                    <li>Certification list shows distinct variant and date pairs (a variant certified on two dates appears twice). Dates are kept as source text, including TBC.</li>
                    <li>Sidebar filters, chart slices, legend entries and certification rows apply globally. The detail table search applies to the table only.</li>
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
