import { useEffect, useMemo, useState } from "react";
import {
  getGetAirlineFinancialRatiosQueryKey,
  useGetAirlineFinancialRatios,
} from "@workspace/api-client-react";
import type {
  AirlineFinancialOptions,
  AirlineFinancialRatio,
  AirlineFinancialRatioStatement,
  AirlineStatementChoice,
  GetAirlineFinancialRatiosParams,
} from "@workspace/api-client-react";
import { AlertTriangle, BarChart3, ChevronDown, ChevronRight, Info, Layers3 } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

type Props = { options: AirlineFinancialOptions | undefined; airline: string };
type Basis = Pick<AirlineStatementChoice, "scope" | "fiscalYearEnd" | "currency" | "status" | "ifrs" | "inAdministration">;
type ComparisonMode = "none" | "airline";

const basisKeys: (keyof Basis)[] = ["scope", "fiscalYearEnd", "currency", "status", "ifrs", "inAdministration"];
const sameBasis = (a: Basis, b: Basis) => basisKeys.every((key) => a[key] === b[key]);
const basisOf = (choice: AirlineStatementChoice): Basis => ({
  scope: choice.scope,
  fiscalYearEnd: choice.fiscalYearEnd,
  currency: choice.currency,
  status: choice.status,
  ifrs: choice.ifrs,
  inAdministration: choice.inAdministration,
});
const basisId = (b: Basis) => basisKeys.map((key) => b[key]).join("¦");
const periodLabel = (statement: AirlineFinancialRatioStatement) => `${statement.financialYear} · ${statement.period}`;
const periodOrder = ["Yr", "H1", "6M", "Q1", "Q2", "9M", "10M", "15M", "H2", "Q3", "Q4"];
const statementOrder = (a: AirlineFinancialRatioStatement, b: AirlineFinancialRatioStatement) =>
  a.financialYear.localeCompare(b.financialYear, undefined, { numeric: true }) ||
  periodOrder.indexOf(a.period) - periodOrder.indexOf(b.period);
