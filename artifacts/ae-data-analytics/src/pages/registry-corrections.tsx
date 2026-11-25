import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { getGetRegistryCorrectionCasesQueryKey, reviewRegistryCorrection, useGetRegistryCorrectionCases } from "@workspace/api-client-react";
import type { GetRegistryCorrectionCasesStatus, RegistryCorrectionCase } from "@workspace/api-client-react";
import { AlertTriangle, ArrowLeft, Check, CheckCheck, Clock3, Loader2, X } from "lucide-react";

const STATUS_OPTIONS: { value: GetRegistryCorrectionCasesStatus | "all"; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "all", label: "All cases" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];
const FIELD_LABELS: Record<string, string> = {
  manufacturer: "Aircraft manufacturer",
  model: "Model",
  aircraftType: "Aircraft type / variant",
  registration: "Registration",
  msn: "MSN",
  operator: "Operator",
  owner: "Owner",
  firstFlight: "First flight date",
  year: "Manufacture year",
  engineManufacturer: "Engine manufacturer",
  engineFamily: "Engine family",
  engineModel: "Engine model",
};
const display = (value: unknown) => value == null || value === "" ? "—" : String(value);
const date = (value: string) => new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
const errorText = (error: unknown) => {
  const value = error as { data?: { error?: unknown }; message?: unknown };
  return typeof value?.data?.error === "string" ? value.data.error :
    typeof value?.message === "string" ? value.message : "The case could not be updated. Please try again.";
};

