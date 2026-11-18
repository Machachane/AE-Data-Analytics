import type {
  AirlineFinancialRatio,
  AirlineFinancialRatioStatement,
  AirlineFinancialRecord,
  AirlineStatementChoice,
} from "@workspace/api-zod";

export interface SourceFinancialStatement {
  choice: AirlineStatementChoice;
  records: AirlineFinancialRecord[];
}

type Formula = (values: Map<string, number | null>, prior?: Map<string, number | null>) => number | null;
type RatioDefinition = {
  key: string;
  category: string;
  name: string;
  formula: string;
  displayAs: "percent" | "multiple";
  inputs: string[];
  calculate: Formula;
  requiresPrior?: boolean;
};

const get = (values: Map<string, number | null>, metric: string) => values.get(metric) ?? null;
const sum = (...values: number[]) => values.reduce((total, value) => total + value, 0);
const divide = (numerator: number, denominator: number) => denominator === 0 ? null : numerator / denominator;

const definitions: RatioDefinition[] = [
  { key: "ebitdaMargin", category: "Profitability", name: "EBITDA margin", formula: "(EBIT + |Depreciation & Amortisation|) / Total Revenue", displayAs: "percent", inputs: ["EBIT", "Depreciation & Amortisation", "Total Revenue"], calculate: (v) => divide(sum(get(v, "EBIT")!, Math.abs(get(v, "Depreciation & Amortisation")!)), get(v, "Total Revenue")!) },
  { key: "ebitMargin", category: "Profitability", name: "EBIT margin", formula: "EBIT / Total Revenue", displayAs: "percent", inputs: ["EBIT", "Total Revenue"], calculate: (v) => divide(get(v, "EBIT")!, get(v, "Total Revenue")!) },
  { key: "operatingMargin", category: "Profitability", name: "Operating margin", formula: "Operating Profit/(Loss) / Total Revenue", displayAs: "percent", inputs: ["Operating Profit/(Loss)", "Total Revenue"], calculate: (v) => divide(get(v, "Operating Profit/(Loss)")!, get(v, "Total Revenue")!) },
  { key: "netProfitMargin", category: "Profitability", name: "Net profit margin", formula: "Profit / Loss After Tax / Total Revenue", displayAs: "percent", inputs: ["Profit / Loss After Tax", "Total Revenue"], calculate: (v) => divide(get(v, "Profit / Loss After Tax")!, get(v, "Total Revenue")!) },
  { key: "returnOnEquity", category: "Returns", name: "Return on equity (period)", formula: "Profit / Loss After Tax / Average Total Equity", displayAs: "percent", inputs: ["Profit / Loss After Tax", "Total Equity (current period)", "Total Equity (prior comparable period)"], requiresPrior: true, calculate: (v, p) => p ? divide(get(v, "Profit / Loss After Tax")!, sum(get(v, "Total Equity")!, get(p, "Total Equity")!) / 2) : null },
  { key: "returnOnAssets", category: "Returns", name: "Return on assets (period)", formula: "Profit / Loss After Tax / Average Total Assets", displayAs: "percent", inputs: ["Profit / Loss After Tax", "Total Assets (current period)", "Total Assets (prior comparable period)"], requiresPrior: true, calculate: (v, p) => p ? divide(get(v, "Profit / Loss After Tax")!, sum(get(v, "Total Assets")!, get(p, "Total Assets")!) / 2) : null },
  { key: "reportedDebtEquity", category: "Leverage", name: "Reported debt / equity", formula: "(Short Term Debt + Long Term Debt & Lease Liabilities) / Total Equity", displayAs: "multiple", inputs: ["Short Term Debt", "Long Term Debt & Lease Liabilities", "Total Equity"], calculate: (v) => divide(sum(get(v, "Short Term Debt")!, get(v, "Long Term Debt & Lease Liabilities")!), get(v, "Total Equity")!) },
  { key: "netDebtEbitda", category: "Leverage", name: "Net debt / reported-period EBITDA", formula: "(Short Term Debt + Long Term Debt & Lease Liabilities - Cash & Liquid Investments) / (EBIT + |Depreciation & Amortisation|)", displayAs: "multiple", inputs: ["Short Term Debt", "Long Term Debt & Lease Liabilities", "Cash & Liquid Investments", "EBIT", "Depreciation & Amortisation"], calculate: (v) => divide(sum(get(v, "Short Term Debt")!, get(v, "Long Term Debt & Lease Liabilities")!, -get(v, "Cash & Liquid Investments")!), sum(get(v, "EBIT")!, Math.abs(get(v, "Depreciation & Amortisation")!))) },
  { key: "liabilitiesAssets", category: "Leverage", name: "Total liabilities / assets", formula: "Total Liabilities / Total Assets", displayAs: "percent", inputs: ["Total Liabilities", "Total Assets"], calculate: (v) => divide(get(v, "Total Liabilities")!, get(v, "Total Assets")!) },
  { key: "interestCoverage", category: "Leverage", name: "Interest coverage (net interest)", formula: "EBIT / |Net Interest|", displayAs: "multiple", inputs: ["EBIT", "Net Interest"], calculate: (v) => divide(get(v, "EBIT")!, Math.abs(get(v, "Net Interest")!)) },
  { key: "currentRatio", category: "Liquidity", name: "Current ratio", formula: "Total Current Assets / Total Current Liabilities", displayAs: "multiple", inputs: ["Total Current Assets", "Total Current Liabilities"], calculate: (v) => divide(get(v, "Total Current Assets")!, get(v, "Total Current Liabilities")!) },
  { key: "cashRatio", category: "Liquidity", name: "Cash ratio", formula: "Cash & Liquid Investments / Total Current Liabilities", displayAs: "multiple", inputs: ["Cash & Liquid Investments", "Total Current Liabilities"], calculate: (v) => divide(get(v, "Cash & Liquid Investments")!, get(v, "Total Current Liabilities")!) },
  { key: "quickRatio", category: "Liquidity", name: "Quick ratio (cash + receivables)", formula: "(Cash & Liquid Investments + Trade Receivables) / Total Current Liabilities", displayAs: "multiple", inputs: ["Cash & Liquid Investments", "Trade Receivables", "Total Current Liabilities"], calculate: (v) => divide(sum(get(v, "Cash & Liquid Investments")!, get(v, "Trade Receivables")!), get(v, "Total Current Liabilities")!) },
  { key: "fuelCostRevenue", category: "Cost mix", name: "Fuel cost / revenue", formula: "|Fuel Costs| / Total Revenue", displayAs: "percent", inputs: ["Fuel Costs", "Total Revenue"], calculate: (v) => divide(Math.abs(get(v, "Fuel Costs")!), get(v, "Total Revenue")!) },
  { key: "staffCostRevenue", category: "Cost mix", name: "Staff costs / revenue", formula: "|Staff Costs| / Total Revenue", displayAs: "percent", inputs: ["Staff Costs", "Total Revenue"], calculate: (v) => divide(Math.abs(get(v, "Staff Costs")!), get(v, "Total Revenue")!) },
  { key: "leaseRentRevenue", category: "Cost mix", name: "Lease rents / revenue", formula: "|Lease Rents| / Total Revenue", displayAs: "percent", inputs: ["Lease Rents", "Total Revenue"], calculate: (v) => divide(Math.abs(get(v, "Lease Rents")!), get(v, "Total Revenue")!) },
  { key: "otherOperatingCostsRevenue", category: "Cost mix", name: "Other operating costs / revenue", formula: "|Other Operating Costs| / Total Revenue", displayAs: "percent", inputs: ["Other Operating Costs", "Total Revenue"], calculate: (v) => divide(Math.abs(get(v, "Other Operating Costs")!), get(v, "Total Revenue")!) },
  { key: "passengerRevenueShare", category: "Revenue mix", name: "Passenger revenue share", formula: "Passenger Revenue / Total Revenue", displayAs: "percent", inputs: ["Passenger Revenue", "Total Revenue"], calculate: (v) => divide(get(v, "Passenger Revenue")!, get(v, "Total Revenue")!) },
  { key: "cargoRevenueShare", category: "Revenue mix", name: "Cargo revenue share", formula: "Cargo Revenue / Total Revenue", displayAs: "percent", inputs: ["Cargo Revenue", "Total Revenue"], calculate: (v) => divide(get(v, "Cargo Revenue")!, get(v, "Total Revenue")!) },
  { key: "otherRevenueShare", category: "Revenue mix", name: "Other revenue share", formula: "Other / Unclassified Revenue / Total Revenue", displayAs: "percent", inputs: ["Other / Unclassified Revenue", "Total Revenue"], calculate: (v) => divide(get(v, "Other / Unclassified Revenue")!, get(v, "Total Revenue")!) },
];