const displayValue = (ratio: AirlineFinancialRatio | undefined) => {
  if (!ratio || ratio.availability !== "available" || ratio.value == null || !Number.isFinite(ratio.value)) return "Unavailable";
  const value = ratio.displayAs === "percent" ? ratio.value * 100 : ratio.value;
  return `${value.toFixed(1)}${ratio.displayAs === "percent" ? "%" : "×"}`;
};
const unavailableReason = (ratio: AirlineFinancialRatio) => {
  if (ratio.availability === "missing-input") return "Missing source input";
  if (ratio.availability === "zero-denominator") return "Zero denominator";
  if (ratio.availability === "missing-comparator") return "Missing comparator";
  return "Unavailable";
};
const sourceNumber = (amount: number | null) =>
  amount == null || !Number.isFinite(amount) ? "Unavailable" : amount.toLocaleString("en-US", { maximumFractionDigits: 3 });
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function NativeSelect({ label, value, options, onChange, testId, disabled = false }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  testId: string;
  disabled?: boolean;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
      <select
        data-testid={testId}
        aria-label={label}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full min-w-0 rounded-[3px] border border-input bg-background px-2 text-[11px] text-foreground outline-none transition-colors focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function BasisCaption({ basis, airline }: { basis?: Basis; airline: string }) {
  if (!basis) return <span>Choose an actual reported basis</span>;
  return <>{airline} · {basis.scope} · {basis.currency || "Currency not stated"} · FY end {basis.fiscalYearEnd}</>;
}

function Trace({ ratio, testId }: { ratio: AirlineFinancialRatio; testId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-w-[170px]">
      <button
        type="button"
        data-testid={`button-trace-${testId}`}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Trace calculation
      </button>
      {open && (
        <div className="mt-2 rounded-[3px] border border-border bg-background/70 p-2 text-[10px]" data-testid={`trace-${testId}`}>
          <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Formula</div>
          <p className="mb-2 text-foreground">{ratio.formula || "Formula not supplied"}</p>
          <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Exact source inputs</div>
          {ratio.inputs.length ? (
            <div className="space-y-1">
              {ratio.inputs.map((input, index) => (
                <div key={`${input.metric}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-t border-border/60 pt-1">
                  <span className="break-words">{input.metric}</span>
                  <span className="tnum text-right">{sourceNumber(input.amount)}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-muted-foreground">No source inputs supplied.</p>}
        </div>
      )}
    </div>
  );
}

function RatioDefinitions({ statements }: { statements: AirlineFinancialRatioStatement[] }) {
  const latest = statements.slice().sort(statementOrder).at(-1);
  const categories = useMemo(() => {
    const grouped = new Map<string, AirlineFinancialRatio[]>();
    (latest?.ratios ?? []).forEach((ratio) => {
      const current = grouped.get(ratio.category);
      if (current) current.push(ratio);
      else grouped.set(ratio.category, [ratio]);
    });
    return [...grouped.entries()];
  }, [latest]);
  if (!latest || !categories.length) {
    return <div className="px-4 py-10 text-center text-[11px] text-muted-foreground" data-testid="empty-ratio-definitions">No ratio definitions are available for this reporting basis.</div>;
  }
  return (
    <section className="overflow-hidden rounded-[3px] border border-border bg-card" data-testid="ratio-definitions">
      <div className="border-b border-border px-3 py-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[12px] font-semibold">Ratios &amp; KPIs · {periodLabel(latest)}</h2>
          <span className="text-[9px] text-muted-foreground">Currency: {latest.currency || "not stated"} · FY end {latest.fiscalYearEnd}</span>
        </div>
        <p className="mt-0.5 text-[10px] text-muted-foreground">Each result uses exact metric inputs from the selected reporting basis.</p>
      </div>
      {categories.map(([category, ratios]) => (
        <div key={category} data-testid={`ratio-category-${slug(category)}`}>
          <div className="grid grid-cols-[84px_minmax(0,1fr)] border-b border-border/80 bg-primary/[0.07]">
            <div className="px-2 py-2 text-[10px] font-semibold text-primary">{category}</div>
            <div className="px-2 py-2 text-[9px] text-muted-foreground">{ratios.length} {ratios.length === 1 ? "measure" : "measures"}</div>
          </div>
          {ratios.map((ratio) => {
            const thresholdRatios = new Set(["currentRatio", "quickRatio", "interestCoverage"]);
            const status = ratio.availability === "available" && ratio.value != null
              ? ratio.value < 0 ? "Below zero" : thresholdRatios.has(ratio.key) && ratio.value < 1 ? "Below 1.0" :
                ratio.key === "netDebtEbitda" && latest.period !== "Yr" ? "Interim · not annualised" : "Reference"
              : unavailableReason(ratio);
            return (
              <div key={ratio.key} className="grid grid-cols-1 gap-2 border-b border-border/70 px-3 py-2.5 sm:grid-cols-[minmax(0,1.1fr)_110px_minmax(170px,0.8fr)] sm:items-start">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold">{ratio.name}</div>
                  <div className="mt-0.5 text-[9px] leading-relaxed text-muted-foreground">{ratio.formula || "Formula not supplied"}</div>
                </div>
                <div className="sm:pt-0.5">
                  <div className="tnum text-[15px] font-semibold leading-none" data-testid={`ratio-value-${slug(ratio.key)}`}>{displayValue(ratio)}</div>
                  <span className={`mt-1 inline-block rounded-[2px] px-1 py-0.5 text-[8px] ${status === "Below 1.0" || status === "Below zero" ? "bg-destructive/15 text-destructive" : status === "Reference" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`} data-testid={`ratio-status-${slug(ratio.key)}`}>{status}</span>
                </div>
                <Trace ratio={ratio} testId={slug(ratio.key)} />
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}

function RatioTrend({ statements, comparisonAirline }: {
  statements: AirlineFinancialRatioStatement[];
  comparisonAirline: AirlineFinancialRatioStatement[];
}) {
  const allRatios = statements.flatMap((statement) => statement.ratios);
  const availableRatioKeys = [...new Map(allRatios.map((ratio) => [ratio.key, ratio])).values()];
  const [selectedKey, setSelectedKey] = useState("");
  const activeKey = availableRatioKeys.some((ratio) => ratio.key === selectedKey) ? selectedKey : availableRatioKeys[0]?.key ?? "";
  const selectedRatio = availableRatioKeys.find((ratio) => ratio.key === activeKey);
  const sorted = statements.slice().sort(statementOrder);
  const rows = sorted.map((statement) => {
    const ratio = statement.ratios.find((item) => item.key === activeKey);
    const airline = comparisonAirline.find((item) => item.financialYear === statement.financialYear && item.period === statement.period)?.ratios.find((item) => item.key === activeKey);
    return {
      label: `${statement.financialYear} · ${statement.period}`,
      value: ratio?.availability === "available" ? ratio.value : null,
      airline: airline?.availability === "available" ? airline.value : null,
      statement,
    };
  });
  const displayAs = selectedRatio?.displayAs;
  const formatAxis = (value: number) => `${Number(displayAs === "percent" ? value * 100 : value).toFixed(0)}${displayAs === "percent" ? "%" : "×"}`;
  return (
    <section className="min-w-0 rounded-[3px] border border-border bg-card" aria-label="Historical ratio trend">
      <div className="flex flex-wrap items-center gap-2 px-3 pb-1 pt-2">
        <div className="mr-auto">
          <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-primary">Historical trend</div>
          <h2 className="mt-0.5 text-[12px] font-semibold">{selectedRatio?.name ?? "Ratio trend"}</h2>
          {selectedRatio && <div className="text-[9px] text-muted-foreground">{selectedRatio.category} · {displayAs === "percent" ? "Percent" : "Multiple"}</div>}
        </div>
        <label className="flex min-w-[170px] items-center gap-2 text-[9px] text-muted-foreground">
          <span className="sr-only">Select ratio to trend</span>
          <select data-testid="select-trend-ratio" value={activeKey} onChange={(event) => setSelectedKey(event.target.value)} className="h-7 w-full rounded-[3px] border border-input bg-background px-2 text-[10px] text-foreground">
            {availableRatioKeys.map((ratio) => <option key={ratio.key} value={ratio.key}>{ratio.name}</option>)}
          </select>
        </label>
      </div>
      {!rows.length || !activeKey ? (
        <div className="flex h-[220px] items-center justify-center px-5 text-center text-[11px] text-muted-foreground" data-testid="empty-ratio-trend">No historical ratio values are available for this basis.</div>
      ) : (
        <>
          <div className="h-[230px] px-2 pb-1 pt-3 sm:h-[260px]" data-testid="chart-ratio-trend">
            <ResponsiveContainer width="100%" height="100%" debounce={0}>
              <LineChart data={rows} margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} minTickGap={18} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={formatAxis} width={42} />
                <Tooltip
                  isAnimationActive={false}
                  cursor={{ stroke: "hsl(var(--muted-foreground))", strokeDasharray: "3 3" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const point = payload[0]?.payload as (typeof rows)[number] | undefined;
                    if (!point) return null;
                    return <div className="rounded-[3px] border border-border bg-popover px-2.5 py-2 text-[10px] shadow-lg">
                      <div className="mb-1 font-semibold">{point.label}</div>
                      <div>Primary: <strong>{point.value == null ? "Unavailable" : `${(displayAs === "percent" ? point.value * 100 : point.value).toFixed(1)}${displayAs === "percent" ? "%" : "×"}`}</strong></div>
                      {comparisonAirline.length > 0 && <div>Airline comparison: {point.airline == null ? "Unavailable" : `${(displayAs === "percent" ? point.airline * 100 : point.airline).toFixed(1)}${displayAs === "percent" ? "%" : "×"}`}</div>}
                      <div className="mt-1 border-t border-border pt-1 text-muted-foreground">{point.statement.scope} · {point.statement.currency} · {point.statement.status}</div>
                    </div>;
                  }}
                />
                {comparisonAirline.length > 0 && (
                  <Legend wrapperStyle={{ fontSize: 9, color: "hsl(var(--muted-foreground))" }} />
                )}
                {displayAs === "multiple" && <ReferenceLine y={1} stroke="hsl(var(--chart-4))" strokeDasharray="4 4" />}
                <Line type="linear" dataKey="value" name="Selected basis" stroke="#35c1b4" strokeWidth={2} dot={{ r: 2.5, fill: "#35c1b4", strokeWidth: 0 }} connectNulls={false} isAnimationActive={false} />
                {comparisonAirline.length > 0 && <Line type="linear" dataKey="airline" name="Airline comparison" stroke="#9b8bd8" strokeWidth={1.5} dot={{ r: 2, fill: "#9b8bd8", strokeWidth: 0 }} connectNulls={false} isAnimationActive={false} />}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-3 py-1.5 text-[9px] text-muted-foreground">
            <span>Gaps indicate unavailable inputs.</span>
            <span>Periods may differ in length; compare like-for-like selections.</span>
            <span className="ml-auto">Formula: {selectedRatio?.formula}</span>
          </div>
        </>
      )}
    </section>
  );
}

function HealthSignals({ statements }: { statements: AirlineFinancialRatioStatement[] }) {
  const latest = statements.slice().sort(statementOrder).at(-1);
  if (!latest) return <div className="p-4 text-[10px] text-muted-foreground">No matching historical statements.</div>;
  const signals = [
    { key: "current-ratio", name: "Current ratio below 1.0", detail: "Reported current assets are lower than reported current liabilities.", ratio: latest.ratios.find((ratio) => ratio.key.toLowerCase().includes("current") && ratio.key.toLowerCase().includes("ratio")) },
    { key: "interest-coverage", name: "Interest coverage below 1.0", detail: "Reported EBIT is below the absolute value of disclosed net interest expense.", ratio: latest.ratios.find((ratio) => ratio.key.toLowerCase().includes("interest") && ratio.key.toLowerCase().includes("coverage")) },
  ];
  return (
    <section className="rounded-[3px] border border-border bg-card p-3" aria-label="Financial health signals" data-testid="financial-health">
      <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-primary">Financial health</div>
      <h2 className="mt-0.5 text-[12px] font-semibold">Latest-period signals</h2>
      <div className="mt-2 text-[9px] font-semibold">{latest.airline}<span className="float-right font-normal text-muted-foreground">{periodLabel(latest)}</span></div>
      {signals.map(({ key, name, detail, ratio }) => {
        const triggered = ratio?.availability === "available" && ratio.value != null && ratio.value < 1;
        const missing = !ratio || ratio.availability !== "available" || ratio.value == null;
        return (
          <div key={key} className="flex gap-2 border-t border-border/80 py-2" data-testid={`signal-${key}`}>
            <AlertTriangle className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${triggered ? "text-[hsl(var(--chart-4))]" : "text-muted-foreground"}`} />
            <div className="min-w-0">
              <div className="text-[9px] font-semibold">{missing ? `${name} · unavailable` : triggered ? name : `${name} · not triggered`}</div>
              <p className="mt-0.5 text-[8px] leading-relaxed text-muted-foreground">{missing ? `Required ratio is ${ratio ? unavailableReason(ratio).toLowerCase() : "not reported"}. ${detail}` : detail}</p>
            </div>
          </div>
        );
      })}
      <div className="mt-1 grid grid-cols-2 gap-2 border-t border-border pt-2 text-[8px]">
        <div><div className="uppercase tracking-wide text-muted-foreground">Reported status</div><strong>{latest.status || "Unavailable"}</strong></div>
        <div><div className="uppercase tracking-wide text-muted-foreground">IFRS / GAAP</div><strong>{latest.ifrs || "Unavailable"}</strong></div>
        <div><div className="uppercase tracking-wide text-muted-foreground">Administration</div><strong>{latest.inAdministration || "Unavailable"}</strong></div>
        <div><div className="uppercase tracking-wide text-muted-foreground">Scope</div><strong>{latest.scope || "Unavailable"}</strong></div>
      </div>
      <p className="mt-2 border-t border-border pt-2 text-[8px] leading-relaxed text-muted-foreground">Rule-based signals are observations on reported values, not credit ratings or investment recommendations.</p>
    </section>
  );
}

function HistoryMatch({ statements, comparisonAirline }: {
  statements: AirlineFinancialRatioStatement[];
  comparisonAirline: AirlineFinancialRatioStatement[];
}) {
  return (
    <section className="rounded-[3px] border border-border bg-card px-3 py-2" data-testid="historical-match">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px]">
        <span className="font-semibold uppercase tracking-[0.1em] text-primary">Selected history</span>
        <span className="font-semibold">{statements[0]?.airline ?? "No match"}</span>
        <span className="text-muted-foreground">{statements.length} matching {statements.length === 1 ? "statement" : "statements"}</span>
        {comparisonAirline.length > 0 && <span className="text-muted-foreground">Airline comparison: {comparisonAirline.length} matched periods</span>}
        <span className="ml-auto text-muted-foreground">{statements.length ? `Latest: ${periodLabel(statements.slice().sort(statementOrder).at(-1)!)}` : "No historical statement matches this selection"}</span>
      </div>
      {statements.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1.5" aria-label="Matched statement periods">
          {statements.map((statement) => (
            <span key={statement.statementId} data-testid={`history-period-${statement.statementId}`} className="rounded-[2px] border border-border bg-background/60 px-1.5 py-0.5 text-[8px] text-muted-foreground">
              {periodLabel(statement)} · {statement.currency} · {statement.status}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

export function AirlineFinancialRatios({ options, airline: initialAirline }: Props) {
  const statements = options?.statements ?? [];
  const initialAirlineName = statements.some((choice) => choice.airline === initialAirline) ? initialAirline : statements[0]?.airline ?? "";
  const [airline, setAirline] = useState(initialAirlineName);
  const airlineChoices = useMemo(() => [...new Set(statements.map((choice) => choice.airline))].sort(), [statements]);
  useEffect(() => {
    if (!airlineChoices.length || airlineChoices.includes(airline)) return;
    setAirline(airlineChoices.includes(initialAirline) ? initialAirline : airlineChoices[0]);
  }, [airlineChoices, airline, initialAirline]);
  const airlinePool = statements.filter((choice) => choice.airline === airline);
  const bases = useMemo(() => {
    const distinct = new Map<string, Basis>();
    airlinePool.forEach((choice) => distinct.set(basisId(basisOf(choice)), basisOf(choice)));
    return [...distinct.values()];
  }, [airlinePool]);
  const [selectedBasisId, setSelectedBasisId] = useState("");
  const currentBasisId = bases.some((basis) => basisId(basis) === selectedBasisId)
    ? selectedBasisId
    : bases.length ? basisId(bases[0]) : "";
  const basis = bases.find((item) => basisId(item) === currentBasisId);
  const basisStatements = airlinePool.filter((choice) => basis && sameBasis(basisOf(choice), basis));
  const periodOptions = [...new Set(basisStatements.map((choice) => choice.period))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const [period, setPeriod] = useState("");
  const activePeriod = periodOptions.includes(period) ? period : "";
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>("none");
  const availableComparisonAirlines = useMemo(() => {
    if (!basis) return [];
    return [...new Set(statements.filter((choice) => choice.airline !== airline && sameBasis(basisOf(choice), basis)).map((choice) => choice.airline))].sort();
  }, [statements, airline, basis]);
  const [compareAirline, setCompareAirline] = useState("");
  const activeCompareAirline = comparisonMode === "airline" && availableComparisonAirlines.includes(compareAirline)
    ? compareAirline
    : "";
  const params = useMemo<GetAirlineFinancialRatiosParams>(() => {
    const value: GetAirlineFinancialRatiosParams = {
      airline,
      scope: basis?.scope ?? "",
      fiscalYearEnd: basis?.fiscalYearEnd ?? "",
      currency: basis?.currency ?? "",
      status: basis?.status ?? "",
      ifrs: basis?.ifrs ?? "",
      inAdministration: basis?.inAdministration ?? "",
    };
    if (activePeriod) value.period = activePeriod;
    if (activeCompareAirline) value.compareAirline = activeCompareAirline;
    return value;
  }, [airline, basis, activePeriod, activeCompareAirline]);
  const query = useGetAirlineFinancialRatios(params, {
    query: { enabled: Boolean(options && basis), queryKey: getGetAirlineFinancialRatiosQueryKey(params) },
  });
  const data = query.data;
  const primary = data?.primary ?? [];
  const otherAirline = activeCompareAirline ? data?.comparisonAirline ?? [] : [];
  const loading = query.isLoading || query.isFetching;

  return (
    <div className="space-y-2 text-foreground" data-testid="airline-financial-ratios">
      <header className="flex flex-wrap items-start gap-2 px-1 pb-1">
        <div className="mr-auto">
          <h1 className="text-[18px] font-semibold leading-tight tracking-tight sm:text-[21px]">Financial ratios <span className="text-primary">&amp;</span> KPIs</h1>
          <p className="mt-1 text-[10px] text-muted-foreground">Derived measures, tied back to the reported lines and reporting basis that produced them.</p>
        </div>
        <div className="flex items-center gap-2 rounded-[3px] border-l-2 border-primary bg-primary/[0.08] px-2.5 py-1.5 text-[9px]">
          <Layers3 className="h-4 w-4 text-primary" />
          <div><div className="font-semibold uppercase tracking-[0.1em] text-primary">Source-first analysis</div><div className="text-muted-foreground">Matched basis · traceable inputs</div></div>
        </div>
      </header>

      <section className="rounded-[3px] border border-border bg-card p-3" aria-label="Reporting basis controls">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-4 w-4 items-center justify-center rounded-[2px] bg-primary text-[9px] font-bold text-primary-foreground">01</span>
          <h2 className="text-[10px] font-semibold">Define the reporting basis</h2>
          <span className="ml-auto text-[8px] uppercase tracking-[0.1em] text-muted-foreground">{statements.length.toLocaleString("en-US")} actual statements in source choices</span>
        </div>
        {!options ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{[0, 1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-12" />)}</div>
        ) : (
          <>
            <div className={`grid grid-cols-1 gap-2 sm:grid-cols-2 ${comparisonMode === "none" ? "lg:grid-cols-4" : "lg:grid-cols-5"}`}>
              <NativeSelect label="Airline" testId="select-ratio-airline" value={airline} onChange={(next) => { setAirline(next); setSelectedBasisId(""); setComparisonMode("none"); setCompareAirline(""); setPeriod(""); }} options={airlineChoices.map((value) => ({ value, label: value }))} />
              <NativeSelect label="Reporting basis" testId="select-ratio-basis" value={currentBasisId} onChange={(value) => { setSelectedBasisId(value); setComparisonMode("none"); setCompareAirline(""); setPeriod(""); }} options={bases.map((item) => ({ value: basisId(item), label: `${item.scope} · ${item.currency || "Currency not stated"} · FY end ${item.fiscalYearEnd} · ${item.status} · IFRS ${item.ifrs || "not stated"} · Administration ${item.inAdministration || "not stated"}` }))} disabled={!bases.length} />
              <NativeSelect label="Reporting period" testId="select-ratio-period" value={activePeriod} onChange={setPeriod} options={[{ value: "", label: "All available periods" }, ...periodOptions.map((value) => ({ value, label: value }))]} disabled={!basis} />
              <NativeSelect
                label="Comparison type · optional"
                testId="select-ratio-comparison-mode"
                value={comparisonMode}
                onChange={(value) => {
                  const mode = value as ComparisonMode;
                  setComparisonMode(mode);
                  if (mode !== "airline") setCompareAirline("");
                }}
                options={[
                  { value: "none", label: "No comparison" },
                  { value: "airline", label: "Another airline" },
                ]}
              />
              {comparisonMode === "airline" && (
                <NativeSelect
                  label="Airline to compare"
                  testId="select-ratio-compare-airline"
                  value={activeCompareAirline}
                  onChange={setCompareAirline}
                  options={[
                    { value: "", label: "Select an airline" },
                    ...availableComparisonAirlines.map((value) => ({ value, label: value })),
                  ]}
                  disabled={!availableComparisonAirlines.length}
                />
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2 text-[8px] text-muted-foreground">
              <span className="flex items-center gap-1 text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary" />Basis locked to actual source statement</span>
              <span data-testid="text-selected-basis"><BasisCaption basis={basis} airline={airline} /></span>
              <span className="ml-auto" data-testid="text-period-selection">Period selection: {activePeriod || "All available periods"}</span>
            </div>
          </>
        )}
      </section>

      {query.isError ? (
        <div className="flex flex-col items-center gap-2 rounded-[3px] border border-destructive/40 bg-card px-4 py-10 text-center" data-testid="error-ratios">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <div className="text-[12px] font-semibold">Financial ratios could not be loaded</div>
          <p className="max-w-md text-[10px] text-muted-foreground">The selected statement basis is unchanged. Retry the source query or choose another actual reporting basis.</p>
          <button data-testid="button-retry-ratios" onClick={() => query.refetch()} className="rounded-[3px] bg-primary px-3 py-1.5 text-[10px] font-semibold text-primary-foreground hover:opacity-90">Retry</button>
        </div>
      ) : loading ? (
        <div className="space-y-2" data-testid="loading-ratios">
          <Skeleton className="h-12" />
          <div className="grid gap-2 lg:grid-cols-[minmax(0,1.8fr)_minmax(250px,0.9fr)]"><Skeleton className="h-[300px]" /><Skeleton className="h-[300px]" /></div>
          <Skeleton className="h-[260px]" />
        </div>
      ) : (
        <>
          <HistoryMatch statements={primary} comparisonAirline={otherAirline} />
          {!primary.length ? (
            <div className="rounded-[3px] border border-border bg-card px-5 py-12 text-center" data-testid="empty-ratio-history">
              <BarChart3 className="mx-auto h-6 w-6 text-muted-foreground" />
              <h2 className="mt-2 text-[12px] font-semibold">No matching historical statements</h2>
              <p className="mx-auto mt-1 max-w-lg text-[10px] text-muted-foreground">No source statements match this exact airline, scope, currency, fiscal year-end, status, accounting basis and administration state. No values have been combined or substituted.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1.85fr)_minmax(250px,0.95fr)]">
                <RatioTrend statements={primary} comparisonAirline={otherAirline} />
                <HealthSignals statements={primary} />
              </div>
              <RatioDefinitions statements={primary} />
            </>
          )}
          <aside className="flex gap-2 rounded-[3px] border border-border/70 bg-background/40 px-3 py-2 text-[9px] leading-relaxed text-muted-foreground" data-testid="text-ratio-caveats">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <p><strong className="text-foreground">Source &amp; scope.</strong> {data?.source ?? options?.source}{data?.sheet ? ` · ${data.sheet}` : options?.sheet ? ` · ${options.sheet}` : ""}{data?.sourceDate ? ` · dated ${data.sourceDate}` : ""}. Results remain tied to each reported statement; currencies, fiscal year-ends, scopes, accounting bases, statuses and periods are not blended. “All periods” shows reported annual, half-year and quarterly statements side by side; periods can overlap and must not be added together. Input scale is the source scale; no unit multiplier is declared. Missing inputs and zero denominators are unavailable, never zero. Rule-based signals are not credit ratings or investment recommendations.</p>
          </aside>
        </>
      )}
    </div>
  );
}

export default AirlineFinancialRatios;
