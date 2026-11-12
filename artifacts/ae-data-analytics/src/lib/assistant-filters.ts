/**
 * Reads the `assistantFilters` query parameter written by server-generated
 * assistant evidence links. Only keys present in `allowedKeys` are returned and
 * only non-empty string values (max 300 chars) are accepted; anything else is dropped.
 */
export function initialAssistantFilters<K extends string>(allowedKeys: readonly K[]): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {};
  if (typeof window === "undefined") return out;
  let raw: string | null = null;
  try { raw = new URLSearchParams(window.location.search).get("assistantFilters"); } catch { return out; }
  if (!raw) return out;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch {
    try { parsed = JSON.parse(decodeURIComponent(raw)); } catch { return out; }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return out;
  const obj = parsed as Record<string, unknown>;
  for (const k of allowedKeys) {
    if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
    const v = obj[k];
    if (typeof v === "string" && v.length <= 512) out[k] = v;
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = String(v);
  }
  return out;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const isIsoDate = (s: string | undefined): s is string => !!s && ISO.test(s);

/** Turns a single string value into a singleton array for multi-select dims. */
export const one = (v: string | undefined): string[] => (v ? [v] : []);

/** Merge validated string values into a template, keeping template shape (no arbitrary keys). */
export function applyStringFilters<T extends Record<string, string>>(base: T, init: Partial<Record<keyof T & string, string>>): T {
  const next = { ...base };
  for (const k of Object.keys(base) as (keyof T & string)[]) {
    const v = init[k];
    if (v !== undefined) (next as Record<string, string>)[k] = v;
  }
  return next;
}
