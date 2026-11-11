import { useEffect, useMemo, useRef, useState } from "react";
import { useGetAirlineFinancialStatement, getGetAirlineFinancialStatementQueryKey } from "@workspace/api-client-react";
import type { AirlineFinancialMetric, AirlineMetricTotal, AirlineFinancialRecord, AirlineFinancialOptions, AirlineStatementChoice } from "@workspace/api-client-react";
import { AlertTriangle, ChevronDown, ChevronRight, Download, Eraser, FileText, Minus, Printer, Search, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadEngineCSV } from "@/lib/engine-profile";
import { buildWaterfallSteps, choiceLabel, downloadText, fileSlug, fmtAmt, metricTotalsExportRows, rawAmt, statementCSV, statementHTML, SCALE_LABEL, type WaterfallStep } from "@/lib/airline-financials";

/* ---------------- Category tree ---------------- */
function Box({ state }: { state: "on" | "off" | "mixed" }) {
  return (
    <span className={`flex h-3 w-3 shrink-0 items-center justify-center rounded-[2px] border ${state === "off" ? "border-foreground/50" : "border-primary bg-primary text-primary-foreground"}`}>
      {state === "on" ? <span className="h-1.5 w-1.5 bg-primary-foreground" /> : state === "mixed" ? <Minus className="h-2.5 w-2.5" /> : null}
    </span>
  );
}

