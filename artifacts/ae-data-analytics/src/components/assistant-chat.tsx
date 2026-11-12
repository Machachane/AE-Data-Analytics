import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useLocation } from "wouter";
import { useAskAssistant, type AssistantEvidence, type AssistantAction } from "@workspace/api-client-react";
import { useAssistantController, moduleFromPath, isModule, MODULE_LABELS, describeFilters, type ModuleSlug } from "@/lib/assistant-controller";
import { AlertTriangle, Check, ChevronRight, Database, SlidersHorizontal, ExternalLink, Loader2, MessageSquareText, RotateCcw, Send, Trash2, X } from "lucide-react";

type ApplyState = { state: "applying" | "applied" | "failed" | "stale"; text: string };
type Msg = { id: string; role: "user" | "assistant"; content: string; at: string; notice?: string; evidence?: AssistantEvidence[]; error?: boolean; action?: AssistantAction; applied?: ApplyState };

const KEY = "ae-assistant-chat-v1";
const OPEN_KEY = "ae-assistant-open";
const MAX_LEN = 12000;
const MAX_HISTORY = 12;
const SUGGESTIONS = [
  "Which manufacturers delivered the most aircraft in the latest year of the snapshot?",
  "How many Boeing aircraft are recorded in the registry?",
  "Which jurisdictions have the lowest repossession overall scores?",
];

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const fmtTime = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? iso : d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); };

function load(): Msg[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    const v: unknown = raw ? JSON.parse(raw) : [];
    // Actions are never replayed on reload: in-flight or stale states become a manual Apply control.
    return Array.isArray(v) ? (v as Msg[]).filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => (m.applied && m.applied.state === "applying" ? { ...m, applied: { state: "stale", text: "Not applied. Use Apply to dashboard." } } : m)) : [];
  } catch { return []; }
}

const MAX_TOTAL = 36000;

/** Most recent turns (max 12) whose combined content fits within MAX_TOTAL; the newest user turn is always kept. */
export function budgetHistory(all: { role: "user" | "assistant"; content: string }[]) {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  let total = 0;
  for (let i = all.length - 1; i >= 0 && out.length < MAX_HISTORY; i--) {
    const c = all[i].content.slice(0, MAX_LEN);
    if (total + c.length > MAX_TOTAL) {
      if (out.length === 0) { out.unshift({ role: all[i].role, content: c.slice(0, MAX_TOTAL) }); }
      break;
    }
    total += c.length;
    out.unshift({ role: all[i].role, content: c });
  }
  // The API expects the conversation to start from a user turn.
  while (out.length > 1 && out[0].role !== "user") out.shift();
  return out;
}

const pick = (o: unknown, k: string): string | null => {
  if (!o || typeof o !== "object") return null;
  const v = (o as Record<string, unknown>)[k];
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

/** Extracts a readable message from the generated client's ApiError (status, data body, message) or network errors. */
function errorText(e: unknown): string {
  if (e && typeof e === "object") {
    const status = typeof (e as { status?: unknown }).status === "number" ? (e as { status: number }).status : null;
    const data = (e as { data?: unknown }).data;
    const body = typeof data === "string" && data.trim() ? data.trim().slice(0, 400)
      : pick(data, "detail") ?? pick(data, "message") ?? pick(data, "error_description") ?? pick(data, "error") ?? pick(data, "title");
    if (status === 429) return body ?? "Too many requests. Wait a moment and try again.";
    if (body) return status ? `${body} (HTTP ${status})` : body;
    const msg = pick(e, "message");
    if (msg) return msg === "Failed to fetch" ? "Network error: the assistant service could not be reached." : msg;
    if (status) return `The assistant request failed (HTTP ${status}).`;
  }
  return "The assistant could not answer. Check your connection and try again.";
}

function prettyResult(s: string): string {
  try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
}
function prettyFilters(s: string): [string, string][] {
  try {
    const v: unknown = JSON.parse(s);
    if (v && typeof v === "object" && !Array.isArray(v)) return Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, typeof x === "string" ? x : JSON.stringify(x)]);
  } catch { /* plain text */ }
  return s ? [["filters", s]] : [];
}
function safeHref(href: string): string | null {
  if (!href.startsWith("/") || href.startsWith("//")) return null;
  return `${import.meta.env.BASE_URL.replace(/\/$/, "")}${href}`;
}

