import type {
  AirlineFinancialAnalyticsInput,
  AirlineFinancialAnalyticsMeasure,
  AirlineFinancialAnalyticsStatement,
  AirlineFinancialRecord,
  AirlineStatementChoice,
} from "@workspace/api-zod";

type SourceStatement = { choice: AirlineStatementChoice; records: AirlineFinancialRecord[] };
type AnalyticsSelection = Pick<AirlineStatementChoice, "airline" | "scope" | "fiscalYearEnd" | "currency" | "status" | "ifrs" | "inAdministration"> & { period: string };
type MeasureDefinition = {
  key: string;
  name: string;
  formula: string;
  inputs: string[];
  calculate?: (values: Map<string, number>) => number;
};

const direct = (key: string, metric: string): MeasureDefinition => ({
  key,
  name: metric,
  formula: "Reported amount",
  inputs: [metric],
});

const profitabilityDefinitions: MeasureDefinition[] = [
  {
    key: "operatingMargin",
    name: "Operating margin",
    formula: "Operating Profit/(Loss) / Total Revenue",
    inputs: ["Operating Profit/(Loss)", "Total Revenue"],
    calculate: (v) => v.get("Operating Profit/(Loss)")! / v.get("Total Revenue")!,
  },
  {
    key: "ebitMargin",
    name: "EBIT margin",
    formula: "EBIT / Total Revenue",
    inputs: ["EBIT", "Total Revenue"],
    calculate: (v) => v.get("EBIT")! / v.get("Total Revenue")!,
  },
  {
    key: "ebitdaMargin",
    name: "EBITDA margin",
    formula: "(EBIT + |Depreciation & Amortisation|) / Total Revenue",
    inputs: ["EBIT", "Depreciation & Amortisation", "Total Revenue"],
    calculate: (v) => (v.get("EBIT")! + Math.abs(v.get("Depreciation & Amortisation")!)) / v.get("Total Revenue")!,
  },
  {
    key: "netProfitMargin",
    name: "Net profit margin",
    formula: "Profit / Loss After Tax / Total Revenue",
    inputs: ["Profit / Loss After Tax", "Total Revenue"],
    calculate: (v) => v.get("Profit / Loss After Tax")! / v.get("Total Revenue")!,
  },
];

const revenueMixDefinitions = [
  direct("passengerRevenue", "Passenger Revenue"),
  direct("cargoRevenue", "Cargo Revenue"),
  direct("otherRevenue", "Other / Unclassified Revenue"),
];

const balanceSheetDefinitions = [
  direct("totalAssets", "Total Assets"),
  direct("totalLiabilities", "Total Liabilities"),
  direct("totalEquity", "Total Equity"),
  direct("cashAndLiquidInvestments", "Cash & Liquid Investments"),
  direct("currentAssets", "Total Current Assets"),
  direct("currentLiabilities", "Total Current Liabilities"),
];
const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");

export function matchesFinancialAnalyticsSelection(choice: AirlineStatementChoice, selection: AnalyticsSelection): boolean {
  return selection.airline.trim().length > 0 && normalize(choice.airline) === normalize(selection.airline) &&
    normalize(choice.scope) === normalize(selection.scope) &&
    normalize(choice.fiscalYearEnd) === normalize(selection.fiscalYearEnd) &&
    normalize(choice.currency) === normalize(selection.currency) &&
    normalize(choice.status) === normalize(selection.status) &&
    normalize(choice.ifrs) === normalize(selection.ifrs) &&
    normalize(choice.inAdministration) === normalize(selection.inAdministration) &&
    normalize(choice.period) === normalize(selection.period);
}

function toInput(record: AirlineFinancialRecord): AirlineFinancialAnalyticsInput {
  return {
    recordId: record.id,
    metric: record.metric,
    amount: record.amount,
    sourceDate: record.sourceDate,
    sourceMetricId: record.sourceMetricId,
    sourceCategoryId: record.sourceCategoryId,
  };
}

function measure(
  definition: MeasureDefinition,
  recordsByMetric: Map<string, AirlineFinancialRecord[]>,
): AirlineFinancialAnalyticsMeasure {
  const records = definition.inputs.flatMap((metric) => recordsByMetric.get(metric) ?? []);
  const ambiguous = definition.inputs.some((metric) => (recordsByMetric.get(metric)?.length ?? 0) > 1);
  const missing = definition.inputs.some((metric) => {
    const matches = recordsByMetric.get(metric);
    return !matches?.length || matches.some((record) => record.amount == null);
  });
  const base = { key: definition.key, name: definition.name, formula: definition.formula };
  if (ambiguous) {
    return { ...base, value: null, availability: "ambiguous-input", inputs: records.map(toInput) };
  }
  if (missing) {
    return { ...base, value: null, availability: "missing-input", inputs: records.map(toInput) };
  }
  const values = new Map(records.map((record) => [record.metric, record.amount as number]));
  if (!definition.calculate) {
    const input = records[0];
    return {
      ...base,
      value: input.amount!,
      availability: "available",
      inputs: records.map(toInput),
    };
  }
  const denominator = definition.inputs.at(-1)!;
  if (values.get(denominator) === 0) {
    return { ...base, value: null, availability: "zero-denominator", inputs: records.map(toInput) };
  }
  const value = definition.calculate(values);
  if (!Number.isFinite(value)) {
    return { ...base, value: null, availability: "missing-input", inputs: records.map(toInput) };
  }
  return { ...base, value, availability: "available", inputs: records.map(toInput) };
}

const yearNumber = (year: string) => Number(year.match(/\d{4}/)?.[0] ?? NaN);
const compareYear = (a: string, b: string) => {
  const yearDifference = yearNumber(a) - yearNumber(b);
  return Number.isFinite(yearDifference) && yearDifference !== 0 ? yearDifference : a.localeCompare(b, undefined, { numeric: true });
};

export function buildFinancialAnalyticsStatement({ choice, records }: SourceStatement): AirlineFinancialAnalyticsStatement {
  const recordsByMetric = new Map<string, AirlineFinancialRecord[]>();
  records.forEach((record) => {
    const matches = recordsByMetric.get(record.metric) ?? [];
    matches.push(record);
    recordsByMetric.set(record.metric, matches);
  });
  const makeMeasure = (definition: MeasureDefinition) => measure(definition, recordsByMetric);
  const statement: AirlineFinancialAnalyticsStatement = {
    statementId: choice.id,
    airline: choice.airline,
    financialYear: choice.financialYear,
    period: choice.period,
    scope: choice.scope,
    fiscalYearEnd: choice.fiscalYearEnd,
    currency: choice.currency,
    status: choice.status,
    ifrs: choice.ifrs,
    inAdministration: choice.inAdministration,
    sourceDate: records[0]?.sourceDate ?? "",
    reportedRevenue: makeMeasure(direct("reportedRevenue", "Total Revenue")),
    operatingResult: makeMeasure(direct("operatingResult", "Operating Profit/(Loss)")),
    afterTax: makeMeasure(direct("afterTax", "Profit / Loss After Tax")),
    profitability: profitabilityDefinitions.map(makeMeasure),
    revenueMix: revenueMixDefinitions.map(makeMeasure),
    balanceSheet: balanceSheetDefinitions.map(makeMeasure),
  };
  return statement;
}

export function buildFinancialAnalytics(statements: SourceStatement[]): AirlineFinancialAnalyticsStatement[] {
  return statements
    .map(buildFinancialAnalyticsStatement)
    .sort((a, b) => compareYear(a.financialYear, b.financialYear) || a.statementId - b.statementId);
}
