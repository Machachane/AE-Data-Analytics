type CountryPoint = { country: string; alpha3: string; latitude: number | null; longitude: number | null };
type Geography = { features: { properties?: { NAME_EN?: string; ADM0_A3?: string; LABEL_X?: number; LABEL_Y?: number; LABELRANK?: number } | null }[] };
export type CountryLabel = { name: string; latitude: number; longitude: number; rank: number; alpha3: string };

/** All labels remain available: each rank fades in across one zoom level. */
export function countryLabelOpacity(rank: number, zoom: number): number {
  return Math.max(0, Math.min(1, zoom - (rank - 1)));
}

const validPoint = (lat: unknown, lon: unknown): boolean =>
  typeof lat === "number" && Number.isFinite(lat) && Math.abs(lat) <= 90 &&
  typeof lon === "number" && Number.isFinite(lon) && Math.abs(lon) <= 180;

/** Label every background country, plus mapped source countries absent from the coarse geography. */
export function countryLabels(world: Geography, rows: CountryPoint[]): CountryLabel[] {
  const result: CountryLabel[] = [];
  const codes = new Set<string>();
  const names = new Set<string>();
  const normalize = (name: string) => name.trim().toLowerCase();
  for (const feature of world.features) {
    const p = feature.properties;
    if (!p?.NAME_EN?.trim() || !validPoint(p.LABEL_Y, p.LABEL_X)) continue;
    if (names.has(normalize(p.NAME_EN))) continue;
    const rank = Number.isFinite(p.LABELRANK) ? Math.max(2, Math.min(7, p.LABELRANK!)) : 5;
    result.push({ name: p.NAME_EN, latitude: p.LABEL_Y!, longitude: p.LABEL_X!, rank, alpha3: p.ADM0_A3 ?? "" });
    names.add(normalize(p.NAME_EN));
    if (p.ADM0_A3) codes.add(p.ADM0_A3.toUpperCase());
  }
  for (const row of rows) {
    if (!row.country.trim() || !validPoint(row.latitude, row.longitude)) continue;
    if ((row.alpha3 && codes.has(row.alpha3.toUpperCase())) || names.has(normalize(row.country))) continue;
    result.push({ name: row.country, latitude: row.latitude!, longitude: row.longitude!, rank: 7, alpha3: row.alpha3 });
    names.add(normalize(row.country));
    if (row.alpha3) codes.add(row.alpha3.toUpperCase());
  }
  return result;
}
