import { useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Download } from "lucide-react";
import type { RegistryDashboard, RegistryManufacturerCount, RegistryOperatorModel, RegistryRank } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadCSV, nf } from "@/lib/deliveries";

export const GREEN = "#1fcf8a";
export const BLUE = "#1f66e5";
export const ORANGE = "#f07a35";
const DONUT = ["#2e8ff0", "#1b2f9e", "#e2459b", "#7b3fc4", "#d12b78", "#4e1d8f", "#e9a23b", "#38b6c9", "#8fa3b8", "#5a6fd6"];

const abbr = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)}bn` : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(2)}K` : String(n));
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "0%");
const label = (s: string) => (s === "" ? "(Blank)" : s);
const onKey = (fn: () => void) => (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } };

function CsvBtn({ id, title, rows }: { id: string; title: string; rows: Record<string, unknown>[] }) {
  if (!rows.length) return null;
  return (
    <button data-testid={`csv-${id}`} aria-label={`Download ${title} as CSV`} onClick={() => downloadCSV(`aircraft-registry-${id}.csv`, rows)}
      className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[3px] bg-foreground/10 hover:bg-foreground/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring print:hidden">
      <Download className="h-3 w-3" />
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="flex h-full min-h-[120px] items-center justify-center text-[11px] text-muted-foreground">{text}</div>;
}

/* ---------- Donut ---------- */
function Donut({ rows, selected, onPick }: { rows?: RegistryManufacturerCount[]; selected: string; onPick: (v: string) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = (rows ?? []).reduce((s, r) => s + r.records, 0);
  const R = 70, r = 48, C = 100;
  let a0 = -Math.PI / 2;
  const arcs = (rows ?? []).map((d, i) => {
    const frac = total ? d.records / total : 0;
    const a1 = a0 + frac * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (rad: number, ang: number) => `${C + rad * Math.cos(ang)} ${C + rad * Math.sin(ang)}`;
    const path = frac >= 0.99999
      ? `M ${p(R, 0)} A ${R} ${R} 0 1 1 ${p(R, Math.PI)} A ${R} ${R} 0 1 1 ${p(R, 0)} M ${p(r, 0)} A ${r} ${r} 0 1 0 ${p(r, Math.PI)} A ${r} ${r} 0 1 0 ${p(r, 0)} Z`
      : `M ${p(R, a0)} A ${R} ${R} 0 ${large} 1 ${p(R, a1)} L ${p(r, a1)} A ${r} ${r} 0 ${large} 0 ${p(r, a0)} Z`;
    const mid = (a0 + a1) / 2;
    a0 = a1;
    return { d, i, path, mid, frac, color: DONUT[i % DONUT.length] };
  });
  const h = hover != null ? arcs[hover] : null;
  return (
    <section className="panel flex min-w-0 flex-col rounded-[3px] bg-card" aria-label="Total Aircraft by Manufacturer">
      <div className="flex items-center gap-2 px-2 pt-1.5 text-[11.5px] font-semibold">
        <span className="mr-auto">Total Aircraft by Manufacturer</span>
        <CsvBtn id="manufacturer-observations" title="manufacturer observations" rows={(rows ?? []).map((d) => ({ manufacturer: d.name, monthly_observations: d.records, share_pct: total ? +((d.records / total) * 100).toFixed(2) : 0 }))} />
      </div>
      {!rows ? <Skeleton className="m-3 h-[220px] rounded-full" /> : rows.length === 0 ? <Empty text="No manufacturers in view" /> : (
        <div className="flex flex-1 flex-col items-center gap-2 px-2 py-1 sm:flex-row">
          <div className="relative w-full max-w-[300px] flex-1">
            <svg viewBox="-5 -5 210 210" className="w-full" role="img" aria-label="Donut of monthly observations by manufacturer; exact counts and shares are listed in the legend">
              {arcs.map((a) => {
                const on = selected === a.d.name;
                return (
                  <path key={a.d.name} d={a.path} fill={a.color} fillRule="evenodd" tabIndex={0} role="button" aria-pressed={on}
                    aria-label={`${label(a.d.name)}: ${nf(a.d.records)} monthly observations, ${pct(a.d.records, total)}`}
                    data-testid={`donut-${a.d.name}`}
                    onMouseEnter={() => setHover(a.i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(a.i)} onBlur={() => setHover(null)}
                    onClick={() => onPick(a.d.name)} onKeyDown={onKey(() => onPick(a.d.name))}
                    className="cursor-pointer outline-none transition-opacity"
                    style={{ opacity: selected && !on ? 0.35 : hover != null && hover !== a.i ? 0.7 : 1, stroke: on || hover === a.i ? "hsl(var(--foreground))" : "hsl(var(--card))", strokeWidth: on || hover === a.i ? 1.5 : 0.6 }} />
                );
              })}
              <text x={C} y={C - 4} textAnchor="middle" fontSize="11" fontWeight="600" className="fill-foreground">{h ? abbr(h.d.records) : abbr(total)}</text>
              <text x={C} y={C + 9} textAnchor="middle" fontSize="7" className="fill-muted-foreground">{h ? label(h.d.name) : "observations"}</text>
            </svg>
            {h && (
              <div role="tooltip" className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 whitespace-nowrap rounded-[3px] border border-border bg-popover px-2 py-1 text-[11px] shadow-lg">
                <span className="font-semibold">{label(h.d.name)}</span> &middot; {nf(h.d.records)} monthly observations &middot; {pct(h.d.records, total)}
              </div>
            )}
          </div>
          <div className="shrink-0 text-[11px]" role="list" aria-label="Manufacturer legend">
            <div className="mb-0.5 font-semibold">Manufacturer</div>
            {arcs.map((a) => {
              const on = selected === a.d.name;
              return (
                <button key={a.d.name} role="listitem" aria-pressed={on} data-testid={`legend-${a.d.name}`} onClick={() => onPick(a.d.name)}
                  onMouseEnter={() => setHover(a.i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(a.i)} onBlur={() => setHover(null)}
                  title={`${label(a.d.name)}: ${nf(a.d.records)} monthly observations (${pct(a.d.records, total)})`}
                  className={`flex w-full items-center gap-1.5 rounded-[2px] px-1 py-[1px] text-left hover:bg-primary/10 focus-visible:bg-primary/15 focus-visible:outline-none ${on ? "font-semibold" : selected ? "opacity-50" : ""}`}>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: a.color }} />
                  <span className="min-w-0">
                    <span className="block truncate">{label(a.d.name)}</span>
                    <span className="block text-[9.5px] leading-tight text-muted-foreground tnum">{abbr(a.d.records)}</span>
                  </span>
                  <span className="ml-auto pl-2 text-muted-foreground tnum">{pct(a.d.records, total)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <p className="border-t border-foreground/20 px-2 py-1 text-[10.5px] text-muted-foreground">Measure: count of monthly source observations per manufacturer ({nf(total)} total), not distinct aircraft.</p>
    </section>
  );
}

/* ---------- Ranking matrices ---------- */
type MRow = { key: string; cells: string[]; value: number; on: boolean; pick: () => void; tip: string };
function Matrix({ id, title, heads, rows, color, limit, anySel }: { id: string; title: string; heads: string[]; rows?: MRow[]; color: string; limit?: number; anySel: boolean }) {
  const max = Math.max(1, ...(rows ?? []).map((r) => r.value));
  const cols = heads.length === 3 ? "grid-cols-[minmax(0,1.3fr)_minmax(0,0.55fr)_minmax(0,1fr)]" : "grid-cols-[minmax(0,1fr)_minmax(0,1fr)]";
  return (
    <section className="panel flex min-w-0 flex-col rounded-[3px] bg-card" aria-label={title}>
      <div className={`grid ${cols} items-end gap-1.5 border-b border-foreground/30 px-2 pb-1 pt-1.5 text-[11px] font-semibold`}>
        {heads.map((h, i) => (
          <span key={h} className={`flex items-center gap-1 ${i === heads.length - 1 ? "justify-between" : ""}`}>{h}{i === heads.length - 1 && <CsvBtn id={id} title={title} rows={(rows ?? []).map((r) => Object.fromEntries([...heads.slice(0, -1).map((hh, j) => [hh.toLowerCase(), r.cells[j]]), ["aircraft_distinct_msn", r.value]]))} />}</span>
        ))}
      </div>
      <div className="thin-scroll h-[230px] overflow-y-auto py-0.5" role="list">
        {!rows ? Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="mx-2 my-1 h-3.5" />) : rows.length === 0 ? <Empty text="Nothing in view" /> : rows.map((d) => (
          <button key={d.key} role="listitem" aria-pressed={d.on} data-testid={`rank-${id}-${d.key}`} onClick={d.pick} title={`${d.tip}${d.on ? " (click to clear)" : " (click to filter)"}`}
            className={`grid w-full ${cols} items-center gap-1.5 px-2 py-[2px] text-left text-[11px] transition-colors hover:bg-primary/10 focus-visible:bg-primary/15 focus-visible:outline-none ${d.on ? "bg-primary/20 font-semibold" : anySel ? "opacity-55" : ""}`}>
            {d.cells.map((c, i) => <span key={i} className={`truncate ${c === "" ? "italic text-muted-foreground" : "font-medium"}`}>{label(c)}</span>)}
            <span className="relative h-[13px]">
              <span className="absolute inset-y-0 left-0 rounded-[1px] transition-[width] duration-300" style={{ width: `${(d.value / max) * 100}%`, background: color }} />
              <span className="relative block pr-1 text-right font-semibold tnum mix-blend-normal">{nf(d.value)}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="border-t border-foreground/30 px-2 py-1 text-[10.5px] text-muted-foreground">
        {rows ? (limit != null && rows.length >= limit ? `Top ${limit}` : `${rows.length} shown`) : "\u00a0"} &middot; distinct MSN
      </div>
    </section>
  );
}

/* ---------- Funnel ---------- */
function Funnel({ rows, selected, onPick }: { rows?: RegistryManufacturerCount[]; selected: string; onPick: (v: string) => void }) {
  const first = rows?.[0]?.records ?? 0;
  const lastV = rows?.[rows.length - 1]?.records ?? 0;
  return (
    <section className="panel flex min-w-0 flex-col rounded-[3px] bg-card" aria-label="Total Models by Manufacturer">
      <div className="flex items-center gap-2 px-2 pt-1.5 text-[11.5px] font-semibold">
        <span className="mr-auto">Total Models by Manufacturer</span>
        <CsvBtn id="manufacturer-funnel" title="manufacturer funnel" rows={(rows ?? []).map((d) => ({ manufacturer: d.name, monthly_observations: d.records, pct_of_first: first ? +((d.records / first) * 100).toFixed(2) : 0 }))} />
      </div>
      {!rows ? <div className="space-y-2 p-3">{Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="mx-auto h-5" style={{ width: `${90 - i * 11}%` }} />)}</div> : rows.length === 0 ? <Empty text="No manufacturers in view" /> : (
        <div className="flex-1 px-2 py-1">
          <div className="text-center text-[10.5px] font-semibold tnum">100%</div>
          {rows.map((d) => {
            const on = selected === d.name;
            const w = first ? (d.records / first) * 100 : 0;
            return (
              <button key={d.name} aria-pressed={on} data-testid={`funnel-${d.name}`} onClick={() => onPick(d.name)}
                title={`${label(d.name)}: ${nf(d.records)} monthly observations, ${pct(d.records, first)} of ${label(rows[0].name)}${on ? " (click to clear)" : " (click to filter)"}`}
                className={`grid w-full grid-cols-[92px_minmax(0,1fr)] items-center gap-1 py-[3px] text-left text-[10.5px] hover:bg-primary/10 focus-visible:bg-primary/15 focus-visible:outline-none ${on ? "font-semibold" : selected ? "opacity-50" : ""}`}>
                <span className="truncate font-medium">{label(d.name)}</span>
                <span className="relative flex h-[22px] items-center justify-center">
                  <span className="h-full rounded-[1px] transition-[width] duration-300" style={{ width: `${w}%`, background: BLUE, outline: on ? "1.5px solid hsl(var(--foreground))" : undefined }} />
                  <span className={`absolute tnum ${w > 30 ? "text-white" : ""}`} style={w > 30 ? undefined : { left: `calc(50% + ${w / 2}% + 4px)` }}>{abbr(d.records)}</span>
                </span>
              </button>
            );
          })}
          <div className="text-center text-[10.5px] font-semibold tnum">{pct(lastV, first)}</div>
        </div>
      )}
      <p className="border-t border-foreground/20 px-2 py-1 text-[10.5px] text-muted-foreground">Bar length: monthly source observation count per manufacturer relative to the largest (100%). Not a count of distinct models or MSNs.</p>
    </section>
  );
}

type Sel = { manufacturer: string; model: string; operator: string; owner: string };

export function RegistryGraphs({ data, selected, onPick, onPickPair, table }: {
  data?: RegistryDashboard; selected: Sel;
  onPick: (k: "manufacturer" | "model" | "owner", v: string) => void;
  onPickPair: (operator: string, model: string) => void;
  table: ReactNode;
}) {
  const opRows = data?.operatorModelRanking.map((d: RegistryOperatorModel) => {
    const on = selected.operator === d.operator && selected.model === d.model;
    return { key: `${d.operator}|${d.model}`, cells: [d.operator, d.model], value: d.aircraft, on, pick: () => onPickPair(d.operator, d.model), tip: `${label(d.operator)} / ${label(d.model)}: ${nf(d.aircraft)} aircraft (distinct MSN)` };
  });
  const rank = (rows: RegistryRank[] | undefined, k: "owner" | "model") => rows?.map((d) => ({ key: d.name, cells: [d.name], value: d.aircraft, on: selected[k] === d.name, pick: () => onPick(k, d.name), tip: `${label(d.name)}: ${nf(d.aircraft)} aircraft (distinct MSN)` }));
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 2xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1.35fr)_minmax(0,0.9fr)_minmax(0,0.9fr)]">
        <Donut rows={data?.manufacturerCounts} selected={selected.manufacturer} onPick={(v) => onPick("manufacturer", v)} />
        <Matrix id="operator-model" title="Total Aircraft by Operator and Model" heads={["Operator", "Model", "Total Aircraft"]} rows={opRows} color={GREEN} limit={data?.rankingLimit} anySel={!!(selected.operator || selected.model)} />
        <Matrix id="owner" title="Total Aircraft by Owner" heads={["Owner", "Total Aircraft"]} rows={rank(data?.ownerRanking, "owner")} color={BLUE} limit={data?.rankingLimit} anySel={!!selected.owner} />
        <Matrix id="model" title="Total Aircraft by Model" heads={["Model", "Total Aircraft"]} rows={rank(data?.modelRanking, "model")} color={ORANGE} limit={data?.rankingLimit} anySel={!!selected.model} />
      </div>
      <div className="grid grid-cols-1 gap-2 xl:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)]">
        <div className="min-w-0">{table}</div>
        <Funnel rows={data?.manufacturerCounts} selected={selected.manufacturer} onPick={(v) => onPick("manufacturer", v)} />
      </div>
      <p className="text-[10.5px] text-muted-foreground">Ranking bars count distinct MSNs across the full source history and are non-additive. Click or press Enter on any bar, slice or legend entry to toggle its filter; operator and model rows set both filters together.</p>
    </div>
  );
}
