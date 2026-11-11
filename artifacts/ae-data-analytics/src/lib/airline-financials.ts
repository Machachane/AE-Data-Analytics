import type { AirlineMetricTotal, AirlineFinancialRecord, AirlineFinancialStatement, AirlineStatementChoice } from "@workspace/api-client-react";
import { toEngineCSV } from "./engine-profile";

export const SCALE_LABEL = "USD (source scale)";

/** 2-decimal display; null stays blank. Full precision belongs in tooltips/exports. */
export const fmtAmt = (v: number | null | undefined) =>
  v == null ? "" : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const rawAmt = (v: number | null | undefined) => (v == null ? "" : String(v));

export interface WaterfallStep {
  kind: "increase" | "decrease" | "total";
  id: number | null;
  label: string;
  category: string;
  amount: number;
  start: number;
  end: number;
  rows: number;
}

/**
 * Cumulative waterfall from signed source amounts, in API-provided order.
 * Null amounts (no source values) are skipped, not treated as zero; zero is a real value.
 * No sign inversion. Final Total bar anchors at 0 and ends at the running total.
 */
export function buildWaterfallSteps(totals: AirlineMetricTotal[]): { steps: WaterfallStep[]; skipped: AirlineMetricTotal[] } {
  const steps: WaterfallStep[] = [];
  const skipped: AirlineMetricTotal[] = [];
  let run = 0;
  let rows = 0;
  for (const t of totals) {
    if (t.amount == null) { skipped.push(t); continue; }
    const start = run;
    run = run + t.amount;
    rows += t.rows;
    steps.push({ kind: t.amount < 0 ? "decrease" : "increase", id: t.id, label: t.metric, category: t.category, amount: t.amount, start, end: run, rows: t.rows });
  }
  if (steps.length) steps.push({ kind: "total", id: null, label: "Total", category: "", amount: run, start: 0, end: run, rows });
  return { steps, skipped };
}

export const metricTotalsExportRows = (totals: AirlineMetricTotal[]) => {
  let run = 0;
  return totals.map((t) => {
    if (t.amount != null) run += t.amount;
    return { MetricId: t.id, Metric: t.metric, Category: t.category, SourceRows: t.rows, Amount: t.amount, RunningSourceSum: t.amount == null ? null : run, Currency: SCALE_LABEL };
  });
};

export const recordExportRow = (r: AirlineFinancialRecord, section: string) => ({
  Section: section, Category: r.category, Metric: r.metric, Amount: r.amount, Currency: r.currency || "USD", Scale: "source scale (unit multiplier not declared)",
  Airline: r.airline, FinancialYear: r.financialYear, ReportingPeriod: r.period, FiscalYearEnd: r.fiscalYearEnd, ReportingScope: r.scope,
  IFRS16_ASC842: r.ifrs, InAdministration: r.inAdministration, Status: r.status, SourceDate: r.sourceDate,
});

export const statementCSV = (s: AirlineFinancialStatement) =>
  toEngineCSV([...s.balanceSheet.map((r) => recordExportRow(r, "Balance Sheet")), ...s.profitLoss.map((r) => recordExportRow(r, "Profit & Loss"))]);

export const escapeHtml = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export const choiceLabel = (c: AirlineStatementChoice) => `${c.airline} / ${c.financialYear} / ${c.period} / ${c.scope || "(blank scope)"} / ${c.fiscalYearEnd || "(blank FYE)"}`;

/** Self-contained printable HTML report. All strings escaped; no synthetic totals. */
export function statementHTML(s: AirlineFinancialStatement, meta: { source: string; sheet: string; sourceDate: string }): string {
  const c = s.choice;
  const section = (title: string, rows: AirlineFinancialRecord[]) => {
    if (!rows.length) return `<h2>${escapeHtml(title)}</h2><p class="empty">No ${escapeHtml(title)} source lines for this statement. This is a partial report; missing lines are not filled with zero.</p>`;
    let cat = "";
    const body = rows.map((r) => {
      const head = r.category !== cat ? `<tr class="cat"><td colspan="2">${escapeHtml((cat = r.category))}</td></tr>` : "";
      return `${head}<tr><td>${escapeHtml(r.metric)}</td><td class="n" title="${escapeHtml(rawAmt(r.amount))}">${escapeHtml(fmtAmt(r.amount))}</td></tr>`;
    }).join("");
    return `<h2>${escapeHtml(title)}</h2><table><thead><tr><th>Line item</th><th class="n">Amount (${escapeHtml(SCALE_LABEL)})</th></tr></thead><tbody>${body}</tbody></table>`;
  };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(`${c.airline} ${c.financialYear} ${c.period} statement`)}</title>
<style>body{font-family:'IBM Plex Sans',system-ui,sans-serif;color:#13263a;margin:32px;font-size:12px}h1{font-size:18px;margin:0}h2{font-size:13px;margin:20px 0 6px;border-bottom:2px solid #1f7a7a;padding-bottom:3px;text-transform:uppercase;letter-spacing:.05em}table{border-collapse:collapse;width:100%}td,th{padding:3px 6px;border-bottom:1px solid #d8e0e8;text-align:left}.n{text-align:right;font-variant-numeric:tabular-nums}.cat td{font-weight:600;background:#eef3f6}.meta{color:#4a5d70;margin-top:4px}.empty{color:#9a3a2a;font-style:italic}ul{color:#4a5d70}</style></head><body>
<h1>Balance Sheet and Profit &amp; Loss: ${escapeHtml(c.airline)}</h1>
<div class="meta">${escapeHtml(c.financialYear)} &middot; ${escapeHtml(c.period)} &middot; Scope: ${escapeHtml(c.scope || "(blank)")} &middot; Fiscal year end: ${escapeHtml(c.fiscalYearEnd || "(blank)")} &middot; ${escapeHtml(c.currency || "USD")} source scale (unit multiplier not declared)</div>
<div class="meta">Source: ${escapeHtml(meta.source)}, sheet ${escapeHtml(meta.sheet)}, source date ${escapeHtml(meta.sourceDate)}. ${escapeHtml(c.rows)} source lines. Powered by Tiralis data from a user-supplied snapshot; not an official or live feed.</div>
${section("Balance Sheet", s.balanceSheet)}${section("Profit & Loss", s.profitLoss)}
<h2>Notes</h2><ul><li>Lines are actual source values in logical order. Zeros are reported zeros; missing lines are absent. No subtotals or totals have been calculated.</li>${s.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>
</body></html>`;
}

export function downloadText(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export const fileSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
