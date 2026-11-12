import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";

/**
 * Shared assistant <-> dashboard controller.
 *
 * Pages call `useAssistantModule(slug, { ready, filters, apply })` to publish their live native
 * filter state and an apply handler. The chat reads `useAssistantController()` to send the
 * live scope with each question and to apply server-validated actions without page reloads.
 */

export type FilterValue = string | string[];
export type FilterMap = Record<string, FilterValue>;
type Kind = "single" | "multi";

export const MODULE_KEYS = {
  summary: { from: "single", to: "single", country: "single", airline: "single", model: "single", manufacturer: "single", aircraftModel: "single" },
  deliveries: { from: "single", to: "single", customer: "multi", region: "multi", model: "multi", manufacturer: "multi" },
  orders: { from: "single", to: "single", customer: "multi", region: "multi", model: "multi", manufacturer: "multi" },
  "aircraft-utilisation": { from: "single", to: "single", airline: "single", model: "single", manufacturer: "single", msn: "single", engine: "single" },
  "aviation-finance": { year: "single", period: "single" },
  "market-value-lease-rates": { manufacturer: "multi", aircraftType: "multi", vintage: "multi" },
  emissions: { date: "single", msn: "single", icao: "single", airline: "single", engine: "single" },
  "aircraft-registry": { manufacturer: "single", model: "single", registration: "single", msn: "single", operator: "single", owner: "single", aircraftType: "single" },
  "engine-profile": { aircraftManufacturer: "multi", engineManufacturer: "multi", engineVariant: "multi", engineFamily: "multi", aircraftType: "multi" },
  "jurisdiction-risk": { country: "multi", jurisdictionType: "multi", region: "multi", repossessionCategory: "multi", lawCompliance: "multi" },
  "airline-financials": { airline: "single", financialYear: "single", period: "single", metricIds: "single" },
} as const satisfies Record<string, Record<string, Kind>>;

export type ModuleSlug = keyof typeof MODULE_KEYS;
export type ModuleSelection<M extends ModuleSlug> = { [K in keyof (typeof MODULE_KEYS)[M]]?: (typeof MODULE_KEYS)[M][K] extends "multi" ? string[] : string };

export const MODULE_LABELS: Record<ModuleSlug, string> = {
  summary: "Summary", deliveries: "Deliveries", orders: "Orders", "aircraft-utilisation": "Aircraft Utilisation",
  "aviation-finance": "Aviation Finance", "market-value-lease-rates": "Market Value / Lease Rates", emissions: "Emissions",
  "aircraft-registry": "Aircraft Registry", "engine-profile": "Engine Profile", "jurisdiction-risk": "Jurisdiction Risk", "airline-financials": "Airline Financials",
};

