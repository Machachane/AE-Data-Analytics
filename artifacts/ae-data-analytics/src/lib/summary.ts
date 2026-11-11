import type { GetSummaryParams } from "@workspace/api-client-react";

export type SummaryFilterState = { from: string; to: string; country: string; airline: string; model: string; manufacturer: string; aircraftModel: string };

/** Build API params, omitting "All" (empty) values. */
export function summaryParams(f: SummaryFilterState): GetSummaryParams {
  const p: GetSummaryParams = {};
  (Object.keys(f) as (keyof SummaryFilterState)[]).forEach((k) => { if (f[k]) p[k] = f[k]; });
  return p;
}

export const fmtInt = (n: number | null | undefined) => (n == null ? "\u2014" : Math.round(n).toLocaleString("en-US"));
export const fmtFull = (n: number | null | undefined) => (n == null ? "blank" : n.toLocaleString("en-US", { maximumFractionDigits: 20 }));
export const fmt2 = (n: number | null | undefined) => (n == null ? "\u2014" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/** Compact Power BI style: 959.77M, 371M, 32.8K. */
export function fmtCompact(n: number | null | undefined): string {
  if (n == null) return "\u2014";
  const a = Math.abs(n);
  const s = (v: number, u: string) => `${Number(v.toFixed(2)).toLocaleString("en-US")}${u}`;
  if (a >= 1e9) return s(n / 1e9, "bn");
  if (a >= 1e6) return s(n / 1e6, "M");
  return Math.round(n).toLocaleString("en-US");
}

/** Share of total as a percentage with 2 decimals, e.g. 54.24%. */
export function pct(value: number, total: number): string {
  if (!total) return "0.00%";
  return `${((value / total) * 100).toFixed(2)}%`;
}

/** ISO yyyy-mm-dd to dd/mm/yyyy display. */
export const isoToDisplay = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);

/** RFC 4180 CSV for local ranking exports. */
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    let s = v == null ? "" : String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}

export function downloadText(name: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export const SUMMARY_COLORS = { delivery: "#2f7de1", order: "#f0782d", bar: "#1fd18b", airbus: "#2f7de1", boeing: "#1fd18b", other: "#8a97a6" };
