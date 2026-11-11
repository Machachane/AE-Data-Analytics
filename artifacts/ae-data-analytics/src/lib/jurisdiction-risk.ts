import type { JurisdictionRiskRecord } from "@workspace/api-client-react";

/** Sidebar filter dimensions (raw source values). Empty array = no filter. OR within a dimension, AND across. */
export type JurisdictionFilterKey = "country" | "jurisdictionType" | "region" | "repossessionCategory" | "lawCompliance";
export type JurisdictionFilters = Record<JurisdictionFilterKey, string[]>;
export const EMPTY_JURISDICTION_FILTERS: JurisdictionFilters = { country: [], jurisdictionType: [], region: [], repossessionCategory: [], lawCompliance: [] };
export const JURISDICTION_DIMS: JurisdictionFilterKey[] = ["country", "jurisdictionType", "region", "repossessionCategory", "lawCompliance"];

export function filterJurisdictions(rows: JurisdictionRiskRecord[], filters: JurisdictionFilters): JurisdictionRiskRecord[] {
  const keys = JURISDICTION_DIMS.filter((k) => filters[k]?.length);
  if (!keys.length) return rows;
  const sets = keys.map((k) => [k, new Set(filters[k])] as const);
  return rows.filter((r) => sets.every(([k, s]) => s.has(r[k])));
}

/**
 * Summary of filtered rows.
 * countries: distinct country labels; regions: distinct non-blank regions;
 * contributors: distinct contributor IDs across all rows (flatMap, not row count);
 * avgRepossessionOverall: mean of non-null repossessionOverallScore (null if none);
 * avgDeregistration: mean of non-null deregistrationScore (null if none). Zeros are kept.
 * Unmapped: rows with null latitude or longitude.
 */
export interface JurisdictionSummary {
  rows: number;
  countries: number;
  regions: number;
  contributors: number;
  avgRepossessionOverall: number | null;
  avgDeregistration: number | null;
  unmapped: number;
}
const mean = (v: (number | null)[]) => { const n = v.filter((x): x is number => x != null && Number.isFinite(x)); return n.length ? n.reduce((a, b) => a + b, 0) / n.length : null; };
export function summarizeJurisdictions(rows: JurisdictionRiskRecord[]): JurisdictionSummary {
  return {
    rows: rows.length,
    countries: new Set(rows.map((r) => r.country)).size,
    regions: new Set(rows.map((r) => r.region).filter(Boolean)).size,
    contributors: new Set(rows.flatMap((r) => r.contributorIds).filter(Boolean)).size,
    avgRepossessionOverall: mean(rows.map((r) => r.repossessionOverallScore)),
    avgDeregistration: mean(rows.map((r) => r.deregistrationScore)),
    unmapped: rows.filter((r) => r.latitude == null || r.longitude == null).length,
  };
}

/** Display helpers. Raw values are retained for filtering and export. */
export const prettyType = (v: string) => v.replace(/_/g, " ").toUpperCase();
export const prettyRegion = (v: string) => v.toUpperCase();
export const prettyLevel = (v: string) => v;
/** Source category colours: high = better score (green), moderate amber, low red. */
export const CATEGORY_COLOR: Record<string, string> = { high: "#1fbf75", moderate: "#e5a823", low: "#e0464b" };
export const categoryColor = (c: string) => CATEGORY_COLOR[c.toLowerCase()] ?? "#8a97a6";

export const exportRow = (r: JurisdictionRiskRecord) => ({
  country: r.country, alpha3: r.alpha3, jurisdiction_type: r.jurisdictionType, region: r.region,
  deregistration_score: r.deregistrationScore, repossession_score: r.repossessionScore,
  repossession_overall: r.repossessionOverallScore, repossession_category: r.repossessionCategory,
  rule_of_law_compliance_severity: r.lawCompliance, contributor_ids: r.contributorIds.join(";"),
  latitude: r.latitude, longitude: r.longitude,
});
