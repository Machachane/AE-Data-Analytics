import type { DeliveryRecord } from "@workspace/api-client-react";

export type Dim = "customer" | "region" | "model" | "manufacturer";
export interface Filters {
  from: string;
  to: string;
  customer: string[];
  region: string[];
  model: string[];
  manufacturer: string[];
}

export const PALETTE = [
  "#4f8ff7", "#f59e3b", "#3fbf7f", "#e2558f", "#a78bfa", "#2dd4bf", "#f2cb48", "#ef6461",
  "#7dd3fc", "#c084fc", "#84cc16", "#fb923c", "#22d3ee", "#f472b6", "#94a3b8", "#facc15",
  "#60a5fa", "#34d399", "#fda4af", "#818cf8", "#bef264", "#fdba74", "#5eead4", "#d946ef",
  "#a3e635", "#38bdf8", "#e879f9", "#fcd34d", "#4ade80", "#f87171", "#93c5fd", "#c4b5fd",
  "#86efac", "#fca5a5", "#67e8f9", "#fde68a",
];

export function applyFilters(rows: DeliveryRecord[], f: Filters) {
  return rows.filter(
    (r) =>
      r.date >= f.from &&
      r.date <= f.to &&
      (!f.customer.length || f.customer.includes(r.customer)) &&
      (!f.region.length || f.region.includes(r.region)) &&
      (!f.model.length || f.model.includes(r.model)) &&
      (!f.manufacturer.length || f.manufacturer.includes(r.manufacturer)),
  );
}

export function rank(rows: DeliveryRecord[], dim: Dim) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r[dim], (m.get(r[dim]) ?? 0) + r.quantity);
  return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

export function distinct(rows: DeliveryRecord[], dim: Dim) {
  return [...new Set(rows.map((r) => r[dim]))].sort((a, b) => a.localeCompare(b));
}

export function monthRange(from: string, to: string) {
  const out: string[] = [];
  let [y, m] = from.slice(0, 7).split("-").map(Number);
  const [ey, em] = to.slice(0, 7).split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
    if (out.length > 1200) break;
  }
  return out;
}

export function monthly(rows: DeliveryRecord[], dim: Dim, months: string[]) {
  const keys = rank(rows, dim).map((d) => d.name);
  const idx = new Map(months.map((m, i) => [m, i]));
  const data = months.map((month) => {
    const o: Record<string, number | string> = { month };
    for (const k of keys) o[k] = 0;
    return o;
  });
  for (const r of rows) {
    const i = idx.get(r.date.slice(0, 7));
    if (i !== undefined) data[i][r[dim]] = (data[i][r[dim]] as number) + r.quantity;
  }
  return { keys, data };
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
export const fullMonth = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
export const fmtDate = (d: string) => {
  const [y, m, day] = d.split("-");
  return `${Number(day)} ${MONTHS[Number(m) - 1]} ${y}`;
};
export const nf = (n: number) => n.toLocaleString("en-US");

export function downloadCSV(name: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const head = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [head.join(","), ...rows.map((r) => head.map((h) => esc(r[h])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
