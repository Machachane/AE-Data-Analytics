import { useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import type { EngineProfileRecord } from "@workspace/api-client-react";
import { ArrowDown, ArrowUp, Download, Search, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { detailExportRow, downloadEngineCSV, type CategoryCount, type CertificationEntry } from "@/lib/engine-profile";

/* Palette echoes the reference report: bright blue, navy, orange, magenta, purple, teal... */
const COLORS = ["#2e8ff0", "#1b2f9e", "#f07a35", "#d12b78", "#7b3fc4", "#38b6c9", "#e9a23b", "#1fcf8a", "#e2459b", "#5a6fd6", "#8fa3b8", "#4e1d8f", "#c9d64a", "#0f7f86", "#b5651d", "#9b8cf0", "#ef5d5d", "#2bb3a0", "#6a8caf", "#d98fc9", "#7aa33b", "#3b5bdb", "#c46a2b", "#a33b74"];
const pct = (f: number) => `${(f * 100).toFixed(1)}%`;
const lbl = (s: string) => (s === "" ? "(Blank)" : s);
const onKey = (fn: () => void) => (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } };

function CsvBtn({ id, title, rows }: { id: string; title: string; rows: Record<string, unknown>[] }) {
  if (!rows.length) return null;
  return (
    <button data-testid={`csv-${id}`} aria-label={`Download ${title} as CSV`} title="Download CSV" onClick={() => downloadEngineCSV(`engine-profile-${id}.csv`, rows)}
      className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[3px] bg-foreground/10 hover:bg-foreground/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring print:hidden">
      <Download className="h-3 w-3" />
    </button>
  );
}

export function EngineDonut({ id, title, legendTitle, data, total, selected, onPick, loading }: {
  id: string; title: string; legendTitle: string; data: CategoryCount[]; total: number; selected: string[]; onPick: (v: string) => void; loading: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const R = 70, r = 46, C = 100;
  let a0 = -Math.PI / 2;
  const arcs = data.map((d, i) => {
    const a1 = a0 + d.share * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (rad: number, ang: number) => `${C + rad * Math.cos(ang)} ${C + rad * Math.sin(ang)}`;
    const path = d.share >= 0.99999
      ? `M ${p(R, 0)} A ${R} ${R} 0 1 1 ${p(R, Math.PI)} A ${R} ${R} 0 1 1 ${p(R, 0)} M ${p(r, 0)} A ${r} ${r} 0 1 0 ${p(r, Math.PI)} A ${r} ${r} 0 1 0 ${p(r, 0)} Z`
      : `M ${p(R, a0)} A ${R} ${R} 0 ${large} 1 ${p(R, a1)} L ${p(r, a1)} A ${r} ${r} 0 ${large} 0 ${p(r, a0)} Z`;
    const mid = (a0 + a1) / 2;
    a0 = a1;
    return { d, i, path, mid, color: COLORS[i % COLORS.length] };
  });
  const h = hover != null ? arcs[hover] : null;
  const anySel = selected.length > 0;
  return (
    <section className="panel flex min-w-0 flex-col rounded-[3px] bg-card" aria-label={title}>
      <div className="flex items-start gap-2 px-2 pt-1.5">
        <div className="mr-auto min-w-0">
          <h2 className="text-[11.5px] font-semibold leading-tight">{title}</h2>
          <p className="text-[10px] text-muted-foreground">Share of profile entries ({total} rows), not fleet or installed-engine share</p>
        </div>
        <CsvBtn id={id} title={title} rows={data.map((d) => ({ [legendTitle]: d.name, profile_entries: d.count, share_pct: +(d.share * 100).toFixed(2) }))} />
      </div>
      {loading ? <Skeleton className="m-3 h-[190px] rounded-full" /> : (
        <div className="flex flex-1 flex-col items-center gap-2 px-2 py-1 sm:flex-row sm:items-start">
          <div className="relative w-full max-w-[260px] shrink-0 sm:w-[48%] sm:max-w-[220px]">
            <svg viewBox="-12 -12 224 224" className="w-full" role="img" aria-label={`${title} donut; full counts and shares listed in the legend`}>
              {arcs.map((a) => {
                const on = selected.includes(a.d.name);
                return (
                  <path key={a.d.name} d={a.path} fill={a.color} fillRule="evenodd" tabIndex={0} role="button" aria-pressed={on}
                    aria-label={`${lbl(a.d.name)}: ${a.d.count} profile entries, ${pct(a.d.share)}`} data-testid={`donut-${id}-${a.d.name}`}
                    onMouseEnter={() => setHover(a.i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(a.i)} onBlur={() => setHover(null)}
                    onClick={() => onPick(a.d.name)} onKeyDown={onKey(() => onPick(a.d.name))}
                    className="cursor-pointer outline-none transition-opacity"
                    style={{ opacity: anySel && !on ? 0.35 : hover != null && hover !== a.i ? 0.7 : 1, stroke: on || hover === a.i ? "hsl(var(--foreground))" : "hsl(var(--card))", strokeWidth: on || hover === a.i ? 1.5 : 0.6 }} />
                );
              })}
              {arcs.filter((a) => a.d.share >= 0.06).map((a) => (
                <text key={`t-${a.d.name}`} x={C + 84 * Math.cos(a.mid)} y={C + 84 * Math.sin(a.mid) + 3} textAnchor={Math.cos(a.mid) >= 0 ? "start" : "end"} fontSize="8.5" className="pointer-events-none fill-foreground tnum">{pct(a.d.share)}</text>
              ))}
              <text x={C} y={C - 2} textAnchor="middle" fontSize="13" fontWeight="600" className="fill-foreground tnum">{h ? h.d.count : total}</text>
              <text x={C} y={C + 11} textAnchor="middle" fontSize="7.5" className="fill-muted-foreground">{h ? pct(h.d.share) : "profile entries"}</text>
            </svg>
            {h && (
              <div role="tooltip" className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-[3px] border border-border bg-popover px-2 py-1 text-[11px] shadow-lg">
                <span className="font-semibold">{lbl(h.d.name)}</span> &middot; {h.d.count} of {total} entries &middot; {pct(h.d.share)}
              </div>
            )}
          </div>
          <div className="w-full min-w-0 flex-1 text-[11px]" role="list" aria-label={`${legendTitle} legend`}>
            <div className="mb-0.5 flex justify-between font-semibold"><span>{legendTitle}</span><span className="text-muted-foreground">{data.length}</span></div>
            <div className="thin-scroll max-h-[190px] overflow-y-auto pr-1">
              {arcs.map((a) => {
                const on = selected.includes(a.d.name);
                return (
                  <button key={a.d.name} role="listitem" aria-pressed={on} data-testid={`legend-${id}-${a.d.name}`} onClick={() => onPick(a.d.name)}
                    onMouseEnter={() => setHover(a.i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(a.i)} onBlur={() => setHover(null)}
                    title={`${lbl(a.d.name)}: ${a.d.count} profile entries (${pct(a.d.share)})`}
                    className={`flex w-full items-center gap-1.5 rounded-[2px] px-1 py-[1px] text-left hover:bg-primary/10 focus-visible:bg-primary/15 focus-visible:outline-none ${on ? "font-semibold" : anySel ? "opacity-50" : ""}`}>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: a.color }} />
                    <span className="min-w-0 whitespace-normal break-words leading-tight">{lbl(a.d.name)}</span>
                    <span className="ml-auto shrink-0 pl-2 text-muted-foreground tnum">{a.d.count} &middot; {pct(a.d.share)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export function CertificationList({ entries, selected, onPick, loading }: { entries: CertificationEntry[]; selected: string[]; onPick: (v: string) => void; loading: boolean }) {
  const [desc, setDesc] = useState(true);
  const shown = desc ? entries : [...entries].reverse();
  return (
    <section className="panel flex min-w-0 flex-col rounded-[3px] bg-card" aria-label="Engine variant certification dates">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-end gap-1.5 border-b border-foreground/30 px-2 pb-1 pt-1.5 text-[11px] font-semibold">
        <span>Engine Variant</span>
        <span className="flex items-center justify-between gap-1">
          <button data-testid="sort-certification" onClick={() => setDesc((d) => !d)} aria-label={`Sort certification date ${desc ? "ascending" : "descending"}`} className="flex items-center gap-0.5 text-left hover:text-primary">
            Engine certification date {desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
          </button>
          <CsvBtn id="certification-dates" title="engine variant certification dates" rows={shown.map((e) => ({ EngineVariant: e.variant, EngineCertificationDate: e.date, profile_entries: e.rows }))} />
        </span>
      </div>
      <div className="thin-scroll h-[226px] overflow-y-auto py-0.5" role="list">
        {loading ? Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="mx-2 my-1 h-3.5" />) : shown.map((e) => {
          const on = selected.includes(e.variant);
          return (
            <button key={`${e.variant}|${e.date}`} role="listitem" aria-pressed={on} data-testid={`cert-${e.variant}-${e.date}`} onClick={() => onPick(e.variant)}
              title={`${lbl(e.variant)} certified ${e.date || "(blank)"}; ${e.rows} profile entr${e.rows === 1 ? "y" : "ies"}${on ? " (click to clear)" : " (click to filter variant)"}`}
              className={`grid w-full grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-1.5 px-2 py-[2px] text-left text-[11px] transition-colors hover:bg-primary/10 focus-visible:bg-primary/15 focus-visible:outline-none ${on ? "bg-primary/20 font-semibold" : selected.length ? "opacity-55" : ""}`}>
              <span className="truncate font-medium">{lbl(e.variant)}</span>
              <span className="tnum">{e.date || "\u2014"}</span>
            </button>
          );
        })}
      </div>
      <div className="border-t border-foreground/30 px-2 py-1 text-[10.5px] text-muted-foreground">{entries.length} variant/date pairs &middot; TBC first</div>
    </section>
  );
}

type Col = { key: keyof EngineProfileRecord; label: string; w: number; wrap?: boolean };
const COLS: Col[] = [
  { key: "aircraftManufacturer", label: "Aircraft Mfr", w: 90 },
  { key: "aircraftModel", label: "Model", w: 70 },
  { key: "aircraftType", label: "Type", w: 90 },
  { key: "comment", label: "Comment", w: 440, wrap: true },
  { key: "competingEngineType", label: "Competing Engine Type", w: 130, wrap: true },
  { key: "certificationDate", label: "Engine Certification Date", w: 100 },
  { key: "engineFamily", label: "Engine Family", w: 100 },
  { key: "engineManufacturer", label: "Engine Manufacturer", w: 130 },
  { key: "engineVariant", label: "Sub Variant", w: 110 },
  { key: "soleSupplier", label: "Sole Supplier", w: 70 },
  { key: "faaTcdsHolder", label: "FAA TCDS Holder", w: 150, wrap: true },
  { key: "thrust", label: "Thrust lbf", w: 90 },
  { key: "thrustNotes", label: "Thrust Notes", w: 200, wrap: true },
];
type Sort = { key: keyof EngineProfileRecord; dir: "asc" | "desc" } | null;

export function EngineDetailTable({ rows, loading }: { rows: EngineProfileRecord[]; loading: boolean }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>({ key: "aircraftManufacturer", dir: "asc" });
  const view = useMemo(() => {
    const s = q.trim().toLowerCase();
    let out = s ? rows.filter((r) => COLS.some((c) => String(r[c.key]).toLowerCase().includes(s))) : rows;
    if (sort) {
      const m = sort.dir === "asc" ? 1 : -1;
      out = [...out].sort((a, b) =>
        String(a[sort.key]).localeCompare(String(b[sort.key]), undefined, { numeric: true }) * m ||
        a.aircraftModel.localeCompare(b.aircraftModel) ||
        a.engineFamily.localeCompare(b.engineFamily) ||
        a.engineVariant.localeCompare(b.engineVariant));
    }
    return out;
  }, [rows, q, sort]);
  const toggle = (k: keyof EngineProfileRecord) => setSort((s) => (!s || s.key !== k ? { key: k, dir: "asc" } : s.dir === "asc" ? { key: k, dir: "desc" } : null));
  const minW = COLS.reduce((s, c) => s + c.w, 0);
  return (
    <section className="panel min-w-0 rounded-[3px] bg-card" aria-label="Engine profile source detail">
      <div className="flex flex-wrap items-center gap-2 px-2 py-1.5">
        <h2 className="text-[12px] font-semibold">Source detail</h2>
        <span className="text-[11px] text-muted-foreground tnum" data-testid="text-detail-count">{view.length} of {rows.length} filtered profile entries{q && " (table search applied)"}</span>
        <div className="ml-auto flex items-center gap-1.5 print:hidden">
          <label className="flex h-[26px] w-[220px] items-center gap-1.5 rounded-[3px] border border-input bg-background/40 px-2 focus-within:border-primary">
            <Search className="h-3.5 w-3.5 opacity-60" />
            <input data-testid="input-search-detail" value={q} maxLength={200} onChange={(e) => setQ(e.target.value)} placeholder="Search this table only" className="h-full w-full bg-transparent text-[12px] outline-none" aria-label="Search detail table (table only)" />
            {q && <button onClick={() => setQ("")} aria-label="Clear search" data-testid="button-clear-detail-search"><X className="h-3.5 w-3.5" /></button>}
          </label>
          <button data-testid="button-export-detail" disabled={!view.length} onClick={() => downloadEngineCSV("engine-profile-detail.csv", view.map(detailExportRow))} className="flex h-[26px] items-center gap-1 rounded-[4px] bg-foreground/10 px-2 text-[12px] hover:bg-foreground/20 disabled:opacity-50">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        </div>
      </div>
      <div className="thin-scroll max-h-[520px] overflow-auto border-t border-foreground/30" tabIndex={0} aria-label="Scrollable source detail" data-testid="table-detail">
        <table className="w-full border-collapse text-[11.5px]" style={{ minWidth: minW }}>
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b border-foreground/30">
              {COLS.map((c) => {
                const on = sort?.key === c.key;
                return (
                  <th key={c.key} style={{ width: c.w }} aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className="p-0 text-left align-bottom">
                    <button data-testid={`sort-${c.key}`} onClick={() => toggle(c.key)} className={`flex w-full items-center gap-1 px-2 py-1.5 text-left text-[11px] font-semibold uppercase leading-tight tracking-[0.02em] hover:bg-primary/10 ${on ? "text-primary" : ""}`}>
                      {c.label}{on && (sort.dir === "asc" ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ArrowDown className="h-3 w-3 shrink-0" />)}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? Array.from({ length: 8 }).map((_, i) => <tr key={i}><td colSpan={COLS.length} className="px-2 py-1"><Skeleton className="h-4" /></td></tr>) :
              view.length === 0 ? (
                <tr><td colSpan={COLS.length} className="py-10 text-center" data-testid="empty-detail">
                  <div className="text-[13px] font-semibold">No rows contain "{q}"</div>
                  <button onClick={() => setQ("")} className="mt-2 rounded-[3px] bg-primary px-3 py-1 text-[12px] text-primary-foreground">Clear search</button>
                </td></tr>
              ) : view.map((r, i) => (
                <tr key={r.id} data-testid={`row-detail-${r.id}`} className={`align-top hover:bg-primary/10 ${i % 2 ? "bg-foreground/[0.045]" : ""}`}>
                  {COLS.map((c) => (
                    <td key={c.key} className={`px-2 py-1 ${c.wrap ? "whitespace-normal break-words leading-snug" : "whitespace-nowrap"} ${c.key === "aircraftManufacturer" || c.key === "engineVariant" ? "font-medium" : ""}`}>
                      {r[c.key] === "" ? <span className="text-muted-foreground">{"\u2014"}</span> : String(r[c.key])}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-foreground/30 px-2 py-1 text-[10.5px] text-muted-foreground">All {rows.length} filtered rows render in one scroll area. Comments are shown in full. Blank source fields show as a dash; CSV keeps raw values.</div>
    </section>
  );
}
