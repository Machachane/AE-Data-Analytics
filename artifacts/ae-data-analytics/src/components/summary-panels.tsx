import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import type { SummaryFinance, SummaryIntensity, SummaryValue, SummaryVolume } from "@workspace/api-client-react";
import { Download } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { SUMMARY_COLORS, downloadText, fmt2, fmtFull, fmtInt, pct, toCsv } from "@/lib/summary";

export function Panel({ title, children, onExport, note, id, className = "" }: { title: ReactNode; children: ReactNode; onExport?: () => void; note?: ReactNode; id: string; className?: string }) {
  return (
    <section className={`panel flex min-w-0 flex-col rounded-[3px] bg-card ${className}`} data-testid={`panel-${id}`}>
      <div className="flex items-center gap-2 px-2 pt-1.5">
        <h2 className="truncate text-[11.5px] font-semibold">{title}</h2>
        {onExport && <button data-testid={`button-export-${id}`} onClick={onExport} title="Export all rows as CSV" className="ml-auto flex items-center gap-1 rounded-[3px] px-1 text-[10.5px] text-muted-foreground hover:bg-foreground/10 hover:text-foreground print:hidden"><Download className="h-3 w-3" />CSV</button>}
      </div>
      <div className="min-h-0 flex-1 p-2 pt-1">{children}</div>
      {note && <div className="px-2 pb-1.5 text-[10px] leading-snug text-muted-foreground">{note}</div>}
    </section>
  );
}

