import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import { GetAviationFinanceResponse, type FinanceDashboard, type FinanceMla, type FinanceRow } from "@workspace/api-zod";
import { ObjectStorageService } from "./objectStorage";

const unzip = promisify(gunzip);
const shape = GetAviationFinanceResponse.shape;
const PERIODS = ["Q1", "Q2", "H1", "Q3", "Q4", "H2", "YR"];
type FinanceSource = Pick<FinanceDashboard, "sources" | "mla" | "borrowers" | "analyses">;

let loading: Promise<FinanceSource> | undefined;
async function snapshot(): Promise<FinanceSource> {
  if (!loading) {
    loading = (async () => {
      const file = await new ObjectStorageService().getObjectEntityFile("/objects/analytics/aviation-finance.json.gz");
      const [compressed] = await file.download();
      const raw = JSON.parse((await unzip(compressed)).toString("utf8"));
      if (raw?.version !== 1) throw new Error("Unsupported aviation finance snapshot");
      const data: FinanceSource = {
        sources: shape.sources.parse(raw.sources),
        mla: shape.mla.parse(raw.mla),
        borrowers: shape.borrowers.parse(raw.borrowers),
        analyses: shape.analyses.parse(raw.analyses),
      };
      if (!data.mla.length || !data.borrowers.length || data.analyses.length !== 3 ||
        data.analyses.some(a => a.rows.some(r => r.values.length !== a.columns.length)) ||
        [...data.mla, ...data.borrowers].some(r => !r.name.trim() || !PERIODS.includes(r.period) || r.deals < 0)) {
        throw new Error("Incomplete aviation finance snapshot");
      }
      return data;
    })().catch(error => { loading = undefined; throw error; });
  }
  return loading;
}

export class FinanceFilterError extends Error {}

function periodsFor(data: FinanceSource, year: number): string[] {
  // Only offer snapshots shared by lender and borrower sources. Never sum Q/H/YR rows together.
  const mla = new Set(data.mla.filter(r => r.year === year).map(r => r.period));
  const borrowers = new Set(data.borrowers.filter(r => r.year === year).map(r => r.period));
  return PERIODS.filter(p => mla.has(p) && borrowers.has(p));
}

function preferredPeriod(periods: string[]): string {
  return periods.includes("YR") ? "YR" : periods.includes("H1") ? "H1" : periods[periods.length - 1];
}

function groupBorrowers(rows: FinanceRow[]): FinanceRow[] {
  const groups = new Map<string, FinanceRow>();
  for (const row of rows) {
    const key = row.name.toLocaleLowerCase("en");
    const current = groups.get(key);
    if (current) { current.total += row.total; current.deals += row.deals; }
    else groups.set(key, { ...row });
  }
  return [...groups.values()];
}

function groupMla(rows: FinanceMla[]): FinanceMla[] {
  const groups = new Map<string, FinanceMla>();
  for (const row of rows) {
    const key = row.name.toLocaleLowerCase("en");
    const current = groups.get(key);
    if (current) {
      current.total += row.total;
      current.deals += row.deals;
      current.capitalMarkets += row.capitalMarkets;
      current.commercial += row.commercial;
    } else groups.set(key, { ...row });
  }
  return [...groups.values()];
}

const byTotal = (a: FinanceRow, b: FinanceRow) => b.total - a.total || a.name.localeCompare(b.name);

export async function aviationFinance(filters: { year?: number; period?: string }): Promise<FinanceDashboard> {
  const data = await snapshot();
  const borrowerYears = new Set(data.borrowers.map(r => r.year));
  const years = [...new Set(data.mla.map(r => r.year))].filter(y => borrowerYears.has(y) && periodsFor(data, y).length > 0).sort((a, b) => b - a);
  if (!years.length) throw new Error("Finance sources have no shared reporting period");
  const defaultYear = years[0];
  const defaultPeriod = preferredPeriod(periodsFor(data, defaultYear));
  const year = filters.year ?? defaultYear;
  if (!years.includes(year)) throw new FinanceFilterError("Choose a year available in the imported finance workbooks");
  const periods = periodsFor(data, year);
  const period = filters.period ?? preferredPeriod(periods);
  if (!periods.includes(period)) throw new FinanceFilterError(`Reporting period is not available for ${year}`);
  const selected = (r: FinanceRow) => r.year === year && r.period === period;
  const allMla = groupMla(data.mla.filter(selected));
  const anonymous = allMla.filter(r => /undisclosed/i.test(r.name));
  const named = allMla.filter(r => !/undisclosed/i.test(r.name));
  const mla = named.filter(r => r.total !== 0).sort(byTotal);
  const borrowers = groupBorrowers(data.borrowers.filter(selected)).filter(r => r.total !== 0).sort(byTotal);
  const capitalMarkets = named.filter(r => r.capitalMarkets !== 0).slice().sort((a, b) => b.capitalMarkets - a.capitalMarkets || a.name.localeCompare(b.name));
  const commercial = named.filter(r => r.commercial !== 0).slice().sort((a, b) => b.commercial - a.commercial || a.name.localeCompare(b.name));
  return {
    sources: data.sources, years, periods, defaultYear, defaultPeriod, year, period,
    mla, borrowers, capitalMarkets, commercial, analyses: data.analyses,
    excludedMla: {
      count: anonymous.length,
      total: anonymous.reduce((sum, r) => sum + r.total, 0),
      capitalMarkets: anonymous.reduce((sum, r) => sum + r.capitalMarkets, 0),
      commercial: anonymous.reduce((sum, r) => sum + r.commercial, 0),
    },
    notes: [
      "Imported workbook snapshots, not a live financing feed. Ranking amounts are USD millions; deal counts are the source NR DEALS measure.",
      "Year and Reporting Period select exact source snapshots. Q1/Q2, H1 and YR are overlapping reporting aggregates and are never added together. Only periods present in both ranking workbooks are offered.",
      "Clear All Filters restores the latest reference snapshot (2026 H1). For other years, select a year to load its available full-year or half-year snapshot.",
      "The Facility, Financier and Geographic analysis tables contain fixed H1/2025, H2/2025 and Year 2025 source figures. Year and Reporting Period filters apply only to the four rankings, not these reference tables.",
      "Percentage figures are source fractions displayed as whole percentages. Facility Total ($Bn) is already in USD billions, not a percentage or USD millions. Source precision is retained in exports; displayed figures are rounded.",
      "UNDISCLOSED and No MLA/UNDISCLOSED groups are omitted from all three MLA rankings to match the Power BI report. The excluded amounts are disclosed separately; source rows are retained.",
      "Borrowers with different source names, such as American and American Airlines, remain distinct. Names differing only by case or whitespace are grouped. Zero-value rows are omitted from rankings.",
      "The source Financier Analysis categories are not exhaustive. Their percentages are shown as supplied and are not normalized to 100%.",
    ],
  };
}