/** Derives a target module + native filters from a server evidence href (falls back to ev.filters). */
function evidenceTarget(ev: AssistantEvidence): { module: ModuleSlug; filters: string } | null {
  if (!ev.href || !ev.href.startsWith("/") || ev.href.startsWith("//")) return null;
  const [path, query = ""] = ev.href.split("?");
  const m = moduleFromPath(path);
  if (!m) return null;
  const qf = new URLSearchParams(query).get("assistantFilters");
  return { module: m, filters: qf ?? (ev.filters && ev.filters.trim().startsWith("{") ? ev.filters : "{}") };
}
type ApplyFn = (module: string, filters: string) => Promise<{ ok: boolean; message: string }>;

function Evidence({ ev, idx, onApply }: { ev: AssistantEvidence; idx: number; onApply: ApplyFn }) {
  const [open, setOpen] = useState(false);
  const [st, setSt] = useState<ApplyState | null>(null);
  const target = evidenceTarget(ev);
  const doApply = async () => {
    if (!target) return;
    setSt({ state: "applying", text: "Applying..." });
    const r = await onApply(target.module, target.filters);
    setSt({ state: r.ok ? "applied" : "failed", text: r.message });
  };
  const filters = prettyFilters(ev.filters);
  const href = safeHref(ev.href);
  return (
    <div className="rounded-[4px] border border-border bg-background/60" data-testid={`evidence-${ev.id}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid={`button-evidence-${ev.id}`}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-[11.5px] hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
        <ChevronRight className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
        <span className="font-mono text-[10.5px] text-muted-foreground">[{ev.id || `S${idx + 1}`}]</span>
        <span className="min-w-0 flex-1 truncate font-medium">{ev.module}</span>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground tnum">{fmtTime(ev.queriedAt)}</span>
      </button>
      {open && (
        <div className="space-y-1.5 border-t border-border px-2 py-1.5 text-[11px]">
          <div className="text-muted-foreground"><span className="font-medium text-foreground/80">Source:</span> {ev.source}</div>
          <div className="text-muted-foreground"><span className="font-medium text-foreground/80">Queried:</span> {fmtTime(ev.queriedAt)}</div>
          <div>
            <div className="mb-0.5 font-medium text-foreground/80">Filters</div>
            {filters.length ? (
              <div className="flex flex-wrap gap-1">{filters.map(([k, v]) => <span key={k} className="rounded-[3px] bg-primary/12 px-1.5 py-0.5 font-mono text-[10.5px] text-foreground/90">{k}: {v}</span>)}</div>
            ) : <span className="text-muted-foreground">None (full snapshot)</span>}
          </div>
          <div>
            <div className="mb-0.5 font-medium text-foreground/80">Result</div>
            <pre className="thin-scroll max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-[3px] bg-muted p-1.5 font-mono text-[10.5px] leading-snug">{prettyResult(ev.result)}</pre>
          </div>
          {target && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" onClick={() => void doApply()} disabled={st?.state === "applying"} data-testid={`button-apply-evidence-${ev.id}`}
                className="inline-flex items-center gap-1 rounded-[3px] bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <SlidersHorizontal className="h-3 w-3" /> Apply to dashboard
              </button>
              {st && <span data-testid={`status-apply-evidence-${ev.id}`} className={`text-[10.5px] ${st.state === "failed" ? "text-destructive" : "text-muted-foreground"}`}>{st.text}</span>}
            </div>
          )}
          {href && (
            <a href={href} data-testid={`link-evidence-${ev.id}`} className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
              Open as new page load <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export function AssistantChat() {
  const [location] = useLocation();
  const slug = moduleFromPath(location);
  const page = slug ? MODULE_LABELS[slug] : location.slice(0, 100);
  const { live, getLive, applyAction } = useAssistantController();
  const scope = live && slug && live.module === slug && live.ready ? live : null;
  const scopeChips = scope ? describeFilters(scope.filters) : [];
  const locRef = useRef(location);
  locRef.current = location;
  const describeAction = (a: { module: string; filters: string }) => {
    let f: Record<string, string | string[]> = {};
    try { const v: unknown = JSON.parse(a.filters); if (v && typeof v === "object" && !Array.isArray(v)) f = v as Record<string, string | string[]>; } catch { /* ignore */ }
    const chips = describeFilters(f);
    return `${isModule(a.module) ? MODULE_LABELS[a.module] : a.module}${chips.length ? ` with ${chips.join(", ")}` : " (default scope)"}`;
  };
  const runAction: ApplyFn = async (module, filters) => {
    const r = await applyAction(module, filters);
    return { ok: r.ok, message: r.ok ? `Updated ${describeAction({ module, filters })}` : `Not applied: ${r.message}.` };
  };
  const setApplied = (id: string, applied: ApplyState) => setMsgs((cur) => cur.map((m) => (m.id === id ? { ...m, applied } : m)));
  const applyMsgAction = async (id: string, action: AssistantAction) => {
    setApplied(id, { state: "applying", text: "Applying..." });
    const r = await runAction(action.module, action.filters);
    setApplied(id, { state: r.ok ? "applied" : "failed", text: r.message });
  };
  const [open, setOpen] = useState(() => { try { return new URLSearchParams(window.location.search).get("assistant") === "open" || sessionStorage.getItem(OPEN_KEY) === "1"; } catch { return false; } });
  const [msgs, setMsgs] = useState<Msg[]>(load);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [lastQ, setLastQ] = useState<string | null>(null);
  const ask = useAskAssistant();
  const busyRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(msgs)); } catch { /* storage full */ } }, [msgs]);
  useEffect(() => { try { sessionStorage.setItem(OPEN_KEY, open ? "1" : "0"); } catch { /* ignore */ } if (open) setTimeout(() => inputRef.current?.focus(), 30); }, [open]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [msgs, ask.isPending, open]);

  const close = () => { setOpen(false); setTimeout(() => launcherRef.current?.focus(), 0); };

  const send = async (text: string, base: Msg[]) => {
    const q = text.trim();
    if (!q || busyRef.current) return;
    if (q.length > MAX_LEN) { setErr(`Question is too long (${q.length.toLocaleString()} of ${MAX_LEN.toLocaleString()} characters).`); return; }
    const cur = getLive();
    const sentSlug = moduleFromPath(locRef.current);
    if (!sentSlug || !cur || cur.module !== sentSlug || !cur.ready) {
      setErr("Please wait for this module's data and filters to finish loading, then ask again."); return;
    }
    const sentScope = JSON.stringify(cur.filters);
    if (sentScope.length > 6000) {
      setErr("There are too many selections to send accurately. Narrow the current filters before asking."); return;
    }
    busyRef.current = true;
    setErr(null);
    const user: Msg = { id: uid(), role: "user", content: q, at: new Date().toISOString() };
    const next = [...base, user];
    setMsgs(next);
    setDraft("");
    setLastQ(q);
    const history = budgetHistory(next.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })));
    // Send the canonical CURRENT module slug and live native selections.
    try {
      const res = await ask.mutateAsync({ data: { messages: history, page: sentSlug, currentFilters: sentScope } });
      const id = uid();
      const action = res.action && res.action.module && typeof res.action.filters === "string" ? res.action : undefined;
      const now = getLive();
      const unchanged = moduleFromPath(locRef.current) === sentSlug && (now && now.module === sentSlug && now.ready ? JSON.stringify(now.filters) : undefined) === sentScope;
      const applied: ApplyState | undefined = action ? (unchanged ? { state: "applying", text: "Applying..." } : { state: "stale", text: "You changed page or filters while this was running, so it was not applied automatically." }) : undefined;
      setMsgs((c) => [...c, { id, role: "assistant", content: res.answer || "No answer was returned.", at: new Date().toISOString(), notice: res.notice, evidence: res.evidence ?? [], action, applied }]);
      if (action && unchanged) {
        const r = await runAction(action.module, action.filters);
        setApplied(id, { state: r.ok ? "applied" : "failed", text: r.message });
      }
      setLastQ(null);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      busyRef.current = false;
    }
  };

  const retry = () => {
    if (!lastQ) return;
    const base = msgs.length && msgs[msgs.length - 1].role === "user" && msgs[msgs.length - 1].content === lastQ ? msgs.slice(0, -1) : msgs;
    void send(lastQ, base);
  };
  const submit = (e: FormEvent) => { e.preventDefault(); void send(draft, msgs); };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(draft, msgs); }
    if (e.key === "Escape") close();
  };
  const clear = () => { if (ask.isPending) return; if (msgs.length && !window.confirm("Clear this conversation? It is only stored in this browser tab.")) return; setMsgs([]); setErr(null); setLastQ(null); };

  const busy = ask.isPending;
  const over = draft.length > MAX_LEN;

  return (
    <>
      {!open && (
        <button ref={launcherRef} type="button" onClick={() => setOpen(true)} data-testid="button-open-assistant" aria-label="Open AE+ Assistant"
          className="fixed bottom-4 right-4 z-[900] flex h-10 items-center gap-2 rounded-full border border-primary-border bg-primary pl-3 pr-4 text-[12.5px] font-semibold text-primary-foreground shadow-[0_6px_20px_-6px_hsl(var(--primary)/0.6)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 print:hidden">
          <MessageSquareText className="h-4 w-4" /> AE+ Assistant
          {msgs.length > 0 && <span className="rounded-full bg-primary-foreground/20 px-1.5 font-mono text-[10px] tnum">{msgs.length}</span>}
        </button>
      )}
      {open && (
        <section role="dialog" aria-modal="false" aria-labelledby="assistant-title" data-testid="panel-assistant"
          onKeyDown={(e) => { if (e.key === "Escape") close(); }}
          className="fixed inset-0 z-[900] flex flex-col bg-card text-card-foreground animate-in fade-in slide-in-from-bottom-3 duration-200 sm:inset-auto sm:bottom-4 sm:right-4 sm:h-[min(680px,calc(100dvh-2rem))] sm:w-[420px] sm:rounded-[8px] sm:border sm:border-card-border sm:shadow-[0_18px_50px_-12px_rgb(0_0_0/0.45)] print:hidden">
          <header className="flex items-center gap-2 border-b border-border px-3 py-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-[4px] bg-primary/15 text-primary"><MessageSquareText className="h-4 w-4" /></div>
            <div className="min-w-0 flex-1">
              <h2 id="assistant-title" className="text-[13px] font-semibold leading-tight">AE+ Assistant</h2>
              <p className="truncate text-[10.5px] text-muted-foreground" data-testid="text-assistant-page">Context: <span className="font-medium text-foreground/85">{page}</span>{slug && <span className="font-mono"> ({slug})</span>}</p>
            </div>
            <button type="button" onClick={clear} disabled={busy || msgs.length === 0} data-testid="button-clear-assistant" aria-label="Clear conversation" title="Clear conversation"
              className="flex h-7 w-7 items-center justify-center rounded-[4px] text-muted-foreground hover:bg-foreground/10 hover:text-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"><Trash2 className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={close} data-testid="button-close-assistant" aria-label="Close assistant"
              className="flex h-7 w-7 items-center justify-center rounded-[4px] text-muted-foreground hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"><X className="h-4 w-4" /></button>
          </header>

          <div role="note" data-testid="text-assistant-scope" className="space-y-1 border-b border-border bg-primary/[0.06] px-3 py-2 text-[11px] leading-snug">
            <div className="flex items-center gap-1.5 font-semibold text-foreground/90"><SlidersHorizontal className="h-3 w-3 text-primary" /> Current filter scope
              <span className="ml-auto font-normal text-muted-foreground">{scope ? "sent with each question" : slug ? "loading..." : "no module"}</span></div>
            {scope ? (scopeChips.length ? (
              <div className="thin-scroll flex max-h-[52px] flex-wrap gap-1 overflow-y-auto" data-testid="list-assistant-scope">
                {scopeChips.map((c) => <span key={c} className="rounded-[3px] bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] text-foreground/90">{c}</span>)}
              </div>
            ) : <div className="text-muted-foreground" data-testid="text-assistant-scope-default">All / page defaults (no filters selected)</div>) : null}
            <p className="flex gap-1.5 text-muted-foreground"><Database className="mt-[1px] h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>The assistant sees these selections and can update the dashboard for you. Answers use the read-only imported Power BI snapshot, not live data.</span></p>
          </div>

          <div ref={listRef} className="thin-scroll flex-1 space-y-3 overflow-y-auto px-3 py-3" aria-live="polite" aria-busy={busy} data-testid="list-assistant-messages">
            {msgs.length === 0 && (
              <div className="space-y-2.5 pt-2">
                <p className="text-[12px] text-muted-foreground">Ask about deliveries, orders, utilisation, finance, valuations, emissions, registry, engines, jurisdictions or airline financials. Each answer lists the queries it ran so you can check them.</p>
                <div className="space-y-1.5">
                  {SUGGESTIONS.map((s, i) => (
                    <button key={s} type="button" onClick={() => void send(s, msgs)} disabled={busy} data-testid={`button-suggestion-${i}`}
                      className="block w-full rounded-[4px] border border-border px-2.5 py-1.5 text-left text-[11.5px] hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50">{s}</button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m) => m.role === "user" ? (
              <div key={m.id} className="flex flex-col items-end" data-testid={`message-user-${m.id}`}>
                <div className="max-w-[88%] whitespace-pre-wrap break-words rounded-[6px] rounded-br-[2px] bg-primary px-2.5 py-1.5 text-[12.5px] text-primary-foreground">{m.content}</div>
                <time className="mt-0.5 font-mono text-[9.5px] text-muted-foreground tnum">{fmtTime(m.at)}</time>
              </div>
            ) : (
              <div key={m.id} className="flex flex-col items-start" data-testid={`message-assistant-${m.id}`}>
                <div className="w-full rounded-[6px] rounded-bl-[2px] border border-border bg-muted/50 px-2.5 py-2">
                  <div className="whitespace-pre-wrap break-words text-[12.5px] leading-relaxed">{m.content}</div>
                  {m.action && m.applied && (
                    <div data-testid={`status-action-${m.id}`} className={`mt-2 flex items-start gap-1.5 rounded-[4px] border px-2 py-1.5 text-[11px] ${m.applied.state === "applied" ? "border-primary/40 bg-primary/10" : m.applied.state === "failed" ? "border-destructive/40 bg-destructive/10" : "border-amber-500/40 bg-amber-500/10"}`}>
                      {m.applied.state === "applying" ? <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin" /> : m.applied.state === "applied" ? <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" /> : <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <div>{m.applied.text}</div>
                        {m.applied.state !== "applied" && <div className="mt-0.5 text-muted-foreground">Suggested: {describeAction(m.action)}</div>}
                      </div>
                      {(m.applied.state === "stale" || m.applied.state === "failed") && (
                        <button type="button" onClick={() => m.action && void applyMsgAction(m.id, m.action)} data-testid={`button-apply-update-${m.id}`}
                          className="shrink-0 rounded-[3px] bg-primary px-1.5 py-0.5 text-[10.5px] font-semibold text-primary-foreground hover:opacity-90">Apply update</button>
                      )}
                    </div>
                  )}
                  {m.notice && <p className="mt-2 border-t border-border pt-1.5 text-[10.5px] italic text-muted-foreground">{m.notice}</p>}
                  {m.evidence && m.evidence.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Source evidence ({m.evidence.length})</div>
                      {m.evidence.map((ev, i) => <Evidence key={ev.id || i} ev={ev} idx={i} onApply={runAction} />)}
                    </div>
                  )}
                </div>
                <time className="mt-0.5 font-mono text-[9.5px] text-muted-foreground tnum">{fmtTime(m.at)}</time>
              </div>
            ))}
            {busy && (
              <div className="space-y-1.5 rounded-[6px] border border-border bg-muted/40 px-2.5 py-2" data-testid="status-assistant-busy">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Querying the snapshot...</div>
                <div className="h-2 w-4/5 animate-pulse rounded bg-foreground/10" />
                <div className="h-2 w-3/5 animate-pulse rounded bg-foreground/10" />
              </div>
            )}
            {err && !busy && (
              <div role="alert" className="flex items-start gap-2 rounded-[4px] border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-[11.5px]" data-testid="status-assistant-error">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                <span className="flex-1">{err}</span>
                {lastQ && <button type="button" onClick={retry} data-testid="button-retry-assistant" className="inline-flex shrink-0 items-center gap-1 rounded-[3px] border border-border bg-card px-1.5 py-0.5 text-[11px] hover:border-primary"><RotateCcw className="h-3 w-3" /> Retry</button>}
              </div>
            )}
          </div>

          <form onSubmit={submit} className="border-t border-border p-2">
            <label htmlFor="assistant-input" className="sr-only">Ask the assistant</label>
            <div className="flex items-end gap-1.5 rounded-[6px] border border-input bg-background px-2 py-1.5 focus-within:ring-1 focus-within:ring-ring">
              <textarea id="assistant-input" ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} rows={2} disabled={busy}
                placeholder="Ask about the imported data..." data-testid="input-assistant"
                className="thin-scroll max-h-32 min-h-[36px] flex-1 resize-none bg-transparent text-[12.5px] outline-none placeholder:text-muted-foreground disabled:opacity-60" />
              <button type="submit" disabled={busy || !draft.trim() || over} data-testid="button-send-assistant" aria-label="Send question"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] bg-primary text-primary-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
            <div className="mt-1 flex items-start justify-between gap-2 text-[10px] leading-snug text-muted-foreground">
              <span data-testid="text-assistant-privacy">Your questions and relevant snapshot data are sent to OpenAI to generate answers. Conversations are not saved on our server; history stays in this browser tab until cleared.</span>
              <span className={`shrink-0 font-mono tnum ${over ? "text-destructive" : ""}`}>{draft.length > 1000 ? `${draft.length}/${MAX_LEN}` : ""}</span>
            </div>
          </form>
        </section>
      )}
    </>
  );
}