export const isModule = (s: unknown): s is ModuleSlug => typeof s === "string" && Object.prototype.hasOwnProperty.call(MODULE_KEYS, s);
export function moduleFromPath(path: string): ModuleSlug | null {
  const p = path.split(/[?#]/)[0].replace(/\/+$/, "");
  if (p === "" || p === "/summary") return "summary";
  const s = p.replace(/^\//, "");
  return isModule(s) ? s : null;
}
export const pathForModule = (m: ModuleSlug) => (m === "summary" ? "/" : `/${m}`);

/** Allowlist + type-coerce raw filters for a module. Unknown keys are dropped. Returns null if not an object. */
export function sanitizeFilters<M extends ModuleSlug>(module: M, raw: unknown): ModuleSelection<M> | null {
  let v = raw;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { return null; } }
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const obj = v as Record<string, unknown>;
  const spec = MODULE_KEYS[module] as Record<string, Kind>;
  const out: Record<string, FilterValue> = {};
  const str = (x: unknown) => (typeof x === "string" && x.length <= 512 ? x : typeof x === "number" && Number.isFinite(x) ? String(x) : null);
  for (const [k, kind] of Object.entries(spec)) {
    if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
    const x = obj[k];
    if (kind === "multi") {
      if (Array.isArray(x)) out[k] = x.slice(0, 300).map(str).filter((s): s is string => s !== null);
      else { const s = str(x); if (s !== null) out[k] = s === "" ? [] : [s]; }
    } else if (k === "metricIds" && Array.isArray(x)) {
      out[k] = x.map(str).filter((s): s is string => s !== null).join(",");
    } else {
      const s = Array.isArray(x) ? (x.length === 1 ? str(x[0]) : x.length === 0 ? "" : null) : str(x);
      if (s !== null) out[k] = s;
    }
  }
  return out as ModuleSelection<M>;
}

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const isoOr = (v: string | undefined, d: string) => (v && ISO_DATE.test(v) ? v : d);

export type ApplyResult = { ok: boolean; module: ModuleSlug; filters: FilterMap; message: string };
export type LiveScope = { module: ModuleSlug; filters: FilterMap; ready: boolean };

export type Reg = { apply: (sel: FilterMap) => boolean | void; ready: boolean; json: string };
type Pending = { id: string; module: ModuleSlug; filters: FilterMap; resolve: (r: ApplyResult) => void; timer: ReturnType<typeof setTimeout>; source: "action" | "url" };

const URL_KEY = "assistantFilters";
function browserWriteUrl(filters: FilterMap | null) {
  try {
    const u = new URL(window.location.href);
    const next = filters ? JSON.stringify(filters) : null;
    if ((u.searchParams.get(URL_KEY) ?? null) === next) return;
    if (next) u.searchParams.set(URL_KEY, next); else u.searchParams.delete(URL_KEY);
    window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
  } catch { /* ignore */ }
}
export const describeFilters = (f: FilterMap) =>
  Object.entries(f).filter(([, v]) => (Array.isArray(v) ? v.length > 0 : v !== "")).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(" | ") : v}`);

export interface ControllerDeps {
  /** Client-side navigation (Wouter). */
  navigate: (path: string) => void;
  /** Canonical slug of the currently routed module. */
  currentModule: () => ModuleSlug | null;
  /** Reflect applied selections in the URL (null removes). Defaults to a no-op. */
  writeUrl?: (filters: FilterMap | null) => void;
  /** ms before an unflushed pending action fails. Default 20000. */
  pendingTimeoutMs?: number;
  /** ms after a successful apply before the live snapshot is captured for URL tracking. Default 250. */
  settleMs?: number;
}

/** Framework-free controller core. Unit-testable with fake handlers and navigate callback. */
export class AssistantController {
  private regs = new Map<ModuleSlug, Reg>();
  private pending: Pending | null = null;
  private urlSnap: { module: ModuleSlug; json: string | null } | null = null;
  private live: LiveScope | null = null;
  private listeners = new Set<() => void>();
  version = 0;
  constructor(private deps: ControllerDeps) {}

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit() { this.version++; this.listeners.forEach((l) => l()); }
  getLive(): LiveScope | null { return this.live; }
  getPending(): { module: ModuleSlug; filters: FilterMap } | null { return this.pending ? { module: this.pending.module, filters: this.pending.filters } : null; }

  register(m: ModuleSlug, reg: Reg) {
    const prev = this.regs.get(m);
    this.regs.set(m, reg);
    const snap = this.urlSnap;
    if (snap && snap.module === m && snap.json !== null && snap.json !== reg.json) { this.urlSnap = null; this.deps.writeUrl?.(null); }
    if (!prev || prev.json !== reg.json || prev.ready !== reg.ready) {
      this.live = { module: m, filters: reg.ready ? (JSON.parse(reg.json) as FilterMap) : {}, ready: reg.ready };
      this.emit();
    }
    if (reg.ready) this.flush(m);
  }
  unregister(m: ModuleSlug) {
    this.regs.delete(m);
    if (this.urlSnap?.module === m) this.urlSnap = null;
    if (this.live?.module === m) { this.live = null; this.emit(); }
  }

  private run(m: ModuleSlug, filters: FilterMap): boolean {
    const reg = this.regs.get(m);
    if (!reg || !reg.ready) return false;
    try { return reg.apply(filters) !== false; } catch { return false; }
  }
  private applied(m: ModuleSlug, filters: FilterMap) {
    this.deps.writeUrl?.(filters);
    this.urlSnap = { module: m, json: null };
    setTimeout(() => { if (this.urlSnap?.module === m && this.urlSnap.json === null) this.urlSnap.json = this.regs.get(m)?.json ?? ""; }, this.deps.settleMs ?? 250);
  }
  private result(ok: boolean, m: ModuleSlug, filters: FilterMap): ApplyResult {
    return { ok, module: m, filters, message: ok ? `Updated ${MODULE_LABELS[m]}` : `${MODULE_LABELS[m]} could not apply these selections` };
  }

  /** Applies a pending action for module m once it is registered and ready. Exactly once. */
  flush(m: ModuleSlug) {
    const p = this.pending;
    if (!p || p.module !== m) return;
    const reg = this.regs.get(m);
    if (!reg || !reg.ready) return;
    this.pending = null;
    clearTimeout(p.timer);
    const ok = this.run(m, p.filters);
    if (ok) this.applied(m, p.filters);
    p.resolve(this.result(ok, m, p.filters));
  }

  private queue(m: ModuleSlug, filters: FilterMap, source: Pending["source"]) {
    return new Promise<ApplyResult>((resolve) => {
      const old = this.pending;
      if (old) { clearTimeout(old.timer); old.resolve({ ok: false, module: old.module, filters: old.filters, message: "Superseded by a newer update" }); }
      const id = Math.random().toString(36).slice(2);
      const timer = setTimeout(() => {
        if (this.pending?.id === id) { this.pending = null; resolve({ ok: false, module: m, filters, message: `${MODULE_LABELS[m]} did not finish loading, so nothing was applied` }); }
      }, this.deps.pendingTimeoutMs ?? 20000);
      this.pending = { id, module: m, filters, resolve, timer, source };
    });
  }

  /** Hydrate from a shared/reloaded URL (assistantFilters). Ignored if an action is already pending. */
  queueUrl(m: ModuleSlug, raw: unknown) {
    if (this.pending) return;
    const f = sanitizeFilters(m, raw);
    if (f && Object.keys(f).length) { void this.queue(m, f as FilterMap, "url"); this.flush(m); }
  }

  /** Apply a server-validated action. Same module: direct native state set. Other module: navigate + pending. */
  async applyAction(module: string, raw: unknown): Promise<ApplyResult> {
    if (!isModule(module)) return { ok: false, module: "summary", filters: {}, message: `Unknown module "${module}"` };
    const filters = sanitizeFilters(module, raw) as FilterMap | null;
    if (!filters) return { ok: false, module, filters: {}, message: "The suggested selections were not valid" };
    const reg = this.regs.get(module);
    if (reg && reg.ready && this.deps.currentModule() === module) {
      const ok = this.run(module, filters);
      if (ok) this.applied(module, filters);
      return this.result(ok, module, filters);
    }
    const p = this.queue(module, filters, "action");
    if (this.deps.currentModule() !== module) this.deps.navigate(pathForModule(module));
    this.flush(module);
    return p;
  }
}

const C = createContext<AssistantController | null>(null);
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function AssistantControllerProvider({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const locRef = useRef(location);
  locRef.current = location;
  const navRef = useRef(navigate);
  navRef.current = navigate;
  const [ctl] = useState(() => new AssistantController({
    navigate: (p) => { locRef.current = p; navRef.current(p); },
    currentModule: () => moduleFromPath(locRef.current || (typeof window !== "undefined" ? window.location.pathname.slice(BASE.length) || "/" : "/")),
    writeUrl: browserWriteUrl,
  }));
  return <C.Provider value={ctl}>{children}</C.Provider>;
}

function useCtl() {
  const c = useContext(C);
  if (!c) throw new Error("Assistant controller provider missing");
  return c;
}

export function useAssistantController() {
  const c = useCtl();
  const [, force] = useState(0);
  useEffect(() => c.subscribe(() => force((n) => n + 1)), [c]);
  const applyAction = useCallback((m: string, f: unknown) => c.applyAction(m, f), [c]);
  const getLive = useCallback(() => c.getLive(), [c]);
  return { live: c.getLive(), getLive, applyAction, controller: c };
}

/**
 * Registers a page's live native filters and apply handler.
 * - `filters`: every allowlisted key with its current native value ("" / [] when All or blank).
 * - `ready`: true once async defaults/options are loaded; pending actions wait for it.
 * - `apply(sel)`: replace the full scope; keys omitted from `sel` reset to the page's original defaults.
 *   Return false if it cannot be applied.
 */
export function useAssistantModule<M extends ModuleSlug>(module: M, opts: { ready: boolean; filters: { [K in keyof (typeof MODULE_KEYS)[M]]: FilterValue }; apply: (sel: ModuleSelection<M>) => boolean | void }) {
  const c = useCtl();
  const applyRef = useRef(opts.apply);
  applyRef.current = opts.apply;
  const json = JSON.stringify(opts.filters);
  const ready = opts.ready;
  useEffect(() => { c.register(module, { ready, json, apply: (sel) => applyRef.current(sel as ModuleSelection<M>) }); }, [c, module, ready, json]);
  useEffect(() => () => c.unregister(module), [c, module]);
  const urlRead = useRef(false);
  useEffect(() => {
    if (urlRead.current) return;
    urlRead.current = true;
    try { const raw = new URLSearchParams(window.location.search).get("assistantFilters"); if (raw) c.queueUrl(module, raw); } catch { /* ignore */ }
  }, [c, module]);
}
