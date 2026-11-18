import assert from "node:assert/strict";
import test from "node:test";
import { buildFinancialAnalytics, matchesFinancialAnalyticsSelection } from "../src/lib/airline-financial-analytics.ts";
import { GetAirlineFinancialAnalyticsResponse } from "../../../lib/api-zod/src/generated/api.ts";

const choice = (financialYear, id) => ({
  id, airline: "Example Air", financialYear, period: "Yr", fiscalYearEnd: "Yr End 31 Dec",
  currency: "NZD", status: "Actual", scope: "Group Consolidated", ifrs: "Yes",
  inAdministration: "", rows: 0,
});
const record = (statement, metric, amount, id) => ({
  id, metricId: id, metric, category: "", airline: statement.airline, financialYear: statement.financialYear,
  period: statement.period, fiscalYearEnd: statement.fiscalYearEnd, currency: statement.currency,
  status: statement.status, amount, sourceDate: "2026-06-30", scope: statement.scope,
  ifrs: statement.ifrs, inAdministration: statement.inAdministration, sourceMetricId: `M${id}`, sourceCategoryId: "C1",
});
const source = (financialYear, id, values) => {
  const statement = choice(financialYear, id);
  return {
    choice: statement,
    records: Object.entries(values).map(([metric, amount], index) => record(statement, metric, amount, id * 100 + index)),
  };
};

test("calculates source-based airline analytics without combining reporting periods", () => {
  const statements = buildFinancialAnalytics([
    source("FY 2025", 2, { "Total Revenue": 90, "Operating Profit/(Loss)": 4, EBIT: 8, "Depreciation & Amortisation": -2, "Profit / Loss After Tax": 2 }),
    source("FY 2026", 3, {
      "Total Revenue": 100, "Operating Profit/(Loss)": 5, EBIT: 10, "Depreciation & Amortisation": -2,
      "Profit / Loss After Tax": -1, "Passenger Revenue": 70, "Cargo Revenue": 20, "Other / Unclassified Revenue": 5,
      "Total Assets": 120, "Total Liabilities": 80, "Total Equity": 40, "Cash & Liquid Investments": 10,
      "Total Current Assets": 35, "Total Current Liabilities": 30,
    }),
  ]);
  assert.equal(statements.length, 2);
  const latest = statements[1];
  assert.equal(latest.financialYear, "FY 2026");
  assert.equal(latest.reportedRevenue.value, 100);
  assert.equal(latest.operatingResult.value, 5);
  assert.equal(latest.afterTax.value, -1);
  assert.equal(latest.profitability.find((item) => item.key === "operatingMargin")?.value, 0.05);
  assert.equal(latest.profitability.find((item) => item.key === "ebitMargin")?.value, 0.1);
  assert.equal(latest.profitability.find((item) => item.key === "ebitdaMargin")?.value, 0.12);
  assert.equal(latest.profitability.find((item) => item.key === "netProfitMargin")?.value, -0.01);
  assert.equal(latest.revenueMix.find((item) => item.key === "cargoRevenue")?.value, 20);
  assert.equal(latest.balanceSheet.find((item) => item.key === "currentLiabilities")?.value, 30);
  assert.equal(latest.profitability.find((item) => item.key === "ebitdaMargin")?.inputs.find((input) => input.metric === "Depreciation & Amortisation")?.amount, -2);

  const response = GetAirlineFinancialAnalyticsResponse.parse({
    source: "MASTER_DATABASE", sheet: "TIRALIS_AIRLINE_FINANCIAL", sourceDate: "2026-06-30",
    period: "Yr", statements,
  });
  assert.equal(response.statements[1].balanceSheet.length, 6);
});

test("preserves unavailable, ambiguous and zero-denominator states", () => {
  const zeroRevenue = source("FY 2026", 4, { "Total Revenue": 0, EBIT: 2, "Depreciation & Amortisation": 1 });
  const result = buildFinancialAnalytics([zeroRevenue])[0];
  assert.equal(result.profitability.find((item) => item.key === "ebitMargin")?.availability, "zero-denominator");
  assert.equal(result.profitability.find((item) => item.key === "netProfitMargin")?.availability, "missing-input");
  assert.equal(result.reportedRevenue.value, 0);

  const duplicate = source("FY 2026", 5, { "Total Revenue": 100, EBIT: 2 });
  duplicate.records.push(record(duplicate.choice, "Total Revenue", 90, 999));
  const ambiguous = buildFinancialAnalytics([duplicate])[0];
  assert.equal(ambiguous.reportedRevenue.availability, "ambiguous-input");
  assert.equal(ambiguous.profitability.find((item) => item.key === "ebitMargin")?.availability, "ambiguous-input");
});

test("matches only the selected airline, statement basis and comparable period", () => {
  const selected = choice("FY 2026", 6);
  const selection = { ...selected, period: "Yr" };
  assert.equal(matchesFinancialAnalyticsSelection(selected, selection), true);
  assert.equal(matchesFinancialAnalyticsSelection({ ...selected, currency: "USD" }, selection), false);
  assert.equal(matchesFinancialAnalyticsSelection({ ...selected, scope: "Company Standalone" }, selection), false);
  assert.equal(matchesFinancialAnalyticsSelection({ ...selected, fiscalYearEnd: "Yr End 31 Mar" }, selection), false);
  assert.equal(matchesFinancialAnalyticsSelection({ ...selected, period: "H1" }, selection), false);
});
