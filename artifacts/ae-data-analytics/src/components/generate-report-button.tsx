import { useEffect, useRef, useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { FeedbackInputModule, generateDashboardReport, useSubmitFeedback } from "@workspace/api-client-react";
import { MODULE_LABELS, useAssistantController } from "@/lib/assistant-controller";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function GenerateReportButton({ pageLabel }: { pageLabel: string }) {
  const { live, getLive } = useAssistantController();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [downloaded, setDownloaded] = useState(false);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [appraisalEnquiry, setAppraisalEnquiry] = useState(false);
  const [appraisalQuery, setAppraisalQuery] = useState("");
  const [enquiryPending, setEnquiryPending] = useState(false);
  const [enquiryError, setEnquiryError] = useState("");
  const [enquiryNotice, setEnquiryNotice] = useState("");
  const appraisalMutation = useSubmitFeedback();
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); }, []);
  const ready = !!live?.ready && MODULE_LABELS[live.module] === pageLabel;
  const requiresValuationAgreement = pageLabel === FeedbackInputModule["Market_Value_/_Lease_Rates"];

  const generate = async () => {
    const scope = getLive();
    if (busy || !scope?.ready || MODULE_LABELS[scope.module] !== pageLabel) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setError(""); setDownloaded(false);
    try {
      // Capture the actual native filter state at click time, not URL/chat history.
      const pdf = await generateDashboardReport({ module: scope.module, currentFilters: JSON.stringify(scope.filters) }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!(pdf instanceof Blob) || !pdf.type.includes("application/pdf")) throw new Error("The server did not return a PDF.");
      const url = URL.createObjectURL(pdf);
      const link = document.createElement("a");
      link.href = url;
      link.download = `AE-Plus-${scope.module}-report-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      setDownloaded(true);
    } catch (failure) {
      if (!controller.signal.aborted) {
        const info = failure as { status?: number; data?: { error?: string } };
        setError(info.status === 401 ? "Your session expired. Please sign in again." :
          info.data?.error ?? "Could not generate the PDF. Please try again. Your selections are unchanged.");
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      if (request.current === controller) request.current = null;
    }
  };

  const respondToAgreement = async (decision: "agree" | "disagree") => {
    if (enquiryPending || busy) return;
    setEnquiryError("");
    if (appraisalEnquiry) {
      if (!appraisalQuery.trim()) {
        setEnquiryError("Enter your appraisal question before submitting the enquiry.");
        return;
      }
      setEnquiryPending(true);
      try {
        await appraisalMutation.mutateAsync({
          data: {
            module: FeedbackInputModule["Market_Value_/_Lease_Rates"],
            message: `Specific aircraft appraisal enquiry from the Market Value / Lease Rates page. User selected ${decision === "agree" ? "Agree and download" : "Disagree"} for the general valuation terms.\n\nEnquiry: ${appraisalQuery.trim()}`,
          },
        });
        setEnquiryNotice(decision === "agree"
          ? "Your appraisal enquiry was saved within the platform."
          : "Your appraisal enquiry was saved within the platform. No PDF was downloaded.");
      } catch {
        setEnquiryError("We couldn’t save your appraisal enquiry. Please try again or untick the enquiry box.");
        return;
      } finally {
        setEnquiryPending(false);
      }
    }

    setAgreementOpen(false);
    if (decision === "agree") await generate();
  };

  return (
    <>
      <button type="button" data-testid="button-generate-ai-report" onClick={() => {
        setError("");
        setDownloaded(false);
        setEnquiryNotice("");
        setEnquiryError("");
        if (requiresValuationAgreement) {
          setAppraisalEnquiry(false);
          setAppraisalQuery("");
          setAgreementOpen(true);
        } else {
          void generate();
        }
      }} disabled={!ready || busy}
        aria-busy={busy} title="Download an AI-powered PDF summary using your current selections"
        className="flex w-full items-center justify-center gap-1.5 rounded-[3px] bg-teal-300 px-2 py-2 text-center text-[12px] font-bold text-teal-950 transition-colors hover:bg-teal-200 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-100 focus-visible:ring-offset-2 focus-visible:ring-offset-background print:hidden">
        {busy ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <FileDown className="h-3.5 w-3.5 shrink-0" />}
        {busy ? "Generating summary…" : "Generate AI Summary"}
      </button>
      {busy && <p role="status" className="text-[11px] text-muted-foreground print:hidden">Preparing the PDF from your captured selections. This may take a minute.</p>}
      {error && <p role="alert" className="text-[11px] text-destructive print:hidden">{error}</p>}
      {downloaded && !busy && <p role="status" className="text-[11px] text-muted-foreground print:hidden">PDF ready — download started.</p>}
      {enquiryNotice && <p role="status" data-testid="appraisal-enquiry-status" className="text-[11px] text-muted-foreground print:hidden">{enquiryNotice}</p>}

      {requiresValuationAgreement && (
        <Dialog open={agreementOpen} onOpenChange={(open) => { if (!enquiryPending) setAgreementOpen(open); }}>
          <DialogContent className="max-h-[88dvh] w-[calc(100%-1.5rem)] overflow-y-auto border-primary/30 sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Market value and lease rates</DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-3 text-left text-sm leading-relaxed text-foreground">
                  <p>By clicking on Agree and download below, you agree that:</p>
                  <p>The Values and Lease Rates you are about to download constitute a general opinion only without specific regard to the aircraft’s actual maintenance status or physical condition.</p>
                  <p>These opinions are effective as at today’s date only, and Airline Economics+ reserves the right, without obligation, to retrospectively update or revise its opinion.</p>
                  <p>You will use these opinions for general knowledge purposes only, and will not rely on them for any specific decision-making purposes without undertaking all necessary due diligence, including a specific appraisal.</p>
                  <p>Airline Economics+ assumes no liability for actions taken or not taken by yourself or any third parties that receive these valuations.</p>
                </div>
              </DialogDescription>
            </DialogHeader>

            <label className="flex cursor-pointer items-start gap-2 rounded-[3px] border border-border bg-background/50 p-3 text-sm">
              <input
                type="checkbox"
                data-testid="checkbox-appraisal-enquiry"
                checked={appraisalEnquiry}
                disabled={enquiryPending || busy}
                onChange={(event) => setAppraisalEnquiry(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span>
                <span className="font-semibold">Enquire about specific appraisal</span>
                <span className="mt-1 block text-xs text-muted-foreground">Selecting this opens a query field and saves your enquiry within the platform, whether or not you download the PDF.</span>
              </span>
            </label>

            {appraisalEnquiry && (
              <label htmlFor="input-appraisal-query" className="block space-y-1.5 text-sm">
                <span className="font-semibold">What would you like us to appraise?</span>
                <textarea
                  id="input-appraisal-query"
                  data-testid="input-appraisal-query"
                  value={appraisalQuery}
                  onChange={(event) => { setAppraisalQuery(event.target.value); setEnquiryError(""); }}
                  maxLength={4500}
                  rows={4}
                  placeholder="Describe the aircraft or specific appraisal you need."
                  aria-describedby="appraisal-query-help"
                  disabled={enquiryPending || busy}
                  className="w-full resize-y rounded-[3px] border border-input bg-background p-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
                />
                <span id="appraisal-query-help" className="flex justify-between gap-3 text-xs text-muted-foreground">
                  <span>Include the details needed to understand your request.</span>
                  <span>{appraisalQuery.length.toLocaleString()} / 4,500</span>
                </span>
              </label>
            )}

            {enquiryError && <p role="alert" data-testid="appraisal-enquiry-error" className="rounded-[3px] border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">{enquiryError}</p>}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" data-testid="button-market-disagree" onClick={() => void respondToAgreement("disagree")} disabled={enquiryPending || busy || (appraisalEnquiry && !appraisalQuery.trim())}
                className="rounded-[3px] border border-input px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent disabled:opacity-60">
                {enquiryPending ? "Saving enquiry…" : "Disagree"}
              </button>
              <button type="button" data-testid="button-market-agree-download" onClick={() => void respondToAgreement("agree")} disabled={!ready || enquiryPending || busy || (appraisalEnquiry && !appraisalQuery.trim())}
                className="flex items-center justify-center gap-2 rounded-[3px] bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-wait disabled:opacity-60">
                {enquiryPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                {enquiryPending ? "Saving enquiry…" : "Agree and download"}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
