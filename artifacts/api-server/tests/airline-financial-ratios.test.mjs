import assert from "node:assert/strict";
import test from "node:test";
import { calculateFinancialRatios, FINANCIAL_RATIO_DEFINITIONS } from "../src/lib/airline-financial-ratios.ts";
import { GetAirlineFinancialRatiosResponse } from "../../../lib/api-zod/src/generated/api.ts";

const basis = (financialYear, id) => ({
  id, airline: "Example Air", financialYear, period: "Yr", fiscalYearEnd: "Yr End 31 Dec",
  currency: "USD", status: "Actual", scope: "Company Standalone", ifrs: "Yes", inAdministration: "No", rows: 0,
});
const record = (choice, metric, amount, id) => ({
  id, metricId: id, metric, category: "", airline: choice.airline, financialYear: choice.financialYear,
  period: choice.period, fiscalYearEnd: choice.fiscalYearEnd, currency: choice.currency, status: choice.status,
  amount, sourceDate: "2026", scope: choice.scope, ifrs: choice.ifrs, inAdministration: choice.inAdministration,
  sourceMetricId: "", sourceCategoryId: "",
});
const statement = (year, id, amounts) => {
  const choice = basis(year, id);
  return { choice, records: Object.entries(amounts).map(([metric, amount], i) => record(choice, metric, amount, id * 100 + i)) };
};
const ratio = (rows, year, key) => rows.find((row) => row.financialYear === year)?.ratios.find((item) => item.key === key);

const prior = statement("FY 2024", 1, {
  "Total Equity": 40, "Total Assets": 140, "Total Revenue": 80,
});
const current = statement("FY 2025", 2, {
  "EBIT": 25, "Depreciation & Amortisation": -5, "Total Revenue": 100, "Operating Profit/(Loss)": 20,
  "Profit / Loss After Tax": 10, "Total Equity": 50, "Total Assets": 150,
  "Short Term Debt": 10, "Long Term Debt & Lease Liabilities": 30, "Cash & Liquid Investments": 5,
  "Total Liabilities": 90, "Net Interest": -10, "Total Current Assets": 60,
  "Total Current Liabilities": 50, "Trade Receivables": 10, "Fuel Costs": -35, "Staff Costs": -12,
  "Lease Rents": -8, "Other Operating Costs": -20, "Passenger Revenue": 85,
  "Cargo Revenue": 5, "Other / Unclassified Revenue": 10,
});

test("calculates the 20 screenshot KPIs from one statement basis", () => {
  const rows = calculateFinancialRatios([current, prior]);
  assert.equal(FINANCIAL_RATIO_DEFINITIONS.length, 20);
  const expected = {
    ebitdaMargin: 0.3, ebitMargin: 0.25, operatingMargin: 0.2, netProfitMargin: 0.1,
    returnOnEquity: 10 / 45, returnOnAssets: 10 / 145, reportedDebtEquity: 0.8, netDebtEbitda: 35 / 30,
    liabilitiesAssets: 0.6, interestCoverage: 2.5, currentRatio: 1.2, cashRatio: 0.1,
    quickRatio: 0.3, fuelCostRevenue: 0.35, staffCostRevenue: 0.12, leaseRentRevenue: 0.08,
    otherOperatingCostsRevenue: 0.2, passengerRevenueShare: 0.85, cargoRevenueShare: 0.05, otherRevenueShare: 0.1,
  };
  for (const [key, value] of Object.entries(expected)) assert.equal(ratio(rows, "FY 2025", key)?.value, value, key);
  const response = GetAirlineFinancialRatiosResponse.parse({
    source: "test source", sheet: "test sheet", sourceDate: "2026", primary: rows,
    comparisonBasis: null, comparisonAirline: null,
  });
  assert.equal(response.primary[1].ratios.length, 20);
});

test("keeps missing inputs and zero denominators unavailable instead of treating them as zero", () => {
  const fuelRatio = ratio(calculateFinancialRatios([prior, current]), "FY 2025", "fuelCostRevenue");
  assert.equal(fuelRatio?.availability, "available");
  assert.equal(fuelRatio?.value, 0.35);

  const noRevenue = statement("FY 2026", 3, { EBIT: 4, "Depreciation & Amortisation": 1, "Total Revenue": 0 });
  const noPreviousYear = calculateFinancialRatios([noRevenue])[0];
  assert.equal(noPreviousYear.ratios.find((item) => item.key === "ebitdaMargin")?.availability, "zero-denominator");
  assert.equal(noPreviousYear.ratios.find((item) => item.key === "returnOnEquity")?.availability, "missing-comparator");

  const missing = statement("FY 2026", 4, { "Total Revenue": 100 });
  const missingFuelInput = calculateFinancialRatios([missing])[0].ratios.find((item) => item.key === "fuelCostRevenue");
  assert.equal(missingFuelInput?.availability, "missing-input");
  assert.equal(missingFuelInput?.value, null);
});