const yearNumber = (year: string) => Number(year.match(/\d{4}/)?.[0] ?? NaN);
const periodOrder = ["Yr", "H1", "6M", "Q1", "Q2", "9M", "10M", "15M", "H2", "Q3", "Q4"];

function valuesOf(statement: SourceFinancialStatement) {
  const values = new Map<string, number | null>();
  for (const record of statement.records) {
    if (values.has(record.metric)) {
      const existing = values.get(record.metric);
      if (existing !== record.amount) values.set(record.metric, null);
    } else values.set(record.metric, record.amount);
  }
  return values;
}

export function calculateFinancialRatios(source: SourceFinancialStatement[]): AirlineFinancialRatioStatement[] {
  const ordered = [...source].sort((a, b) =>
    yearNumber(a.choice.financialYear) - yearNumber(b.choice.financialYear) ||
    periodOrder.indexOf(a.choice.period) - periodOrder.indexOf(b.choice.period));
  const byComparablePeriod = new Map<string, SourceFinancialStatement>();
  for (const statement of ordered) {
    const year = yearNumber(statement.choice.financialYear);
    if (Number.isFinite(year)) byComparablePeriod.set(`${statement.choice.period}|${year}`, statement);
  }
  return ordered.map((statement) => {
    const values = valuesOf(statement);
    const previousChoice = byComparablePeriod.get(`${statement.choice.period}|${yearNumber(statement.choice.financialYear) - 1}`);
    const previous = previousChoice ? valuesOf(previousChoice) : undefined;
    const ratios: AirlineFinancialRatio[] = definitions.map((definition) => {
      const inputs = definition.inputs.map((metric) => {
        if (metric.includes("(current period)")) return { metric, amount: get(values, metric.replace(" (current period)", "")) };
        if (metric.includes("(prior comparable period)")) return { metric, amount: previous ? get(previous, metric.replace(" (prior comparable period)", "")) : null };
        return { metric, amount: get(values, metric) };
      });
      const missingPrior = definition.requiresPrior && !previous;
      const missingInput = inputs.some((input) => input.amount == null);
      let availability: AirlineFinancialRatio["availability"] = "available";
      let value: number | null = null;
      if (missingPrior) availability = "missing-comparator";
      else if (missingInput) availability = "missing-input";
      else {
        value = definition.calculate(values, previous);
        if (value == null || !Number.isFinite(value)) {
          value = null;
          availability = "zero-denominator";
        }
      }
      return { key: definition.key, category: definition.category, name: definition.name, formula: definition.formula,
        displayAs: definition.displayAs, value, availability, inputs };
    });
    return {
      statementId: statement.choice.id, airline: statement.choice.airline, financialYear: statement.choice.financialYear,
      period: statement.choice.period, fiscalYearEnd: statement.choice.fiscalYearEnd, currency: statement.choice.currency,
      status: statement.choice.status, scope: statement.choice.scope, ifrs: statement.choice.ifrs,
      inAdministration: statement.choice.inAdministration,
      sourceDate: statement.records[0]?.sourceDate ?? "", ratios,
    };
  });
}

export const FINANCIAL_RATIO_DEFINITIONS = definitions.map(({ key, category, name, formula, displayAs }) => ({ key, category, name, formula, displayAs }));
