import { useEffect, useMemo, useState } from "react";
import {
  getGetAirlineFinancialAnalyticsQueryKey,
  useGetAirlineFinancialAnalytics,
} from "@workspace/api-client-react";
import type {
  AirlineFinancialAnalyticsMeasure,
  AirlineFinancialAnalyticsStatement,
  AirlineFinancialOptions,
  AirlineStatementChoice,
  GetAirlineFinancialAnalyticsParams,
} from "@workspace/api-client-react";
import {
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Layers3,
  LineChart as LineChartIcon,
  Scale,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

type Props = { options: AirlineFinancialOptions | undefined; airline: string };
type Basis = Pick<AirlineStatementChoice, "scope" | "fiscalYearEnd" | "currency" | "status" | "ifrs" | "inAdministration">;
type Input = AirlineFinancialAnalyticsMeasure["inputs"][number];

const basisKeys: (keyof Basis)[] = ["scope", "fiscalYearEnd", "currency", "status", "ifrs", "inAdministration"];
const basisOf = (choice: AirlineStatementChoice): Basis => ({
  scope: choice.scope,
  fiscalYearEnd: choice.fiscalYearEnd,
  currency: choice.currency,
  status: choice.status,
  ifrs: choice.ifrs,
  inAdministration: choice.inAdministration,
});
const basisId = (basis: Basis) => basisKeys.map((key) => basis[key]).join("¦");
const sameBasis = (a: Basis, b: Basis) => basisKeys.every((key) => a[key] === b[key]);
const periodLabel = (statement: AirlineFinancialAnalyticsStatement) => `${statement.financialYear} · ${statement.period}`;
const periodRank = ["Yr", "FY", "H1", "6M", "Q1", "Q2", "9M", "10M", "15M", "H2", "Q3", "Q4"];
const periodName: Record<string, string> = {
  Yr: "YR · Full year",
  H1: "H1 · First half",
  H2: "H2 · Second half",
  Q1: "Q1 · First quarter",
  Q2: "Q2 · Second quarter",
  Q3: "Q3 · Third quarter",
  Q4: "Q4 · Fourth quarter",
};
const statementOrder = (a: AirlineFinancialAnalyticsStatement, b: AirlineFinancialAnalyticsStatement) =>
  a.financialYear.localeCompare(b.financialYear, undefined, { numeric: true }) ||
  periodRank.indexOf(a.period) - periodRank.indexOf(b.period);
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const numeric = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? "Unavailable" : value.toLocaleString("en-US", { maximumFractionDigits: 3 });
const availableValue = (measure?: AirlineFinancialAnalyticsMeasure | null) =>
  measure?.availability === "available" && measure.value != null && Number.isFinite(measure.value) ? measure.value : null;
const unavailableLabel = (measure?: AirlineFinancialAnalyticsMeasure) => {
  switch (measure?.availability) {
    case "missing-input": return "Missing source input";
    case "zero-denominator": return "Zero denominator";
    case "ambiguous-input": return "Ambiguous source input";
    default: return "Unavailable";
  }
};

function SelectControl({ label, value, options, onChange, testId, disabled = false }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  testId: string;
  disabled?: boolean;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[9px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">{label}</span>
      <select
        aria-label={label}
        data-testid={testId}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full min-w-0 rounded-[3px] border border-input bg-background px-2.5 text-[11px] text-foreground outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function MeasureTrace({ measure, statement, testId }: {
  measure: AirlineFinancialAnalyticsMeasure;
  statement?: AirlineFinancialAnalyticsStatement;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const stateLabel = measure.availability === "available" ? "Available" : unavailableLabel(measure);
  return (
    <div className="min-w-0">
      <button
        type="button"
        data-testid={`button-trace-${testId}`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex min-h-6 items-center gap-1 text-[9px] font-medium text-primary hover:text-primary/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Trace source lines
      </button>
      {open && (
        <div className="mt-1.5 rounded-[3px] border border-border/80 bg-background/70 p-2.5 text-[9px]" data-testid={`trace-${testId}`}>
          <div className="grid gap-1.5 sm:grid-cols-2">
            <div><span className="text-muted-foreground">Measure</span><div className="break-words font-medium">{measure.name}</div></div>
            <div><span className="text-muted-foreground">Availability</span><div className="font-medium">{stateLabel}</div></div>
            <div className="sm:col-span-2"><span className="text-muted-foreground">Formula / definition</span><div className="break-words">{measure.formula || "Not supplied"}</div></div>
            {statement && <div><span className="text-muted-foreground">Statement / source date</span><div>{statement.statementId} · {statement.sourceDate || "Date not supplied"}</div></div>}
          </div>
          <div className="mt-2 border-t border-border/70 pt-2">
            <div className="mb-1.5 font-semibold uppercase tracking-[0.1em] text-muted-foreground">Exact source inputs · original signs and scale</div>
            {measure.inputs.length ? (
              <div className="space-y-2">
                {measure.inputs.map((input, index) => (
                  <SourceInput key={`${input.recordId}-${input.sourceMetricId}-${index}`} input={input} testId={`${testId}-${input.recordId}-${index}`} />
                ))}
              </div>
            ) : <p className="text-muted-foreground">No source inputs supplied for this measure.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function SourceInput({ input, testId }: { input: Input; testId: string }) {
  return (
    <div className="grid grid-cols-1 gap-x-3 gap-y-1 border-l-2 border-primary/50 pl-2 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="break-words font-medium">{input.metric || "Unnamed source line"}</div>
        <div className="break-all text-muted-foreground">Record {input.recordId} · Metric ID {input.sourceMetricId || "not supplied"} · Category ID {input.sourceCategoryId || "not supplied"} · {input.sourceDate || "Date not supplied"}</div>
      </div>
      <div className="tnum text-left font-semibold sm:text-right" data-testid={`source-amount-${testId}`}>{numeric(input.amount)}</div>
    </div>
  );
}

function ValueTile({ title, measure, statement, testId, compact = false }: {
  title: string;
  measure?: AirlineFinancialAnalyticsMeasure;
  statement?: AirlineFinancialAnalyticsStatement;
  testId: string;
  compact?: boolean;
}) {
  const value = availableValue(measure);
  return (
    <article className={`min-w-0 border border-border bg-card ${compact ? "p-2.5 sm:p-3" : "p-3 sm:p-4"}`} data-testid={`measure-${testId}`}>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h3 className="truncate text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</h3>
        {measure && measure.availability !== "available" && (
          <span className="shrink-0 rounded-[2px] border border-border px-1.5 py-0.5 text-[8px] text-muted-foreground" data-testid={`availability-${testId}`}>{unavailableLabel(measure)}</span>
        )}
      </div>
      <div className={`mt-2 font-mono font-semibold tracking-tight ${compact ? "text-[15px]" : "text-[19px] sm:text-[22px]"}`} data-testid={`value-${testId}`}>
        {value == null ? <span className="text-muted-foreground">Unavailable</span> : numeric(value)}
      </div>
      <div className="mt-1 text-[9px] text-muted-foreground">{statement?.currency || "Currency not stated"} · source-reported scale</div>
      {measure && <div className="mt-1"><MeasureTrace measure={measure} statement={statement} testId={testId} /></div>}
    </article>
  );
}

function FinancialTrend({ statements, currency }: { statements: AirlineFinancialAnalyticsStatement[]; currency: string }) {
  const [traceOpen, setTraceOpen] = useState(false);
  const rows = statements.slice().sort(statementOrder).map((statement) => ({
    label: periodLabel(statement),
    revenue: availableValue(statement.reportedRevenue),
    operating: availableValue(statement.operatingResult),
    afterTax: availableValue(statement.afterTax),
  }));
  return (
    <section className="overflow-hidden border border-border bg-card" aria-label="Reported performance trend" data-testid="reported-performance">
      <div className="flex flex-wrap items-start gap-2 border-b border-border px-3 py-3 sm:px-4">
        <div className="mr-auto">
          <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-primary">02 · Reported performance</div>
          <h2 className="mt-1 text-[13px] font-semibold">Revenue &amp; earnings through time</h2>
          <p className="mt-1 text-[9px] text-muted-foreground">Reported values only · gaps remain where source inputs are missing or ambiguous.</p>
        </div>
        <span className="font-mono text-[9px] text-muted-foreground">{currency || "Currency not stated"} · source scale</span>
      </div>
      {rows.length > 0 ? (
        <div className="h-[250px] px-1 pb-2 pt-3 sm:h-[290px]" data-testid="chart-reported-performance">
          <ResponsiveContainer width="100%" height="100%" debounce={0}>
            <LineChart data={rows} margin={{ top: 8, right: 12, left: 3, bottom: 3 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 5" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} minTickGap={18} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(value: number) => Number(value).toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 })} width={48} />
              <Tooltip
                isAnimationActive={false}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload as typeof rows[number];
                  return <div className="rounded-[3px] border border-border bg-popover px-2.5 py-2 text-[10px] shadow-lg">
                    <div className="mb-1 font-semibold">{row.label}</div>
                    <div className="text-[#55c8bc]">Total revenue: <strong>{row.revenue == null ? "Unavailable" : numeric(row.revenue)}</strong></div>
                    <div className="text-[#e3a75b]">Operating result: <strong>{row.operating == null ? "Unavailable" : numeric(row.operating)}</strong></div>
                    <div className="text-[#83aee1]">Profit / (loss) after tax: <strong>{row.afterTax == null ? "Unavailable" : numeric(row.afterTax)}</strong></div>
                    <div className="mt-1 border-t border-border pt-1 text-muted-foreground">{currency || "Currency not stated"} · source-reported scale</div>
                  </div>;
                }}
              />
              <Legend wrapperStyle={{ fontSize: 9, color: "hsl(var(--muted-foreground))" }} />
              <Line type="linear" dataKey="revenue" name="Total revenue" stroke="#55c8bc" strokeWidth={2} dot={{ r: 2.5, fill: "#55c8bc", strokeWidth: 0 }} connectNulls={false} isAnimationActive={false} />
              <Line type="linear" dataKey="operating" name="Operating result" stroke="#e3a75b" strokeWidth={1.7} dot={{ r: 2, fill: "#e3a75b", strokeWidth: 0 }} connectNulls={false} isAnimationActive={false} />
              <Line type="linear" dataKey="afterTax" name="Profit / (loss) after tax" stroke="#83aee1" strokeWidth={1.7} dot={{ r: 2, fill: "#83aee1", strokeWidth: 0 }} connectNulls={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : <div className="flex h-40 items-center justify-center text-[10px] text-muted-foreground" data-testid="empty-performance">No statements match this exact basis and period.</div>}
      <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2 text-[8px] leading-relaxed text-muted-foreground">
        <CircleHelp className="h-3 w-3 shrink-0 text-primary" />
        No currency conversion or period annualisation is applied. Each line retains its reported amount and sign.
      </div>
      <div className="border-t border-border">
        <button
          type="button"
          data-testid="button-toggle-performance-traces"
          aria-expanded={traceOpen}
          onClick={() => setTraceOpen((current) => !current)}
          className="flex min-h-9 w-full items-center gap-1.5 px-3 text-left text-[9px] font-medium text-muted-foreground hover:bg-primary/[0.05] hover:text-foreground"
        >
          {traceOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Trace every plotted reported line
          <span className="ml-auto text-[8px]">{statements.length} matched statements</span>
        </button>
        {traceOpen && <div className="divide-y divide-border border-t border-border" data-testid="performance-trace-history">
          {statements.slice().sort(statementOrder).map((statement) => (
            <div key={statement.statementId} className="grid grid-cols-1 gap-x-4 gap-y-2 px-3 py-2 sm:grid-cols-[110px_repeat(3,minmax(0,1fr))]">
              <div className="text-[9px] font-semibold">{periodLabel(statement)}<div className="mt-0.5 font-normal text-muted-foreground">Statement {statement.statementId} · {statement.sourceDate || "Date not supplied"}</div></div>
              {([
                { label: "Revenue", measure: statement.reportedRevenue },
                { label: "Operating result", measure: statement.operatingResult },
                { label: "After tax", measure: statement.afterTax },
              ] as { label: string; measure: AirlineFinancialAnalyticsMeasure }[]).map(({ label, measure }) => (
                <div key={label} className="min-w-0">
                  <div className="mb-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
                  <MeasureTrace measure={measure} statement={statement} testId={`trend-${statement.statementId}-${slug(label)}`} />
                </div>
              ))}
            </div>
          ))}
        </div>}
      </div>
    </section>
  );
}

function Profitability({ statements }: { statements: AirlineFinancialAnalyticsStatement[] }) {
  const latest = statements.slice().sort(statementOrder).at(-1);
  const measures = useMemo(() => {
    const map = new Map<string, AirlineFinancialAnalyticsMeasure>();
    statements.forEach((statement) => statement.profitability.forEach((measure) => {
      if (!map.has(measure.key)) map.set(measure.key, measure);
    }));
    return [...map.values()];
  }, [statements]);
  const trendRows = statements.slice().sort(statementOrder).map((statement) => {
    const row: Record<string, string | number | null> = { label: periodLabel(statement) };
    measures.forEach((measure) => {
      const actual = statement.profitability.find((candidate) => candidate.key === measure.key);
      row[measure.key] = availableValue(actual) == null ? null : (availableValue(actual)! * 100);
    });
    return row;
  });
  const colors = ["#83aee1", "#55c8bc", "#e3a75b", "#c49bd6", "#d47e7b"];
  return (
    <section className="min-w-0 overflow-hidden border border-border bg-card" aria-label="Profitability margins" data-testid="profitability-section">
      <div className="border-b border-border px-3 py-3 sm:px-4">
        <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-primary">03 · Profitability</div>
        <h2 className="mt-1 text-[13px] font-semibold">Margins, when inputs are present</h2>
        <p className="mt-1 text-[9px] text-muted-foreground">Source-provided profitability measures · unavailable points are left as gaps.</p>
      </div>
      {measures.length && statements.length ? (
        <>
          <div className="h-[210px] px-1 pb-2 pt-3 sm:h-[245px]" data-testid="chart-profitability">
            <ResponsiveContainer width="100%" height="100%" debounce={0}>
              <LineChart data={trendRows} margin={{ top: 5, right: 10, left: 0, bottom: 2 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 5" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 8 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} minTickGap={16} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 8 }} axisLine={false} tickLine={false} tickFormatter={(value: number) => `${value}%`} width={35} />
                <Tooltip
                  isAnimationActive={false}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0]?.payload as Record<string, string | number | null>;
                    return <div className="rounded-[3px] border border-border bg-popover px-2.5 py-2 text-[9px] shadow-lg">
                      <div className="mb-1 font-semibold">{String(row.label)}</div>
                      {measures.map((measure, index) => <div key={measure.key} style={{ color: colors[index % colors.length] }}>{measure.name}: <strong>{row[measure.key] == null ? "Unavailable" : `${Number(row[measure.key]).toFixed(2)}%`}</strong></div>)}
                    </div>;
                  }}
                />
                {measures.length > 1 && <Legend wrapperStyle={{ fontSize: 8, color: "hsl(var(--muted-foreground))" }} />}
                {measures.map((measure, index) => (
                  <Line key={measure.key} type="linear" dataKey={measure.key} name={measure.name} stroke={colors[index % colors.length]} strokeWidth={1.7} dot={{ r: 2, fill: colors[index % colors.length], strokeWidth: 0 }} connectNulls={false} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="divide-y divide-border/80 border-t border-border">
            {measures.map((measure) => {
              const latestMeasure = latest?.profitability.find((item) => item.key === measure.key);
              return <div key={measure.key} className="grid grid-cols-1 gap-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(160px,0.8fr)] sm:items-center" data-testid={`profitability-row-${slug(measure.key)}`}>
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold">{measure.name}</div>
                  <div className="mt-0.5 text-[8px] text-muted-foreground">{measure.formula || "Definition not supplied"}</div>
                </div>
                <div className="font-mono text-[13px] font-semibold" data-testid={`profitability-value-${slug(measure.key)}`}>
                  {availableValue(latestMeasure) == null ? <span className="text-muted-foreground">{unavailableLabel(latestMeasure)}</span> : `${(availableValue(latestMeasure)! * 100).toFixed(2)}%`}
                </div>
                {latestMeasure && <MeasureTrace measure={latestMeasure} statement={latest} testId={`profitability-${slug(measure.key)}`} />}
              </div>;
            })}
          </div>
          <div className="border-t border-border bg-primary/[0.06] px-3 py-2 text-[8px] leading-relaxed text-muted-foreground">
            <span className="mr-2 font-semibold uppercase tracking-[0.1em] text-primary">Basis</span>
            Displayed as supplied by the analytics source. No margin is derived where inputs are missing, ambiguous, or have a zero denominator.
          </div>
        </>
      ) : <div className="px-4 py-10 text-center text-[10px] text-muted-foreground" data-testid="empty-profitability">No profitability measures were returned for this reporting basis.</div>}
    </section>
  );
}

function RevenueMix({ statement }: { statement?: AirlineFinancialAnalyticsStatement }) {
  const measures = statement?.revenueMix ?? [];
  const maxAbs = Math.max(0, ...measures.map((measure) => Math.abs(availableValue(measure) ?? 0)));
  return (
    <section className="min-w-0 border border-border bg-card" aria-label="Reported revenue mix" data-testid="revenue-mix">
      <div className="border-b border-border px-3 py-3 sm:px-4">
        <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-primary">04 · Revenue mix</div>
        <h2 className="mt-1 text-[13px] font-semibold">Reported revenue lines</h2>
        <p className="mt-1 text-[9px] text-muted-foreground">Latest matched statement · no component is assumed to reconcile to total revenue.</p>
      </div>
      {measures.length ? <div className="divide-y divide-border/70 px-3">
        {measures.map((measure, index) => {
          const amount = availableValue(measure);
          const width = amount == null || maxAbs === 0 ? 0 : Math.min(100, Math.abs(amount) / maxAbs * 100);
          const color = ["#55c8bc", "#e3a75b", "#9daab4", "#83aee1"][index % 4];
          return <div key={measure.key} className="py-2.5" data-testid={`mix-line-${slug(measure.key)}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold"><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />{measure.name}</div>
                <div className="mt-1 pl-3 text-[8px] text-muted-foreground">{measure.availability === "available" ? "Reported amount" : unavailableLabel(measure)}</div>
              </div>
              <div className="shrink-0 text-right font-mono text-[10px] font-semibold">{amount == null ? "Unavailable" : `${numeric(amount)} ${statement?.currency || ""}`}</div>
            </div>
            <div className="ml-3 mt-1.5 h-[3px] bg-muted">
              {amount != null && <div className="h-full" style={{ width: `${width}%`, backgroundColor: color }} />}
            </div>
            <div className="mt-1 pl-3"><MeasureTrace measure={measure} statement={statement} testId={`mix-${slug(measure.key)}`} /></div>
          </div>;
        })}
      </div> : <div className="px-4 py-9 text-center text-[10px] text-muted-foreground" data-testid="empty-revenue-mix">No revenue-mix lines were supplied for the latest matched statement.</div>}
      <div className="border-t border-border px-3 py-2 text-[8px] text-muted-foreground">Scale bars compare absolute amounts within the available reported lines; unavailable lines are not treated as zero.</div>
    </section>
  );
}

function BalanceSheet({ statement }: { statement?: AirlineFinancialAnalyticsStatement }) {
  const required = [
    { matcher: /total.?assets/i, fallback: "Total assets" },
    { matcher: /total.?liabilit/i, fallback: "Total liabilities" },
    { matcher: /total.?equity|shareholders.?equity/i, fallback: "Total equity" },
    { matcher: /cash|liquid.?invest/i, fallback: "Cash & liquid investments" },
    { matcher: /current.?assets/i, fallback: "Current assets" },
    { matcher: /current.?liabilit/i, fallback: "Current liabilities" },
  ];
  const measures = statement?.balanceSheet ?? [];
  const selected = required.map(({ matcher, fallback }) => measures.find((measure) => matcher.test(`${measure.key} ${measure.name}`)) ?? {
    key: `unavailable-${slug(fallback)}`,
    name: fallback,
    formula: "",
    value: null,
    availability: "missing-input" as const,
    inputs: [],
  });
  return (
    <section className="overflow-hidden border border-border bg-card" aria-label="Balance-sheet context" data-testid="balance-sheet-context">
      <div className="flex flex-wrap items-start gap-2 border-b border-border px-3 py-3 sm:px-4">
        <div className="mr-auto">
          <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-primary">05 · Balance-sheet context</div>
          <h2 className="mt-1 text-[13px] font-semibold">Reported closing position</h2>
        </div>
        <div className="flex items-center gap-1.5 text-[8px] text-muted-foreground"><CalendarDays className="h-3 w-3" />{statement?.sourceDate || "Source date not supplied"} · {statement ? periodLabel(statement) : "No matched statement"}</div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {selected.map((measure, index) => (
          <div key={measure.key} className={`min-w-0 border-b border-border p-2.5 sm:p-3 ${index % 3 !== 0 ? "lg:border-l" : ""} ${index >= 3 ? "lg:border-b-0" : ""}`} data-testid={`balance-line-${slug(measure.name)}`}>
            <ValueTile title={measure.name} measure={measure} statement={statement} testId={`balance-${slug(measure.key)}`} compact />
          </div>
        ))}
      </div>
      <div className="border-t border-border px-3 py-2 text-[8px] leading-relaxed text-muted-foreground">Closing balances are shown as reported. Context only; this is not a liquidity, solvency, or credit assessment.</div>
    </section>
  );
}

export function AirlineFinancialAnalytics({ options, airline: initialAirline }: Props) {
  const choices = options?.statements ?? [];
  const airlineChoices = useMemo(() => [...new Set(choices.map((choice) => choice.airline))].sort(), [choices]);
  const initialSelection = airlineChoices.includes(initialAirline) ? initialAirline : airlineChoices[0] ?? "";
  const [airline, setAirline] = useState(initialSelection);
  useEffect(() => {
    if (airlineChoices.length && !airlineChoices.includes(airline)) setAirline(airlineChoices.includes(initialAirline) ? initialAirline : airlineChoices[0]);
  }, [airlineChoices, airline, initialAirline]);
  const airlineChoicesForView = choices.filter((choice) => choice.airline === airline);
  const bases = useMemo(() => {
    const distinct = new Map<string, Basis>();
    airlineChoicesForView.forEach((choice) => distinct.set(basisId(basisOf(choice)), basisOf(choice)));
    return [...distinct.values()];
  }, [airlineChoicesForView]);
  const [selectedBasisId, setSelectedBasisId] = useState("");
  const selectedBasisKey = bases.some((basis) => basisId(basis) === selectedBasisId) ? selectedBasisId : bases[0] ? basisId(bases[0]) : "";
  const basis = bases.find((candidate) => basisId(candidate) === selectedBasisKey);
  const basisChoices = airlineChoicesForView.filter((choice) => basis && sameBasis(basisOf(choice), basis));
  const periods = [...new Set(basisChoices.map((choice) => choice.period))].sort((a, b) => periodRank.indexOf(a) - periodRank.indexOf(b) || a.localeCompare(b, undefined, { numeric: true }));
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const period = periods.includes(selectedPeriod) ? selectedPeriod : periods[0] ?? "";

  const params = useMemo<GetAirlineFinancialAnalyticsParams>(() => ({
    airline,
    scope: basis?.scope ?? "",
    fiscalYearEnd: basis?.fiscalYearEnd ?? "",
    currency: basis?.currency ?? "",
    status: basis?.status ?? "",
    ifrs: basis?.ifrs ?? "",
    inAdministration: basis?.inAdministration ?? "",
    period,
  }), [airline, basis, period]);
  const query = useGetAirlineFinancialAnalytics(params, {
    query: { enabled: Boolean(options && airline && basis && period), queryKey: getGetAirlineFinancialAnalyticsQueryKey(params) },
  });
  const data = query.data;
  const statements = useMemo(() => (data?.statements ?? []).slice().sort(statementOrder), [data?.statements]);
  const latest = statements.at(-1);
  const sourceCount = statements.length;

  return (
    <div className="space-y-3 text-foreground" data-testid="airline-financial-analytics">
      <header className="flex flex-wrap items-start gap-3 px-1 pb-1">
        <div className="mr-auto min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center border border-primary/50 bg-primary/10"><LineChartIcon className="h-3.5 w-3.5 text-primary" /></span>
            <h1 className="text-[18px] font-semibold leading-tight tracking-tight sm:text-[21px]">Airline Financial <span className="text-primary">Analytics</span></h1>
          </div>
          <p className="mt-1.5 max-w-2xl text-[10px] leading-relaxed text-muted-foreground">A reported-line view of performance, profitability and balance-sheet context. Every figure stays on one selected reporting basis.</p>
        </div>
        <div className="flex items-center gap-2 border-l-2 border-primary bg-primary/[0.08] px-2.5 py-2">
          <Layers3 className="h-4 w-4 text-primary" />
          <div><div className="text-[8px] font-semibold uppercase tracking-[0.13em] text-primary">Matched reporting basis</div><div className="mt-0.5 text-[9px] text-muted-foreground">Original currency · source scale retained</div></div>
        </div>
      </header>

      <section className="border border-border bg-card p-3 sm:p-4" aria-label="Reporting basis selection" data-testid="analytics-basis-controls">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center border border-primary/50 bg-primary/10 font-mono text-[9px] font-semibold text-primary">01</span>
          <h2 className="text-[11px] font-semibold">Analysis basis</h2>
          <span className="ml-auto text-[8px] uppercase tracking-[0.11em] text-muted-foreground">{choices.length.toLocaleString("en-US")} supplied statement choices</span>
        </div>
        {!options ? (
          <div className="grid gap-2 sm:grid-cols-3">{[0, 1, 2].map((index) => <Skeleton key={index} className="h-[54px]" />)}</div>
        ) : choices.length === 0 ? (
          <div className="border border-dashed border-border px-4 py-6 text-center text-[10px] text-muted-foreground" data-testid="empty-analytics-options">No reported financial statement choices are available.</div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[0.8fr_1.8fr_0.8fr]">
              <SelectControl label="Airline" value={airline} testId="select-analytics-airline" onChange={(value) => { setAirline(value); setSelectedBasisId(""); setSelectedPeriod(""); }} options={airlineChoices.map((value) => ({ value, label: value }))} />
              <SelectControl label="Exact reporting basis" value={selectedBasisKey} testId="select-analytics-basis" onChange={(value) => { setSelectedBasisId(value); setSelectedPeriod(""); }} disabled={!bases.length} options={bases.map((item) => ({
                value: basisId(item),
                label: `${item.scope} · ${item.currency || "Currency not stated"} · FY end ${item.fiscalYearEnd} · ${item.status} · IFRS ${item.ifrs || "not stated"} · Administration ${item.inAdministration || "not stated"}`,
              }))} />
              <SelectControl label="Comparable period" value={period} testId="select-analytics-period" onChange={setSelectedPeriod} disabled={!periods.length} options={periods.map((value) => ({ value, label: periodName[value] ?? value }))} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border pt-2.5 text-[8px] text-muted-foreground">
              <span className="flex items-center gap-1.5 font-medium text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary" />One exact source basis</span>
              <span data-testid="selected-analytics-basis">{basis ? `${airline} · ${basis.scope} · ${basis.currency || "Currency not stated"} · FY end ${basis.fiscalYearEnd}` : "Choose an actual reported basis"}</span>
              <span className="ml-auto" data-testid="selected-analytics-period">Comparable period: {period || "Unavailable"}</span>
            </div>
          </>
        )}
      </section>

      {query.isError ? (
        <div className="flex flex-col items-center gap-2 border border-destructive/40 bg-card px-4 py-10 text-center" data-testid="error-financial-analytics">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <div className="text-[12px] font-semibold">Financial analytics could not be loaded</div>
          <p className="max-w-md text-[10px] text-muted-foreground">The selected reporting basis has not changed. Retry the query or choose another available basis.</p>
          <button type="button" data-testid="button-retry-analytics" onClick={() => query.refetch()} className="mt-1 rounded-[3px] bg-primary px-3 py-1.5 text-[10px] font-semibold text-primary-foreground hover:opacity-90">Retry source query</button>
        </div>
      ) : query.isLoading || (query.isFetching && !data) ? (
        <div className="space-y-3" aria-label="Loading financial analytics" data-testid="loading-financial-analytics">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{[0, 1, 2].map((index) => <Skeleton key={index} className="h-[112px]" />)}</div>
          <Skeleton className="h-[300px]" />
          <div className="grid gap-3 lg:grid-cols-2"><Skeleton className="h-[280px]" /><Skeleton className="h-[280px]" /></div>
        </div>
      ) : !basis || !period ? (
        <div className="flex flex-col items-center gap-2 border border-border bg-card px-4 py-12 text-center" data-testid="empty-selected-basis">
          <Scale className="h-5 w-5 text-primary" />
          <div className="text-[12px] font-semibold">A complete reported basis is required</div>
          <p className="max-w-md text-[10px] text-muted-foreground">Select an airline, exact statement basis and comparable period to view source-backed financial measures.</p>
        </div>
      ) : !statements.length ? (
        <div className="flex flex-col items-center gap-2 border border-border bg-card px-4 py-12 text-center" data-testid="empty-financial-analytics">
          <CalendarDays className="h-5 w-5 text-primary" />
          <div className="text-[12px] font-semibold">No statements match this selection</div>
          <p className="max-w-md text-[10px] text-muted-foreground">No values are inferred for this exact airline, reporting basis and period. Try another period or basis from the source choices.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border border-border bg-primary/[0.06] px-3 py-2 text-[9px]" data-testid="current-sample">
            <span className="font-semibold uppercase tracking-[0.12em] text-primary">Current sample</span>
            <strong>{airline}</strong>
            <span className="min-w-0 flex-1 text-muted-foreground">{basis?.scope} · {basis?.currency || "Currency not stated"} · {basis?.status}</span>
            <span className="font-mono text-muted-foreground">{sourceCount} {sourceCount === 1 ? "period" : "periods"} · Latest: {latest ? periodLabel(latest) : "Unavailable"}</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <ValueTile title="Reported revenue" measure={latest?.reportedRevenue} statement={latest} testId="reported-revenue" />
            <ValueTile title="Operating result" measure={latest?.operatingResult} statement={latest} testId="operating-result" />
            <ValueTile title="Profit / (loss) after tax" measure={latest?.afterTax} statement={latest} testId="after-tax" />
          </div>
          <FinancialTrend statements={statements} currency={latest?.currency ?? basis?.currency ?? ""} />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.9fr)]">
            <Profitability statements={statements} />
            <RevenueMix statement={latest} />
          </div>
          <BalanceSheet statement={latest} />
        </>
      )}
    </div>
  );
}