export function CategoryTree({ metrics, selected, onChange, loading }: { metrics: AirlineFinancialMetric[]; selected: number[]; onChange: (ids: number[]) => void; loading: boolean }) {
  const [q, setQ] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const sel = useMemo(() => new Set(selected), [selected]);
  const groups = useMemo(() => {
    const m = new Map<string, AirlineFinancialMetric[]>();
    for (const x of metrics) { const g = m.get(x.category); if (g) g.push(x); else m.set(x.category, [x]); }
    return [...m.entries()];
  }, [metrics]);
  const s = q.trim().toLowerCase();
  const visible = groups.map(([c, ms]) => [c, s && !c.toLowerCase().includes(s) ? ms.filter((x) => x.name.toLowerCase().includes(s)) : ms] as const).filter(([, ms]) => ms.length);
  const order = (set: Set<number>) => metrics.filter((x) => set.has(x.id)).map((x) => x.id);
  // Toggling only touches visible ids; hidden selections persist.
  const setIds = (ids: number[], on: boolean) => { const n = new Set(sel); ids.forEach((i) => (on ? n.add(i) : n.delete(i))); onChange(order(n)); };
  const stateOf = (ids: number[]) => { const k = ids.filter((i) => sel.has(i)).length; return k === 0 ? "off" : k === ids.length ? "on" : "mixed"; };
  const allVis = visible.flatMap(([, ms]) => ms.map((x) => x.id));
  const allState = allVis.length ? stateOf(allVis) : "off";

  return (
    <aside className="panel flex min-h-0 flex-col rounded-[3px] bg-card" aria-label="Metric categories">
      <div className="flex items-center gap-1 border-b border-foreground/30 px-2 py-1.5">
        <span className="mr-auto text-[11px] font-semibold uppercase tracking-[0.06em]">Category</span>
        <span className="text-[10px] text-muted-foreground tnum" data-testid="text-selected-metrics">{selected.length}/{metrics.length}</span>
        <button data-testid="button-tree-search" onClick={() => setShowSearch((v) => !v)} className="rounded p-1 hover:bg-foreground/10" aria-label="Search metrics"><Search className="h-3.5 w-3.5" /></button>
        <button data-testid="button-tree-clear" disabled={!selected.length} onClick={() => onChange([])} className="rounded p-1 hover:bg-foreground/10 disabled:opacity-40" aria-label="Clear metric selection" title="Clear selection"><Eraser className="h-3.5 w-3.5" /></button>
      </div>
      {showSearch && (
        <div className="flex items-center gap-1.5 border-b border-border px-2 py-1">
          <input data-testid="input-tree-search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter list (keeps hidden selections)" className="h-6 w-full bg-transparent text-[11.5px] outline-none" />
          {q && <button onClick={() => setQ("")} aria-label="Clear filter"><X className="h-3.5 w-3.5" /></button>}
        </div>
      )}
      <div className="flex gap-2 px-2 py-1 text-[10.5px] text-primary">
        <button data-testid="button-expand-all" onClick={() => setCollapsed(new Set())} className="hover:underline">Expand all</button>
        <button data-testid="button-collapse-all" onClick={() => setCollapsed(new Set(groups.map(([c]) => c)))} className="hover:underline">Collapse all</button>
      </div>
      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-1 pb-2 text-[11.5px]" style={{ maxHeight: 640 }}>
        {loading ? Array.from({ length: 14 }).map((_, i) => <Skeleton key={i} className="m-1 h-4" />) : (
          <>
            <button data-testid="checkbox-select-all" onClick={() => setIds(allVis, allState !== "on")} className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 font-semibold hover:bg-primary/10">
              <Box state={allState} /> Select All{s && " (visible)"}
            </button>
            {visible.map(([c, ms]) => {
              const ids = ms.map((x) => x.id);
              const st = stateOf(ids);
              const open = s ? true : !collapsed.has(c);
              return (
                <div key={c} className="border-t border-border/60 py-0.5">
                  <div className="flex items-center">
                    <button onClick={() => setCollapsed((o) => { const n = new Set(o); if (n.has(c)) n.delete(c); else n.add(c); return n; })} className="p-0.5 opacity-70 hover:opacity-100" aria-label={open ? `Collapse ${c}` : `Expand ${c}`}>
                      {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </button>
                    <button data-testid={`checkbox-category-${fileSlug(c)}`} onClick={() => setIds(ids, st !== "on")} aria-checked={st === "mixed" ? "mixed" : st === "on"} role="checkbox" className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-0.5 text-left font-semibold hover:bg-primary/10">
                      <Box state={st} /><span className="truncate" title={c}>{c}</span>
                    </button>
                  </div>
                  {open && ms.map((x) => (
                    <button key={x.id} data-testid={`checkbox-metric-${x.id}`} role="checkbox" aria-checked={sel.has(x.id)} onClick={() => setIds([x.id], !sel.has(x.id))} className="ml-4 flex w-[calc(100%-1rem)] items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-primary/10">
                      <Box state={sel.has(x.id) ? "on" : "off"} /><span className="truncate" title={x.name}>{x.name}</span>
                    </button>
                  ))}
                </div>
              );
            })}
            {!visible.length && <p className="px-2 py-4 text-center text-[11px] text-muted-foreground">No metric matches "{q}".</p>}
          </>
        )}
      </div>
    </aside>
  );
}

/* ---------------- Waterfall ---------------- */
const COLORS = { increase: "hsl(var(--chart-3))", decrease: "hsl(var(--chart-4))", total: "hsl(var(--chart-1))" };
const compact = (v: number) => Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : v.toFixed(2);

export function Waterfall({ totals, hasSelection, loading, mixed }: { totals: AirlineMetricTotal[]; hasSelection: boolean; loading: boolean; mixed: string | null }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  useEffect(() => {
    const el = wrap.current; if (!el) return undefined;
    const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const { steps, skipped } = useMemo(() => buildWaterfallSteps(totals), [totals]);
  const [hover, setHover] = useState<number | null>(null);
  const H = 320, PADL = 64, PADT = 16, LABEL_H = 110;
  const slot = Math.max(46, (w - PADL - 8) / Math.max(steps.length, 1));
  const W = Math.max(w, PADL + slot * steps.length + 8);
  const vals = steps.flatMap((s) => [s.start, s.end]).concat(0);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (lo === hi) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * 0.06; lo -= lo < 0 ? pad : 0; hi += pad;
  const plotH = H - PADT - LABEL_H;
  const y = (v: number) => PADT + ((hi - v) / (hi - lo)) * plotH;
  const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);
  const hs: WaterfallStep | undefined = hover == null ? undefined : steps[hover];

  return (
    <section className="panel min-w-0 rounded-[3px] bg-card" aria-label="Total amount by metric">
      <div className="flex flex-wrap items-center gap-3 px-2 py-1.5">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.04em]">Total Amount by Metric</h2>
        <div className="flex items-center gap-3 text-[11px]">
          {(["increase", "decrease", "total"] as const).map((k) => <span key={k} className="flex items-center gap-1 capitalize"><span className="h-2 w-2 rounded-full" style={{ background: COLORS[k] }} />{k}</span>)}
        </div>
        <span className="text-[10.5px] text-muted-foreground">{SCALE_LABEL}</span>
        {steps.length > 0 && (
          <button data-testid="button-export-totals" onClick={() => downloadEngineCSV("airline-financials-selected-metric-totals.csv", metricTotalsExportRows(totals))} className="ml-auto flex h-[26px] items-center gap-1 rounded-[4px] bg-foreground/10 px-2 text-[12px] hover:bg-foreground/20 print:hidden"><Download className="h-3.5 w-3.5" /> Totals CSV</button>
        )}
      </div>
      {hasSelection && steps.length > 0 && (
        <div className="mx-2 mb-1 rounded-[3px] border-l-2 border-[hsl(var(--chart-5))] bg-foreground/[0.04] px-2 py-1 text-[10.5px] text-muted-foreground" data-testid="text-waterfall-caveat">
          Exploratory source-amount sum, not an accounting reconciliation or official statement. Selected metrics can include nested subtotals and are summed as reported{mixed ? ` across ${mixed}` : ""}. Signs are kept as in source.
        </div>
      )}
      <div className="relative"><div ref={wrap} className="thin-scroll overflow-x-auto" data-testid="chart-waterfall">
        {!hasSelection ? (
          <div className="flex h-[320px] items-center justify-center px-6 text-center" data-testid="empty-waterfall">
            <div>
              <div className="text-[17px] font-semibold uppercase tracking-[0.03em]">Select metrics on the right filter for analysis</div>
              <p className="mt-1 text-[11px] text-muted-foreground">The waterfall stays empty until at least one metric or category is ticked. No zero chart is drawn.</p>
            </div>
          </div>
        ) : loading ? <Skeleton className="m-2 h-[300px]" /> : !steps.length ? (
          <div className="flex h-[320px] items-center justify-center text-center text-[12px] text-muted-foreground" data-testid="empty-waterfall-values">No source amounts for the selected metrics under these filters.</div>
        ) : (
          <svg width={W} height={H} role="img" aria-label="Waterfall of selected metric source amounts" onMouseLeave={() => setHover(null)}>
            {ticks.map((t, i) => (
              <g key={i}>
                <line x1={PADL} x2={W} y1={y(t)} y2={y(t)} stroke="hsl(var(--border))" strokeDasharray="2 3" />
                <text x={PADL - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="hsl(var(--muted-foreground))">{compact(t)}</text>
              </g>
            ))}
            <line x1={PADL} x2={W} y1={y(0)} y2={y(0)} stroke="hsl(var(--foreground) / 0.5)" />
            {steps.map((s, i) => {
              const x = PADL + i * slot + slot * 0.15, bw = slot * 0.7;
              const top = y(Math.max(s.start, s.end)), bot = y(Math.min(s.start, s.end));
              const next = steps[i + 1];
              return (
                <g key={i} onMouseEnter={() => setHover(i)} data-testid={`bar-waterfall-${i}`}>
                  <rect x={PADL + i * slot} y={PADT} width={slot} height={plotH} fill={hover === i ? "hsl(var(--primary) / 0.08)" : "transparent"} />
                  <rect x={x} y={top} width={bw} height={Math.max(bot - top, 0)} fill={COLORS[s.kind]} />
                  {next && next.kind !== "total" && <line x1={x + bw} x2={x + slot} y1={y(s.end)} y2={y(s.end)} stroke="hsl(var(--foreground) / 0.4)" strokeDasharray="2 2" />}
                  <text x={x + bw / 2} y={top - 3} textAnchor="middle" fontSize={9.5} fill="hsl(var(--foreground))">{compact(s.amount)}</text>
                  <text transform={`translate(${x + bw / 2},${PADT + plotH + 8}) rotate(-40)`} textAnchor="end" fontSize={10} fill="hsl(var(--foreground))" fontWeight={s.kind === "total" ? 600 : 400}>{s.label.length > 22 ? `${s.label.slice(0, 21)}...` : s.label}</text>
                </g>
              );
            })}
          </svg>
        )}
        </div>
        {hs && (
          <div className="pointer-events-none absolute right-2 top-2 z-10 w-[260px] rounded-[3px] border border-border bg-popover p-2 text-[11px] shadow-lg" data-testid="tooltip-waterfall">
            <div className="font-semibold">{hs.label}</div>
            {hs.category && <div className="text-muted-foreground">{hs.category}</div>}
            <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 tnum">
              <span>Amount</span><span className="text-right">{rawAmt(hs.amount)}</span>
              <span>Running total</span><span className="text-right">{rawAmt(hs.end)}</span>
              <span>Source rows</span><span className="text-right">{hs.rows.toLocaleString("en-US")}</span>
            </div>
          </div>
        )}
      </div>
      {skipped.length > 0 && <p className="px-2 py-1 text-[10.5px] text-muted-foreground">No source amounts (excluded, not counted as zero): {skipped.map((s) => s.metric).join(", ")}.</p>}
    </section>
  );
}

/* ---------------- Statement generator ---------------- */
type Key = "airline" | "financialYear" | "period" | "scope" | "fiscalYearEnd";
const KEYS: [Key, string][] = [["airline", "Airline"], ["financialYear", "Financial Year"], ["period", "Reporting Period"], ["scope", "Reporting Scope"], ["fiscalYearEnd", "Fiscal Year-End"]];
const uniq = (a: string[]) => [...new Set(a)].sort((x, y) => x.localeCompare(y, undefined, { sensitivity: "base" }));

function defaultChoice(st: AirlineStatementChoice[], airline?: string): Record<Key, string> | null {
  const pool = (airline && st.some((c) => c.airline === airline)) ? st.filter((c) => c.airline === airline) : (() => { const a = uniq(st.map((c) => c.airline))[0]; return st.filter((c) => c.airline === a); })();
  if (!pool.length) return null;
  const yr = pool.filter((c) => c.period === "Yr");
  const p = (yr.length ? yr : pool).slice().sort((a, b) => b.financialYear.localeCompare(a.financialYear) || b.rows - a.rows)[0];
  return { airline: p.airline, financialYear: p.financialYear, period: p.period, scope: p.scope, fiscalYearEnd: p.fiscalYearEnd };
}

function Section({ title, rows }: { title: string; rows: AirlineFinancialRecord[] }) {
  let cat = "";
  return (
    <div>
      <h3 className="border-b-2 border-primary pb-0.5 text-[11.5px] font-semibold uppercase tracking-[0.06em]">{title}</h3>
      {!rows.length ? (
        <p className="py-3 text-[11.5px] italic text-[hsl(var(--chart-4))]" data-testid={`empty-${fileSlug(title)}`}>No {title} source lines for this statement. Partial report; missing lines are not filled with zero.</p>
      ) : (
        <table className="w-full text-[11.5px]">
          <tbody>
            {rows.map((r) => {
              const head = r.category !== cat; cat = r.category;
              return [
                head && <tr key={`c${r.id}`} className="bg-foreground/[0.06] font-semibold"><td colSpan={2} className="px-1.5 py-0.5">{r.category}</td></tr>,
                <tr key={r.id} className="border-b border-border/60">
                  <td className="px-1.5 py-0.5 pl-3">{r.metric}</td>
                  <td className={`px-1.5 py-0.5 text-right tnum ${r.amount != null && r.amount < 0 ? "text-[hsl(var(--chart-4))]" : ""}`} title={rawAmt(r.amount) || "Blank in source"}>{fmtAmt(r.amount)}</td>
                </tr>,
              ];
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function StatementGenerator({ open, onOpenChange, options, airline }: { open: boolean; onOpenChange: (o: boolean) => void; options: AirlineFinancialOptions | undefined; airline?: string }) {
  const st = useMemo(() => options?.statements ?? [], [options]);
  const [pick, setPick] = useState<Record<Key, string> | null>(null);
  const [generated, setGenerated] = useState<number | null>(null);
  const [aq, setAq] = useState("");
  useEffect(() => { if (open) { setPick(defaultChoice(st, airline)); setGenerated(null); setAq(""); } }, [open, st, airline]);

  // Cascade: each selector's options come from actual choices matching earlier selections.
  const cascade = (k: Key) => {
    const idx = KEYS.findIndex(([x]) => x === k);
    return uniq(st.filter((c) => KEYS.slice(0, idx).every(([p]) => !pick || c[p] === pick[p])).map((c) => c[k]));
  };
  const setKey = (k: Key, v: string) => {
    if (!pick) return;
    const idx = KEYS.findIndex(([x]) => x === k);
    const n = { ...pick, [k]: v };
    for (const [later] of KEYS.slice(idx + 1)) {
      const avail = uniq(st.filter((c) => KEYS.slice(0, KEYS.findIndex(([x]) => x === later)).every(([p]) => c[p] === n[p])).map((c) => c[later]));
      if (!avail.includes(n[later])) n[later] = later === "period" && avail.includes("Yr") ? "Yr" : later === "financialYear" ? avail[avail.length - 1] : avail[0];
    }
    setPick(n); setGenerated(null);
  };
  const choice = pick ? st.find((c) => KEYS.every(([k]) => c[k] === pick[k])) : undefined;
  const sq = useGetAirlineFinancialStatement(generated ?? -1, { query: { queryKey: getGetAirlineFinancialStatementQueryKey(generated ?? -1), enabled: open && generated != null && st.some((c) => c.id === generated) } });
  const s = sq.data;
  const airlines = cascade("airline").filter((a) => a.toLowerCase().includes(aq.trim().toLowerCase()));
  const base = s ? `${fileSlug(s.choice.airline)}-${fileSlug(s.choice.financialYear)}-${fileSlug(s.choice.period)}` : "statement";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Balance Sheet and Profit &amp; Loss Generator</DialogTitle>
          <DialogDescription className="text-[11.5px]">Pick one actual source statement. Selectors cascade through {st.length.toLocaleString("en-US")} real airline / year / period / scope / fiscal year-end combinations, so overlapping annual, half-year and quarterly figures are never mixed. Independent of the metric tree.</DialogDescription>
        </DialogHeader>
        {!options ? <Skeleton className="h-20" /> : !pick ? <p className="text-[12px]">No statement combinations available in the source.</p> : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
            {KEYS.map(([k, label]) => (
              <label key={k} className="flex flex-col gap-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                {label}
                {k === "airline" && <input data-testid="input-generator-airline-search" value={aq} onChange={(e) => setAq(e.target.value)} placeholder="Search airline" className="h-6 rounded-[3px] border border-input bg-background/40 px-1.5 text-[11.5px] font-normal normal-case tracking-normal text-foreground outline-none focus:border-primary" />}
                <select data-testid={`select-generator-${k}`} value={pick[k]} onChange={(e) => setKey(k, e.target.value)} className="h-7 rounded-[3px] border border-input bg-card px-1 text-[12px] font-normal normal-case tracking-normal text-foreground">
                  {(k === "airline" ? (airlines.includes(pick.airline) ? airlines : [pick.airline, ...airlines]) : cascade(k)).map((v) => <option key={v} value={v}>{v || "(Blank)"}</option>)}
                </select>
              </label>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-muted-foreground" data-testid="text-generator-choice">{choice ? `${choice.rows} source lines · ${choice.currency || "USD"} source scale` : "Not an actual source combination"}</span>
          <button data-testid="button-generate" disabled={!choice || sq.isFetching} onClick={() => choice && setGenerated(choice.id)} className="ml-auto flex h-7 items-center gap-1.5 rounded-[3px] bg-[hsl(var(--chart-3))] px-3 text-[12px] font-semibold uppercase tracking-[0.04em] text-white hover:opacity-90 disabled:opacity-50"><FileText className="h-3.5 w-3.5" /> Generate</button>
        </div>
        {generated != null && (sq.isLoading ? <Skeleton className="h-48" /> : sq.isError ? (
          <div className="flex items-center gap-2 rounded-[3px] bg-destructive/15 px-2 py-2 text-[12px] text-destructive"><AlertTriangle className="h-4 w-4" /> Statement could not be loaded.<button onClick={() => sq.refetch()} className="ml-auto font-semibold underline">Retry</button></div>
        ) : s && options && (
          <div className="space-y-3 rounded-[3px] border border-border p-3" data-testid="statement-report">
            <div className="flex flex-wrap items-start gap-2">
              <div className="mr-auto">
                <div className="text-[14px] font-semibold">{s.choice.airline}</div>
                <div className="text-[11px] text-muted-foreground">{choiceLabel(s.choice)} · {s.choice.currency || "USD"} source scale (unit multiplier not declared)</div>
                <div className="text-[10.5px] text-muted-foreground">Source {options.source}, sheet {options.sheet}, dated {options.sourceDate}</div>
              </div>
              <button data-testid="button-statement-csv" onClick={() => downloadText(`${base}.csv`, "\ufeff" + statementCSV(s), "text/csv;charset=utf-8")} className="flex h-[26px] items-center gap-1 rounded-[4px] bg-foreground/10 px-2 text-[12px] hover:bg-foreground/20"><Download className="h-3.5 w-3.5" /> CSV</button>
              <button data-testid="button-statement-html" onClick={() => downloadText(`${base}.html`, statementHTML(s, options), "text/html;charset=utf-8")} className="flex h-[26px] items-center gap-1 rounded-[4px] bg-foreground/10 px-2 text-[12px] hover:bg-foreground/20"><Printer className="h-3.5 w-3.5" /> Printable HTML</button>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Section title="Balance Sheet" rows={s.balanceSheet} />
              <Section title="Profit & Loss" rows={s.profitLoss} />
            </div>
            <ul className="list-disc space-y-0.5 pl-4 text-[10.5px] text-muted-foreground">
              <li>Actual source lines only, in logical order. Zeros are reported zeros; blank or absent lines are missing. No subtotals or totals are calculated.</li>
              {s.notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          </div>
        ))}
      </DialogContent>
    </Dialog>
  );
}