export default function RegistryCorrectionsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<GetRegistryCorrectionCasesStatus | "all">("pending");
  const params = status === "all" ? undefined : { status };
  const query = useGetRegistryCorrectionCases(params, {
    query: { queryKey: getGetRegistryCorrectionCasesQueryKey(params), staleTime: 0, refetchOnWindowFocus: true },
  });
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const decide = async (item: RegistryCorrectionCase, decision: "approve" | "reject") => {
    if (busyId !== null) return;
    setBusyId(item.id);
    setError("");
    setMessage("");
    try {
      await reviewRegistryCorrection(item.id, {
        decision,
        ...(notes[item.id]?.trim() ? { reviewNote: notes[item.id].trim() } : {}),
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: getGetRegistryCorrectionCasesQueryKey() }),
        qc.invalidateQueries({ queryKey: ["/api/registry/records"] }),
      ]);
      setMessage(decision === "approve"
        ? "Correction approved. The Registry entries table now uses the accepted values."
        : "Suggestion rejected. The Registry entries table was not changed.");
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="min-h-[calc(100dvh-56px)] bg-background p-3 text-foreground sm:p-5">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="mr-auto">
            <Link href="/aircraft-registry" className="mb-2 inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-primary">
              <ArrowLeft className="h-3.5 w-3.5" /> Aircraft Registry
            </Link>
            <h1 className="text-xl font-semibold tracking-tight">Registry correction review</h1>
            <p className="mt-1 max-w-2xl text-[12px] text-muted-foreground">Review team suggestions before they affect the Registry entries table. Approved values are stored as private corrections over the imported source snapshot.</p>
          </div>
          <div className="rounded border border-primary/30 bg-primary/10 px-3 py-2 text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">{status === "pending" ? "Pending cases shown" : "Cases shown"}</div>
            <div data-testid="text-pending-count" className="text-lg font-semibold tabular-nums">{query.data?.cases.length ?? "—"}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1 border-b border-border" role="tablist" aria-label="Correction case status">
          {STATUS_OPTIONS.map(option => (
            <button key={option.value} role="tab" aria-selected={status === option.value} onClick={() => { setStatus(option.value); setError(""); setMessage(""); }}
              className={`border-b-2 px-3 py-2 text-[12px] font-medium transition-colors ${status === option.value ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {option.label}
            </button>
          ))}
        </div>

        {error && <div role="alert" data-testid="status-review-error" className="flex items-center gap-2 rounded border border-destructive/40 bg-destructive/10 p-3 text-[12px]"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}
        {message && <div role="status" data-testid="status-review-success" className="flex items-center gap-2 rounded border border-primary/30 bg-primary/10 p-3 text-[12px] text-primary"><Check className="h-4 w-4 shrink-0" />{message}</div>}
        {query.isError ? (
          <div className="panel rounded border border-border bg-card p-8 text-center">
            <AlertTriangle className="mx-auto mb-2 h-5 w-5 text-destructive" />
            <div className="text-sm font-semibold">Correction cases could not be loaded</div>
            <button onClick={() => void query.refetch()} className="mt-3 rounded bg-primary px-3 py-1.5 text-[12px] text-primary-foreground">Try again</button>
          </div>
        ) : query.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading cases…</div>
        ) : !query.data?.cases.length ? (
          <div className="panel rounded border border-dashed border-border bg-card px-6 py-14 text-center">
            <CheckCheck className="mx-auto mb-2 h-6 w-6 text-primary" />
            <div className="text-[14px] font-semibold">No {status === "all" ? "" : status + " "}cases found</div>
            <p className="mt-1 text-[12px] text-muted-foreground">New suggestions from the Registry table will appear here for internal review.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {query.data.cases.map(item => <CaseCard
              key={item.id}
              item={item}
              note={notes[item.id] ?? ""}
              onNoteChange={note => setNotes(current => ({ ...current, [item.id]: note }))}
              busy={busyId === item.id}
              anyBusy={busyId !== null}
              onApprove={() => void decide(item, "approve")}
              onReject={() => void decide(item, "reject")}
            />)}
            {query.data.cases.length >= 200 && <p className="text-center text-[11px] text-muted-foreground">Showing the latest 200 cases. Filter by status to narrow the list.</p>}
          </div>
        )}
      </div>
    </main>
  );
}

function CaseCard({ item, note, onNoteChange, busy, anyBusy, onApprove, onReject }: {
  item: RegistryCorrectionCase;
  note: string;
  onNoteChange: (value: string) => void;
  busy: boolean;
  anyBusy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const changes = Object.entries(item.proposedValues);
  return (
    <article className="panel overflow-hidden rounded border border-border bg-card" data-testid={`correction-case-${item.id}`}>
      <header className="flex flex-wrap items-start gap-3 border-b border-border bg-card/70 px-3 py-2.5">
        <div className="mr-auto min-w-0">
          <h2 className="truncate text-[13px] font-semibold">
            {display(item.aircraft.manufacturer)} {display(item.aircraft.model)}
            {item.aircraft.registration ? ` · ${item.aircraft.registration}` : ""}
            {item.aircraft.msn ? ` · MSN ${item.aircraft.msn}` : ""}
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Case #{item.id} · Submitted {date(item.submittedAt)}</p>
        </div>
        <span className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${item.status === "pending" ? "bg-amber-500/15 text-amber-300" : item.status === "approved" ? "bg-primary/15 text-primary" : "bg-foreground/10 text-muted-foreground"}`}>
          {item.status === "pending" ? <Clock3 className="h-3 w-3" /> : item.status === "approved" ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}{item.status}
        </span>
      </header>
      <div className="space-y-3 p-3">
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full min-w-[480px] text-left text-[11px]">
            <thead className="bg-foreground/5 text-muted-foreground">
              <tr><th className="px-2 py-1.5 font-medium">Field</th><th className="px-2 py-1.5 font-medium">Current value</th><th className="px-2 py-1.5 font-medium">Suggested value</th></tr>
            </thead>
            <tbody>
              {changes.map(([field, value]) => <tr key={field} className="border-t border-border">
                <th className="px-2 py-1.5 font-medium">{FIELD_LABELS[field] ?? field}</th>
                <td className="px-2 py-1.5 text-muted-foreground">{display(item.originalValues[field])}</td>
                <td className="px-2 py-1.5 font-semibold text-primary">{display(value)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <div className="rounded border border-border bg-background/40 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Submitter’s explanation</div>
          <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed">{item.rationale}</p>
        </div>
        {item.status !== "pending" && <div className="text-[11px] text-muted-foreground">Reviewed {item.reviewedAt ? date(item.reviewedAt) : ""}{item.reviewNote ? ` · ${item.reviewNote}` : ""}</div>}
        {item.status === "pending" && <>
          <label className="block space-y-1 text-[11px] font-medium">
            <span>Internal review note <span className="font-normal text-muted-foreground">(optional)</span></span>
            <input value={note} maxLength={2000} onChange={event => onNoteChange(event.target.value)} placeholder="Add a short note for the case record…" className="h-8 w-full rounded border border-input bg-background px-2 text-[12px] font-normal focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <button data-testid={`button-reject-${item.id}`} onClick={onReject} disabled={anyBusy} className="inline-flex items-center gap-1 rounded border border-border px-3 py-1.5 text-[11px] font-semibold hover:bg-accent disabled:opacity-50">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Reject
            </button>
            <button data-testid={`button-approve-${item.id}`} onClick={onApprove} disabled={anyBusy} className="inline-flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Approve and update table
            </button>
          </div>
        </>}
      </div>
    </article>
  );
}
