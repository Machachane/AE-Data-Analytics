import { useMemo, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type { JurisdictionRiskRecord } from "@workspace/api-client-react";
import { ArrowDown, ArrowUp, Download, Search, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadEngineCSV } from "@/lib/engine-profile";
import { categoryColor, exportRow, prettyRegion, prettyType } from "@/lib/jurisdiction-risk";

type R = JurisdictionRiskRecord;
export type JCol = { key: keyof R; label: string; num?: boolean; render: (r: R) => ReactNode; text: (r: R) => string };

function Bar({ v, color }: { v: number | null; color: string }) {
  if (v == null) return <span className="text-muted-foreground" title="Blank in source">{"\u2014"}</span>;
  const w = Math.max(0, Math.min(100, v));
  return (
    <span className="flex items-center gap-1.5" title={`Exact score: ${v} (scale 0 to 100)`}>
      <span className="relative h-3 flex-1 bg-foreground/[0.06]"><span className="absolute inset-y-0 left-0" style={{ width: `${w}%`, background: color }} /></span>
      <span className="w-7 shrink-0 text-right tnum">{v}</span>
    </span>
  );
}
export const COL_COUNTRY: JCol = { key: "country", label: "Country", render: (r) => <span className="font-medium">{r.country}</span>, text: (r) => r.country };
export const COL_DEREG: JCol = { key: "deregistrationScore", label: "Deregistration Score", num: true, render: (r) => <Bar v={r.deregistrationScore} color="#1f5fe0" />, text: (r) => String(r.deregistrationScore ?? "") };
export const COL_TYPE: JCol = { key: "jurisdictionType", label: "Jurisdiction Type", render: (r) => prettyType(r.jurisdictionType), text: (r) => prettyType(r.jurisdictionType) };
export const COL_REGION: JCol = { key: "region", label: "Region", render: (r) => prettyRegion(r.region), text: (r) => prettyRegion(r.region) };
export const COL_REPO: JCol = { key: "repossessionOverallScore", label: "Repossession Overall Score", num: true, render: (r) => <Bar v={r.repossessionOverallScore} color="#1fcf8a" />, text: (r) => String(r.repossessionOverallScore ?? "") };
export const COL_CAT: JCol = { key: "repossessionCategory", label: "Category", render: (r) => <span className="font-medium" style={{ color: categoryColor(r.repossessionCategory) }}>{r.repossessionCategory}</span>, text: (r) => r.repossessionCategory };

export function CountryTable({ id, title, cols, widths, rows, selected, onToggle, loading }: {
  id: string; title: string; cols: JCol[]; widths: string; rows: R[]; selected: string[]; onToggle: (c: string) => void; loading: boolean;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: keyof R; dir: 1 | -1 }>({ key: "country", dir: 1 });
  const view = useMemo(() => {
    const s = q.trim().toLowerCase();
    const out = s ? rows.filter((r) => cols.some((c) => c.text(r).toLowerCase().includes(s))) : [...rows];
    return out.sort((a, b) => {
      const x = a[sort.key], y = b[sort.key];
      if (x == null && y == null) return a.country.localeCompare(b.country);
      if (x == null) return 1;
      if (y == null) return -1;
      const d = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return d * sort.dir || a.country.localeCompare(b.country);
    });
  }, [rows, q, sort, cols]);
  const anySel = selected.length > 0;
  const key = (c: string) => (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(c); } };
  return (
    <section className="panel flex min-w-0 flex-col rounded-[3px] bg-card" aria-label={title}>
      <div className="flex items-center gap-1.5 px-2 py-1.5 print:hidden">
        <label className="flex h-[24px] flex-1 items-center gap-1 rounded-[3px] border border-input bg-background/40 px-1.5 focus-within:border-primary">
          <Search className="h-3 w-3 opacity-60" />
          <input data-testid={`input-search-${id}`} value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} placeholder="Search this table" aria-label={`Search ${title}`} className="h-full w-full bg-transparent text-[11.5px] outline-none" />
          {q && <button onClick={() => setQ("")} aria-label="Clear search"><X className="h-3 w-3" /></button>}
        </label>
        <button data-testid={`csv-${id}`} disabled={!view.length} title="Download CSV (raw source values)" aria-label={`Download ${title} as CSV`} onClick={() => downloadEngineCSV(`jurisdiction-risk-${id}.csv`, view.map(exportRow))}
          className="flex h-[24px] w-[24px] items-center justify-center rounded-[3px] bg-foreground/10 hover:bg-foreground/20 disabled:opacity-50"><Download className="h-3 w-3" /></button>
      </div>
      <div className="thin-scroll h-[300px] overflow-auto border-t border-foreground/30" data-testid={`table-${id}`}>
        <div role="table" aria-label={title} className="min-w-[340px] text-[11.5px]">
          <div role="row" className="sticky top-0 z-10 grid border-b border-foreground/30 bg-card" style={{ gridTemplateColumns: widths }}>
            {cols.map((c) => {
              const on = sort.key === c.key;
              return (
                <div role="columnheader" key={c.key} aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                  <button data-testid={`sort-${id}-${c.key}`} onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : c.num ? -1 : 1 }))}
                    className={`flex w-full items-center gap-0.5 px-1.5 py-1 text-left font-semibold leading-tight hover:bg-primary/10 ${on ? "text-primary" : ""}`}>
                    {c.label}{on && (sort.dir === 1 ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ArrowDown className="h-3 w-3 shrink-0" />)}
                  </button>
                </div>
              );
            })}
          </div>
          {loading ? Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="mx-2 my-1 h-3.5" />) :
            view.length === 0 ? (
              <div className="py-8 text-center text-[12px]">No countries contain "{q}"<br /><button onClick={() => setQ("")} className="mt-2 rounded-[3px] bg-primary px-2 py-0.5 text-primary-foreground">Clear search</button></div>
            ) : view.map((r) => {
              const on = selected.includes(r.country);
              return (
                <div role="row" key={r.id} tabIndex={0} aria-selected={on} data-testid={`row-${id}-${r.alpha3}`} onClick={() => onToggle(r.country)} onKeyDown={key(r.country)}
                  title={on ? "Click to remove country filter" : "Click to filter to this country"}
                  className={`grid cursor-pointer items-center outline-none hover:bg-primary/10 focus-visible:bg-primary/15 ${on ? "bg-primary/20 font-semibold" : anySel ? "opacity-55" : ""}`} style={{ gridTemplateColumns: widths }}>
                  {cols.map((c) => <div role="cell" key={c.key} className="min-w-0 truncate px-1.5 py-[2px]">{c.render(r)}</div>)}
                </div>
              );
            })}
        </div>
      </div>
      <div className="border-t border-foreground/30 px-2 py-0.5 text-[10.5px] text-muted-foreground tnum">{view.length} of {rows.length} countries{q && " (table search only)"}</div>
    </section>
  );
}