const Empty = ({ text = "No source rows under these filters." }: { text?: string }) => <div className="flex h-full min-h-[80px] items-center justify-center text-center text-[11px] text-muted-foreground">{text}</div>;
const Loading = () => <div className="space-y-1.5">{Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-3.5" />)}</div>;

/** Two-column region table with inline hbar, as in the reference. All rows scroll. */
export function RegionBars({ id, title, valueLabel, rows, color, loading }: { id: string; title: string; valueLabel: string; rows: SummaryValue[]; color: string; loading: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <Panel id={id} title={title} onExport={rows.length ? () => downloadText(`summary-${id}.csv`, toCsv(["Region", valueLabel], rows.map((r) => [r.name, r.value]))) : undefined}
      note={rows.length ? `${rows.length} regions, total ${fmtInt(total)}` : undefined}>
      {loading ? <Loading /> : !rows.length ? <Empty /> : (
        <div className="thin-scroll max-h-[170px] overflow-y-auto text-[11px]">
          <div className="sticky top-0 grid grid-cols-[1fr_1fr] border-b border-foreground/30 bg-card py-0.5 font-semibold"><span>Region</span><span>{valueLabel}</span></div>
          {rows.map((r) => (
            <div key={r.name} title={`${r.name}: ${fmtFull(r.value)} (${pct(r.value, total)})`} className="grid grid-cols-[1fr_1fr] items-center gap-1 py-[1px] hover:bg-primary/10">
              <span className="truncate">{r.name || "(Blank)"}</span>
              <span className="relative flex h-[13px] items-center justify-end">
                <span className="absolute inset-y-0 left-0" style={{ width: `${(r.value / max) * 100}%`, background: color }} />
                <span className="relative pr-0.5 tnum">{fmtInt(r.value)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

const tipStyle = { background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 11, borderRadius: 3 };

export function ManufacturerColumns({ rows, loading }: { rows: SummaryVolume[]; loading: boolean }) {
  return (
    <Panel id="manufacturer-volumes" title="Orders and deliveries by manufacturer" onExport={rows.length ? () => downloadText("summary-manufacturer-volumes.csv", toCsv(["Manufacturer", "Total Orders", "Total Deliveries"], rows.map((r) => [r.name, r.orders, r.deliveries]))) : undefined}>
      {loading ? <Skeleton className="h-[170px]" /> : !rows.length ? <Empty /> : (
        <div className="h-[180px]">
          <ResponsiveContainer>
            <BarChart data={rows.map((r) => ({ ...r, name: r.name || "(Blank)" }))} margin={{ top: 4, right: 4, left: -14, bottom: 0 }} barGap={2}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="2 3" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval={0} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
              <RTooltip contentStyle={tipStyle} cursor={{ fill: "hsl(var(--foreground) / 0.06)" }} formatter={(v: number) => fmtFull(v)} />
              <Legend wrapperStyle={{ fontSize: 10 }} iconSize={8} verticalAlign="top" height={18} />
              <Bar dataKey="orders" name="Total Orders" fill={SUMMARY_COLORS.order} />
              <Bar dataKey="deliveries" name="Total Deliveries" fill={SUMMARY_COLORS.delivery} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}

const shareColor = (n: string, i: number) => (/airbus/i.test(n) ? SUMMARY_COLORS.airbus : /boeing/i.test(n) ? SUMMARY_COLORS.boeing : ["#e5a823", "#c05bd6", SUMMARY_COLORS.other][i % 3]);

export function ManufacturerDonut({ rows, loading }: { rows: SummaryValue[]; loading: boolean }) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  let cumulative = 0;
  const segments = rows.map((r, i) => {
    const start = cumulative;
    cumulative += total ? r.value / total : 0;
    return { ...r, start, fraction: total ? r.value / total : 0, color: shareColor(r.name, i) };
  });
  return (
    <Panel id="delivery-shares" title="Total deliveries by manufacturer"
      onExport={rows.length ? () => downloadText("summary-manufacturer-shares.csv", toCsv(["Manufacturer", "Deliveries", "Share (%)"], rows.map(r => [r.name, r.value, total ? r.value / total * 100 : null]))) : undefined}>
      {loading ? <Skeleton className="mx-auto h-[150px] w-[150px] rounded-full" /> : !total ? <Empty /> : (
        <div className="flex h-[180px] items-center gap-2">
          <div className="min-w-0 flex-1">
            <svg viewBox="0 0 120 120" className="h-[150px] w-full" role="img" aria-label={`Manufacturer shares of ${fmtFull(total)} deliveries`}>
              <g transform="rotate(-90 60 60)">
                {segments.map(r => <circle key={r.name} cx={60} cy={60} r={42} fill="none" stroke={r.color}
                  strokeWidth={18} pathLength={1} strokeDasharray={`${r.fraction} ${1 - r.fraction}`}
                  strokeDashoffset={-r.start} tabIndex={0} role="img" aria-label={`${r.name}: ${fmtFull(r.value)} deliveries, ${pct(r.value, total)}`}>
                  <title>{r.name || "(Blank)"}: {fmtFull(r.value)} deliveries ({pct(r.value, total)})</title>
                </circle>)}
              </g>
            </svg>
          </div>
          <ul className="space-y-1 text-[11px]">
            {rows.map((r, i) => (
              <li key={r.name} className="flex items-center gap-1.5" data-testid={`share-${r.name}`}><span className="h-2 w-2 rounded-full" style={{ background: shareColor(r.name, i) }} /><span>{r.name || "(Blank)"}</span><span className="tnum font-semibold">{pct(r.value, total)}</span></li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

export function IntensityBars({ rows, loading, limit }: { rows: SummaryIntensity[]; loading: boolean; limit: number }) {
  const max = Math.max(1, ...rows.filter((r) => !r.unavailable).map((r) => r.value));
  return (
    <Panel id="intensity" title={<>Airline CO<sub>2</sub> intensity (gCO<sub>2</sub>e/RTK)</>}
      onExport={rows.length ? () => downloadText("summary-co2-intensity.csv", toCsv(["Airline", "gCO2e/RTK", "Unavailable", "Source rows"], rows.map((r) => [r.name, r.unavailable ? "" : r.value, r.unavailable ? "yes" : "no", r.rows]))) : undefined}
      note={`Transport-weighted gCO2e/RTK, not an arithmetic mean. Up to ${limit} airlines; outliers kept.`}>
      {loading ? <Loading /> : !rows.length ? <Empty text="No matched emission rows." /> : (
        <div className="thin-scroll max-h-[230px] overflow-y-auto text-[11px]">
          <div className="sticky top-0 grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] border-b border-foreground/30 bg-card py-0.5 font-semibold"><span>Airline</span><span>gCO<sub>2</sub>e/RTK</span></div>
          {rows.map((r, i) => (
            <div key={`${r.name}-${i}`} title={r.unavailable ? `${r.name}: unavailable. Transport weights missing in ${r.rows} source rows; this is not zero emissions.` : `${r.name}: ${fmtFull(r.value)} gCO2e/RTK from ${r.rows} source rows`}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] items-center gap-1 py-[1px] hover:bg-primary/10">
              <span className="truncate">{r.name}</span>
              {r.unavailable ? <span className="italic text-muted-foreground">unavailable</span> : (
                <span className="relative flex h-[13px] items-center justify-end">
                  <span className="absolute inset-y-0 left-0" style={{ width: `${(r.value / max) * 100}%`, background: SUMMARY_COLORS.bar }} />
                  <span className="relative pr-0.5 tnum">{fmtInt(r.value)}</span>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export function EngineTable({ rows, loading }: { rows: SummaryVolume[]; loading: boolean }) {
  return (
    <Panel id="engines" title="Engine code: deliveries and orders"
      onExport={rows.length ? () => downloadText("summary-engine-codes.csv", toCsv(["Engine Code", "Total Deliveries", "Total Orders"], rows.map((r) => [r.name, r.deliveries, r.orders]))) : undefined}
      note="Source order/delivery vendor codes (CF, GE, PW, RR, NS, Unidentified), not fleet engine models. Per-variant counts are not allocated.">
      {loading ? <Loading /> : !rows.length ? <Empty /> : (
        <div className="thin-scroll max-h-[230px] overflow-y-auto text-[11px]">
          <div className="sticky top-0 grid grid-cols-[1fr_80px_70px] border-b border-foreground/30 bg-card py-0.5 font-semibold"><span>Engine Code</span><span className="text-right">Total Deliveries</span><span className="text-right">Total Orders</span></div>
          {rows.map((r) => (
            <div key={r.name} className="grid grid-cols-[1fr_80px_70px] py-[1px] hover:bg-primary/10" data-testid={`row-engine-${r.name}`}>
              <span>{r.name || "(Blank)"}</span><span className="text-right tnum">{fmtInt(r.deliveries)}</span><span className="text-right tnum">{fmtInt(r.orders)}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export function FinanceTable({ rows, year, sourceRows, loading }: { rows: SummaryFinance[]; year: string; sourceRows: number; loading: boolean }) {
  return (
    <Panel id="finance" title={`Financials, FY ${year || "\u2014"}`}
      onExport={rows.length ? () => downloadText("summary-financials.csv", toCsv(["Category", "Presentation amount", "Source amount", "Financial Year", "IFRS16/ASC842 Adoption", "Source rows"], rows.map((r) => [r.category, r.amount, r.rawAmount, r.financialYear, r.ifrs, r.rows]))) : undefined}
      note={`Exploratory sum of ${fmtInt(sourceRows)} source lines across periods and scopes, not a consolidated statement. USD at source scale (no unit declared). Liabilities and Total Equity shown negative for presentation.`}>
      {loading ? <Loading /> : !rows.length ? <Empty text="No financial lines for this airline and year." /> : (
        <div className="thin-scroll max-h-[230px] overflow-y-auto overflow-x-hidden text-[11px]">
          <div className="sticky top-0 grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.6fr)_minmax(0,0.8fr)] gap-x-1 border-b border-foreground/30 bg-card py-0.5 font-semibold"><span>Financials</span><span className="break-words text-right leading-tight">Amount</span><span className="break-words leading-tight">FY</span><span className="break-all leading-tight">IFRS16/ ASC842</span></div>
          {rows.map((r) => {
            const flipped = r.amount != null && r.rawAmount != null && r.amount !== r.rawAmount;
            return (
              <div key={r.category} className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.6fr)_minmax(0,0.8fr)] gap-x-1 py-[1px] hover:bg-primary/10" data-testid={`row-finance-${r.category}`}>
                <span className="break-words leading-tight">{r.category}</span>
                <span title={`Presentation ${fmtFull(r.amount)}; source ${fmtFull(r.rawAmount)} USD (source scale)${flipped ? ". Presentation sign applied; source value unchanged." : ""}. ${r.rows} lines.`}
                  className={`cursor-help break-all text-right tnum ${r.amount != null && r.amount < 0 ? "text-[#ff6b6b]" : "text-[#1fd18b]"}`}>{fmt2(r.amount)}</span>
                <span className="break-words">{r.financialYear}</span><span className="break-words">{r.ifrs || "\u2014"}</span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
