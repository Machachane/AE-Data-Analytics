import type { AirlineMetricTotal, AirlineStatementChoice } from "@workspace/api-client-react";

export const SCALE_LABEL = "USD (source scale)";

/** 2-decimal display; null stays blank. */
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

export const choiceLabel = (c: AirlineStatementChoice) => `${c.airline} / ${c.financialYear} / ${c.period} / ${c.scope || "(blank scope)"} / ${c.fiscalYearEnd || "(blank FYE)"}`;
export const fileSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
