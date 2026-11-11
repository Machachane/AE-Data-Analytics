import type { EngineProfileRecord } from "@workspace/api-client-react";

/** Sidebar filter dimensions. Each key is a field of EngineProfileRecord; empty array = no filter. */
export type EngineFilterKey = "aircraftManufacturer" | "engineManufacturer" | "engineVariant" | "engineFamily" | "aircraftType";
export type EngineFilters = Record<EngineFilterKey, string[]>;
export const EMPTY_ENGINE_FILTERS: EngineFilters = { aircraftManufacturer: [], engineManufacturer: [], engineVariant: [], engineFamily: [], aircraftType: [] };

/** Rows matching every non-empty filter (exact value match, OR within a dimension, AND across). */
export function filterEngineProfiles(rows: EngineProfileRecord[], filters: EngineFilters): EngineProfileRecord[] {
  const keys = (Object.keys(filters) as EngineFilterKey[]).filter((k) => filters[k].length);
  if (!keys.length) return rows;
  const sets = keys.map((k) => [k, new Set(filters[k])] as const);
  return rows.filter((r) => sets.every(([k, s]) => s.has(r[k])));
}

/**
 * Headline summary of filtered rows.
 * soleSupplier: "Yes" only if every row is Yes (case-insensitive), "No" otherwise, null for 0 rows.
 * engineManufacturers / engineVariants: distinct non-blank values, case-insensitive.
 */
export interface EngineProfileSummary {
  rows: number;
  soleSupplier: "Yes" | "No" | null;
  soleYes: number;
  soleNo: number;
  soleOther: number;
  engineManufacturers: number;
  engineVariants: number;
}
const distinctCI = (vals: string[]) => new Set(vals.map((v) => v.trim().toLowerCase()).filter(Boolean)).size;
export function summarizeEngineProfiles(rows: EngineProfileRecord[]): EngineProfileSummary {
  let soleYes = 0, soleNo = 0, soleOther = 0;
  for (const r of rows) {
    const v = r.soleSupplier.trim().toLowerCase();
    if (v === "yes") soleYes++; else if (v === "no") soleNo++; else soleOther++;
  }
  return {
    rows: rows.length,
    soleSupplier: rows.length === 0 ? null : soleYes === rows.length ? "Yes" : "No",
    soleYes, soleNo, soleOther,
    engineManufacturers: distinctCI(rows.map((r) => r.engineManufacturer)),
    engineVariants: distinctCI(rows.map((r) => r.engineVariant)),
  };
}

/** Distinct (engineVariant, certificationDate) pair; dates stay raw text (e.g. "TBC"). */
export interface CertificationEntry { variant: string; date: string; rows: number }
const yearOf = (d: string) => { const m = d.match(/\d{4}/); return m ? Number(m[0]) : null; };
/** Distinct variant/date pairs sorted: TBC first, then year desc, then non-year text, ties by variant then date. */
export function certificationEntries(rows: EngineProfileRecord[]): CertificationEntry[] {
  const map = new Map<string, CertificationEntry>();
  for (const r of rows) {
    if (!r.engineVariant.trim() && !r.certificationDate.trim()) continue;
    const k = `${r.engineVariant}\u0000${r.certificationDate}`;
    const e = map.get(k);
    if (e) e.rows++; else map.set(k, { variant: r.engineVariant, date: r.certificationDate, rows: 1 });
  }
  const rank = (d: string) => (d.trim().toUpperCase() === "TBC" ? 0 : yearOf(d) != null ? 1 : 2);
  return [...map.values()].sort((a, b) => {
    const ra = rank(a.date), rb = rank(b.date);
    if (ra !== rb) return ra - rb;
    if (ra === 1) { const d = (yearOf(b.date) ?? 0) - (yearOf(a.date) ?? 0); if (d) return d; }
    return a.variant.localeCompare(b.variant) || a.date.localeCompare(b.date);
  });
}

/** Count of rows per category (blank kept as ""), sorted by count desc then name. */
export interface CategoryCount { name: string; count: number; share: number }
export function countBy(rows: EngineProfileRecord[], key: keyof EngineProfileRecord): CategoryCount[] {
  const m = new Map<string, number>();
  for (const r of rows) { const v = String(r[key]); m.set(v, (m.get(v) ?? 0) + 1); }
  const total = rows.length;
  return [...m.entries()].map(([name, count]) => ({ name, count, share: total ? count / total : 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/* ---------- Engine-specific secure CSV ---------- */
/** Neutralise spreadsheet formula injection: prefix ' when a string starts with = + - @ tab or CR. */
export function csvCell(v: unknown): string {
  if (v == null) return "";
  let s = typeof v === "number" ? String(v) : String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toEngineCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const heads = Object.keys(rows[0]);
  return [heads.map(csvCell).join(","), ...rows.map((r) => heads.map((h) => csvCell(r[h])).join(","))].join("\r\n");
}
export function downloadEngineCSV(filename: string, rows: Record<string, unknown>[]) {
  const blob = new Blob(["\ufeff" + toEngineCSV(rows)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Source-field labelled export row (all 13 fields, raw values). */
export const detailExportRow = (r: EngineProfileRecord) => ({
  AircraftMfr: r.aircraftManufacturer, Model: r.aircraftModel, Type: r.aircraftType, Comment: r.comment,
  CompetingEngineType: r.competingEngineType, EngineCertificationDate: r.certificationDate, EngineFamily: r.engineFamily,
  EngineManufacturer: r.engineManufacturer, SubVariant: r.engineVariant, SoleSupplier: r.soleSupplier,
  "FAA TCDS Holder": r.faaTcdsHolder, "Thrust lbf": r.thrust, ThrustNotes: r.thrustNotes,
});
