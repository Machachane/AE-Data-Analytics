import { useEffect, useRef, useState } from "react";
import { initialAssistantFilters } from "@/lib/assistant-filters";
import { FeedbackButton } from "@/components/feedback-button";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAssistantModule } from "@/lib/assistant-controller";
import { useGetAviationFinance, getGetAviationFinanceQueryKey } from "@workspace/api-client-react";
import type { FinanceAnalysis, FinanceMla, FinanceRow, GetAviationFinanceParams } from "@workspace/api-client-react";
import { AlertTriangle, Check, ChevronDown, Download, Info, Printer, RefreshCw, RotateCcw } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DisclaimerText, DISCLAIMER_TITLE } from "@/components/disclaimer-text";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadCSV } from "@/lib/deliveries";

const MODULES = ["Summary", "Deliveries", "Orders", "Aircraft Utilisation", "Aviation Finance", "Airline Financials", "Market Value / Lease Rates", "Emissions", "Aircraft Registry", "Engine Profile", "Jurisdiction Risk"];
const NAV: Record<string, string> = { Summary: "/summary", "Jurisdiction Risk": "/jurisdiction-risk", "Engine Profile": "/engine-profile", "Airline Financials": "/airline-financials", Deliveries: "/deliveries", Orders: "/orders", "Aircraft Utilisation": "/aircraft-utilisation", "Market Value / Lease Rates": "/market-value-lease-rates", Emissions: "/emissions", "Aircraft Registry": "/aircraft-registry" };
const INTERVALS = [
  { label: "Every 5 min", ms: 5 * 60_000 },
  { label: "Every 15 min", ms: 15 * 60_000 },
  { label: "Every 1 hour", ms: 60 * 60_000 },
  { label: "Every 24 hours", ms: 24 * 60 * 60_000 },
];
const iconBtn = "flex h-[26px] items-center justify-center gap-1 rounded-[4px] bg-foreground/10 px-2 text-[12px] text-foreground/85 transition-colors hover:bg-foreground/20 disabled:opacity-50";
const whole = (n: number) => Math.round(n).toLocaleString("en-US", { useGrouping: false });
const full = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 6 });
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default function AviationFinancePage() {
  const qc = useQueryClient();
  const [interval, setIntervalMs] = useState<number | null>(null);
  const [params, setParams] = useState<GetAviationFinanceParams>(() => {
    const init = initialAssistantFilters(["year", "period"] as const);
    const p: GetAviationFinanceParams = {};
    const y = Number(init.year);
    if (init.year && Number.isInteger(y) && y > 1900 && y < 2200) p.year = y;
    if (init.period) p.period = init.period;
    return p;
  });
  const q = useGetAviationFinance(params, { query: { queryKey: getGetAviationFinanceQueryKey(params), refetchInterval: interval ?? false, placeholderData: (prev) => prev } });
  const data = q.data;
  const stale = q.isPlaceholderData;
  const show = stale ? undefined : data;

  useEffect(() => {
    document.title = "Aviation Finance | AE+ Data Analytics";
    let m = document.querySelector('meta[name="description"]');
    if (!m) { m = document.createElement("meta"); m.setAttribute("name", "description"); document.head.appendChild(m); }
    m.setAttribute("content", "Aviation finance league tables: MLA, borrower, capital markets and commercial bank rankings by year and reporting period, plus 2025 facility, financier and geographic analysis.");
  }, []);
  const [spin, setSpin] = useState(false);
  useEffect(() => { if (q.isFetching) { setSpin(true); return undefined; } const t = setTimeout(() => setSpin(false), 600); return () => clearTimeout(t); }, [q.isFetching]);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);
  const [disc, setDisc] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["/api/aviation-finance"] });

  const selYear = params.year ?? data?.year;
  const selPeriod = stale ? params.period : data?.period;
  const isDefault = params.year == null && params.period == null;
  useAssistantModule("aviation-finance", {
    ready: !!data,
    filters: { year: selYear != null ? String(selYear) : "", period: selPeriod ?? "" },
    apply: (s) => {
      const p: GetAviationFinanceParams = {};
      if (s.year) { const y = Number(s.year); if (!Number.isInteger(y) || y < 1900 || y > 2200) return false; p.year = y; }
      if (s.period) p.period = s.period;
      setParams(p);
      return true;
    },
  });
  const ex = data?.excludedMla;
  const exNote = show && ex && ex.count > 0 ? `Anonymous MLA excluded from all three MLA rankings to match the source report: ${ex.count} source group${ex.count === 1 ? "" : "s"}, USD ${full(ex.total)}M total (capital markets ${full(ex.capitalMarkets)}M, commercial ${full(ex.commercial)}M).` : null;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <nav className="thin-scroll flex overflow-x-auto border-b border-border bg-sidebar print:hidden" aria-label="Modules">
        {MODULES.map((m) => m === "Aviation Finance" ? (
          <div key={m} data-testid="nav-aviation-finance" className="relative flex min-w-[110px] flex-1 items-center justify-center bg-primary px-3 py-2.5 text-center text-[13px] font-semibold text-primary-foreground">{m}</div>
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
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <label className="block">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Year</div>
              {data ? (
                <select data-testid="select-year" value={selYear ?? ""} onChange={(e) => setParams({ year: Number(e.target.value) })} className="h-7 w-full rounded-[3px] border border-input bg-card px-1.5 text-[12px] tnum">
                  {data.years.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              ) : <Skeleton className="h-7" />}
            </label>
            <label className="block">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Reporting period</div>
              {data ? (
                <select data-testid="select-period" disabled={stale && params.period == null} value={selPeriod ?? ""} onChange={(e) => setParams({ year: data.year, period: e.target.value })} className="h-7 w-full rounded-[3px] border border-input bg-card px-1.5 text-[12px] disabled:opacity-60">
                  {stale && params.period == null && <option value="">Loading periods</option>}
                  {data.periods.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              ) : <Skeleton className="h-7" />}
            </label>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button data-testid="button-clear-filters" disabled={isDefault} onClick={() => setParams({})} className="flex h-7 items-center justify-center gap-1.5 rounded-[3px] border border-border bg-card text-[12px] font-medium transition-colors hover:border-primary disabled:opacity-50 print:hidden">
                <RotateCcw className="h-3 w-3" /> Clear All Filters
              </button>
            </TooltipTrigger>
            <TooltipContent>Reset to the default snapshot{data ? ` (${data.defaultYear} ${data.defaultPeriod})` : ""}</TooltipContent>
          </Tooltip>
          <FeedbackButton defaultModule="Aviation Finance" />
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
              <h1 className="text-[15px] font-semibold leading-tight">AE<span className="text-primary">+</span> Data Analytics <span className="font-normal text-muted-foreground">/ Aviation Finance</span></h1>
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
              <button onClick={() => setDisc(true)} className={`${iconBtn} lg:hidden`} aria-label="Disclaimer"><Info className="h-3.5 w-3.5" /></button>
            </div>
          </div>

          {q.isError && !stale ? (
            <div className="panel flex flex-col items-center justify-center gap-3 rounded-[3px] border border-border bg-card px-6 py-16 text-center">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              <div className="text-[14px] font-semibold">Aviation finance data could not be loaded</div>
              <p className="max-w-md text-[12px] text-muted-foreground">The server did not return the finance rankings{params.year ? ` for ${params.year}${params.period ? ` ${params.period}` : ""}` : ""}. The snapshot may be unavailable, or the API service may be down.</p>
              <div className="flex gap-2">
                <button data-testid="button-retry" onClick={() => q.refetch()} className="rounded-[3px] bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:opacity-90">Retry</button>
                {!isDefault && <button onClick={() => setParams({})} className="rounded-[3px] border border-border px-3 py-1.5 text-[12px]">Reset to default</button>}
              </div>
            </div>
          ) : (
            <>
              <div className={`grid grid-cols-1 gap-2 transition-opacity xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.85fr)_minmax(0,0.9fr)] ${stale ? "opacity-50" : ""}`} aria-busy={q.isFetching}>
                <div className="flex min-w-0 flex-col gap-2">
                  <RankTable id="mla" title="MLA" color="#e8743b" rows={show?.mla} measure="total" note={exNote} />
                  <RankTable id="borrower" title="Borrower" color="#2563eb" rows={show?.borrowers} measure="total" />
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  {!data ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-36" />) : data.analyses.length === 0 ? (
                    <div className="panel rounded-[3px] bg-card px-3 py-8 text-center text-[11px] text-muted-foreground">No reference analyses in the source</div>
                  ) : data.analyses.map((a) => <AnalysisTable key={a.title} a={a} />)}
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  <MiniRank id="capital-markets" title="Cap Mkts Total (USD M)" color="#2ecc8f" rows={show?.capitalMarkets} measure="capitalMarkets" />
                  <MiniRank id="commercial" title="Commercial Total (USD M)" color="#1fa3d9" rows={show?.commercial} measure="commercial" />
                </div>
              </div>
              {data && (
                <details className="panel rounded-[3px] bg-card px-3 py-2 text-[11px] text-muted-foreground" data-testid="source-notes">
                  <summary className="cursor-pointer font-semibold text-foreground">Source notes and definitions</summary>
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                    <li>Imported snapshot of {data.sources.join(", ")}; not a live feed. Amounts are USD millions shown rounded to whole numbers; hover a row or export CSV for full precision.</li>
                    <li>Snapshots are exact year and reporting-period cuts. Quarterly, half-year and full-year aggregates overlap, so there is no combined "All" option.</li>
                    <li>Capital markets and commercial rankings use their respective measures, not the MLA total. Zero-value rows are omitted.</li>
                    <li>Analysis tables are a fixed 2025 reference (H1/2025, H2/2025, Year 2025). Percentages are share of total; Total ($Bn) is USD billions.</li>
                    {exNote && <li>{exNote}</li>}
                    {data.notes.map((n) => <li key={n}>{n}</li>)}
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

function CsvBtn({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button onClick={onClick} data-testid={`csv-${name}`} aria-label={`Download ${name} as CSV`} className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[3px] bg-foreground/10 text-foreground/80 transition-colors hover:bg-foreground/20 print:hidden">
      <Download className="h-3 w-3" />
    </button>
  );
}

type Measure = "total" | "capitalMarkets" | "commercial";
const val = (r: FinanceRow | FinanceMla, m: Measure) => (m === "total" ? r.total : (r as FinanceMla)[m]);
const csvRows = (rows: (FinanceRow | FinanceMla)[], m: Measure) => rows.map((r, i) => ({ rank: i + 1, name: r.name, [`${m === "total" ? "total" : m}_usd_m`]: val(r, m), deals: r.deals, year: r.year, reporting_period: r.period }));

function RankTable({ id, title, color, rows, measure, note }: { id: string; title: string; color: string; rows?: FinanceRow[]; measure: Measure; note?: string | null }) {
  const max = Math.max(1, ...(rows ?? []).map((r) => val(r, measure)));
  return (
    <section className="panel flex min-w-0 flex-col rounded-[3px] bg-card">
      <div className="flex items-center gap-2 px-2 pb-1 pt-1.5">
        <h2 className="mr-auto text-[12px] font-semibold">{title} ranking</h2>
        {note && <Tooltip><TooltipTrigger asChild><span data-testid={`note-excluded-${id}`} className="cursor-help text-[10px] text-muted-foreground underline decoration-dotted">excl. anonymous</span></TooltipTrigger><TooltipContent className="max-w-xs">{note}</TooltipContent></Tooltip>}
        {rows && rows.length > 0 && <CsvBtn name={id} onClick={() => downloadCSV(`aviation-finance-${id}-${rows[0].year}-${rows[0].period}.csv`, csvRows(rows, measure))} />}
      </div>
      <div className="thin-scroll max-h-[300px] overflow-auto">
        <table className="w-full min-w-[460px] table-fixed text-[11px]">
          <colgroup><col style={{ width: "26%" }} /><col style={{ width: "34%" }} /><col style={{ width: "16%" }} /><col style={{ width: "10%" }} /><col style={{ width: "14%" }} /></colgroup>
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b border-foreground/30 text-left font-semibold">
              <th className="px-2 py-1">{title}</th><th className="px-1 py-1">Total (USD M)</th><th className="px-1 py-1 text-right">Number of Deals</th><th className="px-1 py-1 text-right">Year</th><th className="px-2 py-1">Reporting Period</th>
            </tr>
          </thead>
          <tbody>
            {!rows ? Array.from({ length: 10 }).map((_, i) => <tr key={i}><td colSpan={5} className="px-2 py-1"><Skeleton className="h-3.5" /></td></tr>) : rows.length === 0 ? (
              <tr><td colSpan={5} className="px-2 py-8 text-center text-muted-foreground">No {title.toLowerCase()} deals in this snapshot</td></tr>
            ) : rows.map((r, i) => {
              const v = val(r, measure);
              return (
                <tr key={`${r.name}-${i}`} data-testid={`row-${id}-${i}`} title={`${r.name}: USD ${full(v)}M, ${r.deals} deals`} className="transition-colors hover:bg-primary/10">
                  <td className="truncate px-2 py-[2.5px] font-medium">{r.name}</td>
                  <td className="px-1 py-[2.5px]">
                    <span className="relative block h-[13px]">
                      <span className="absolute inset-y-0 left-0 rounded-[1px] transition-[width] duration-300" style={{ background: color, width: `${Math.max(2, (v / max) * 100)}%` }} />
                      <span className="relative block pr-1 text-right font-semibold tnum">{whole(v)}</span>
                    </span>
                  </td>
                  <td className="px-1 py-[2.5px] text-right tnum">{r.deals}</td>
                  <td className="px-1 py-[2.5px] text-right tnum">{r.year}</td>
                  <td className="px-2 py-[2.5px]">{r.period}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-foreground/30 px-2 py-1 text-[10.5px] text-muted-foreground tnum">{rows ? `${rows.length} ranked \u00b7 scroll for full list` : "\u00a0"}</div>
    </section>
  );
}

function MiniRank({ id, title, color, rows, measure }: { id: string; title: string; color: string; rows?: FinanceMla[]; measure: Measure }) {
  const max = Math.max(1, ...(rows ?? []).map((r) => val(r, measure)));
  return (
    <section className="panel flex min-w-0 flex-col rounded-[3px] bg-card">
      <div className="flex items-center gap-2 px-2 pb-1 pt-1.5">
        <h2 className="mr-auto text-[12px] font-semibold">{measure === "capitalMarkets" ? "Capital Markets" : "Commercial"} MLA</h2>
        {rows && rows.length > 0 && <CsvBtn name={id} onClick={() => downloadCSV(`aviation-finance-${id}-${rows[0].year}-${rows[0].period}.csv`, csvRows(rows, measure))} />}
      </div>
      <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-1 border-b border-foreground/30 px-2 pb-1 text-[11px] font-semibold"><span>MLA</span><span>{title}</span></div>
      <div className="thin-scroll max-h-[220px] overflow-y-auto">
        {!rows ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="mx-2 my-1 h-3.5" />) : rows.length === 0 ? (
          <div className="px-2 py-6 text-center text-[11px] text-muted-foreground">No deals in this snapshot</div>
        ) : rows.map((r, i) => {
          const v = val(r, measure);
          return (
            <div key={`${r.name}-${i}`} data-testid={`row-${id}-${i}`} title={`${r.name}: USD ${full(v)}M, ${r.deals} deals`} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] items-center gap-1 px-2 py-[2.5px] text-[11px] hover:bg-primary/10">
              <span className="truncate font-medium">{r.name}</span>
              <span className="relative h-[13px]">
                <span className="absolute inset-y-0 left-0 rounded-[1px]" style={{ background: color, width: `${Math.max(2, (v / max) * 80)}%` }} />
                <span className="relative block pr-1 text-right font-semibold tnum">{whole(v)}</span>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AnalysisTable({ a }: { a: FinanceAnalysis }) {
  const fmt = (v: number, u: string) => (u === "percent" ? `${Math.round(v * 100)}%` : whole(v));
  const name = slug(a.title);
  return (
    <section className="panel min-w-0 rounded-[3px] bg-card" data-testid={`analysis-${name}`}>
      <div className="flex items-center gap-2 px-2 pb-1 pt-1.5">
        <h2 className="mr-auto text-[12px] font-semibold">{a.title} <span className="font-normal text-muted-foreground">(2025 reference)</span></h2>
        <CsvBtn name={`analysis-${name}`} onClick={() => downloadCSV(`aviation-finance-${name}-2025-reference.csv`, a.rows.flatMap((r) => r.values.map((v, i) => ({ category: r.label, column: a.columns[i] ?? `col${i + 1}`, value: v, unit: r.unit === "percent" ? "fraction (0-1)" : "USD billion" }))))} />
      </div>
      <table className="w-full text-[11px]">
        <thead><tr className="border-b border-foreground/30 font-semibold"><th className="px-2 py-1 text-left">Category</th>{a.columns.map((c) => <th key={c} className="px-2 py-1 text-right">{c}</th>)}</tr></thead>
        <tbody>
          {a.rows.map((r) => (
            <tr key={r.label} className={`hover:bg-primary/10 ${r.unit === "usd-bn" ? "border-t border-foreground/20 font-semibold" : ""}`}>
              <td className="px-2 py-[2.5px] font-medium">{r.label}</td>
              {r.values.map((v, i) => <td key={i} title={r.unit === "percent" ? `${full(v * 100)}%` : `USD ${full(v)}Bn`} className="px-2 py-[2.5px] text-right tnum">{fmt(v, r.unit)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
