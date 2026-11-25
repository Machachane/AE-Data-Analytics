import { useState, type FormEvent } from "react";
import { CheckCircle2, ClipboardList, Loader2, MessageSquarePlus } from "lucide-react";
import { FeedbackInputModule, useSubmitFeedback } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SUMMARY_COLORS } from "@/lib/summary";
import { GenerateReportButton } from "@/components/generate-report-button";

export function FeedbackButton({ defaultModule = "Summary", showReport = true }: { defaultModule?: FeedbackInputModule; showReport?: boolean }) {
  const [open, setOpen] = useState(false);
  const [module, setModule] = useState<FeedbackInputModule>(defaultModule);
  const [message, setMessage] = useState("");
  const mutation = useSubmitFeedback();
  const pending = mutation.isPending;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending || !message.trim()) return;
    mutation.mutate({ data: { module, message: message.trim() } }, {
      onSuccess: () => setMessage(""),
    });
  };

  return (
    <>
      <button
        type="button"
        data-testid="button-feedback"
        onClick={() => { mutation.reset(); setModule(defaultModule); setOpen(true); }}
        className="flex w-full items-center justify-center gap-1.5 rounded-[3px] px-2 py-2 text-center text-[12.5px] font-bold text-[#062b1d] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background print:hidden"
        style={{ background: SUMMARY_COLORS.bar }}
      >
        <MessageSquarePlus className="h-3.5 w-3.5" /> Feedback
      </button>
      {showReport && <GenerateReportButton pageLabel={defaultModule} />}
      <Dialog open={open} onOpenChange={(next) => { if (!pending) setOpen(next); }}>
        <DialogContent className="w-[calc(100%-2rem)] border-[#58c8c3]/40 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquarePlus className="h-5 w-5 text-[#58c8c3]" /> Platform feedback
            </DialogTitle>
            <DialogDescription>Select a page or module and tell us what could be improved.</DialogDescription>
          </DialogHeader>
          {mutation.isSuccess ? (
            <div className="space-y-4" role="status" data-testid="feedback-success">
              <div className="flex items-start gap-3 rounded-md border border-primary/30 bg-primary/10 p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="font-semibold">Thank you for your feedback.</p>
                  <p className="mt-1 text-sm text-muted-foreground">Your feedback for {module} has been saved.</p>
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="w-full rounded-md bg-[#58c8c3] px-4 py-2 text-sm font-semibold text-[#082e35] hover:bg-[#7adbd6]">Done</button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="feedback-module" className="text-sm font-semibold">Page / module</label>
                <select id="feedback-module" value={module} disabled={pending} onChange={(e) => setModule(e.target.value as FeedbackInputModule)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#58c8c3]">
                  {Object.values(FeedbackInputModule).map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="feedback-message" className="text-sm font-semibold">Your feedback</label>
                <textarea id="feedback-message" data-testid="input-feedback-message" value={message} disabled={pending} onChange={(e) => { setMessage(e.target.value); if (mutation.isError) mutation.reset(); }} required maxLength={5000} rows={5} placeholder="Share a suggestion, report an issue, or tell us what works well…" className="w-full resize-y rounded-md border border-input bg-background p-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#58c8c3]" />
                <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                  <span>Please avoid including sensitive information.</span><span>{message.length.toLocaleString()} / 5,000</span>
                </div>
              </div>
              {mutation.isError && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground">We couldn’t save your feedback. Your message is still here. Please try again shortly.</p>}
              <div className="flex justify-end gap-2">
                <button type="button" disabled={pending} onClick={() => setOpen(false)} className="rounded-md border border-input px-4 py-2 text-sm hover:bg-accent disabled:opacity-50">Cancel</button>
                <button type="submit" data-testid="button-submit-feedback" disabled={pending || !message.trim()} className="flex items-center gap-2 rounded-md bg-[#58c8c3] px-4 py-2 text-sm font-semibold text-[#082e35] hover:bg-[#7adbd6] disabled:opacity-50">
                  {pending && <Loader2 className="h-4 w-4 animate-spin" />}{pending ? "Saving…" : "Submit feedback"}
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function QuickSurveyButton({ module }: { module: FeedbackInputModule }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");
  const mutation = useSubmitFeedback();
  const pending = mutation.isPending;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending || rating < 1 || rating > 5) return;
    const survey = [
      "Quick module survey",
      `Module: ${module}`,
      `Usefulness rating: ${rating}/5`,
      message.trim() ? `Suggested improvement: ${message.trim()}` : "Suggested improvement: (not provided)",
    ].join("\n");
    mutation.mutate({ data: { module, message: survey } }, {
      onSuccess: () => { setRating(0); setMessage(""); },
    });
  };
  return (
    <>
      <button
        type="button"
        data-testid="button-module-survey"
        onClick={() => { mutation.reset(); setRating(0); setMessage(""); setOpen(true); }}
        className="fixed bottom-4 left-4 z-[40] flex h-11 items-center gap-2 rounded-full border border-teal-100 bg-teal-300 pl-3 pr-4 text-[13px] font-bold text-teal-950 shadow-[0_6px_28px_rgba(45,212,191,0.45)] ring-2 ring-teal-200/30 transition-transform hover:-translate-y-0.5 hover:bg-teal-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-100 focus-visible:ring-offset-2 print:hidden"
      >
        <ClipboardList className="h-4 w-4" /> Quick survey
      </button>
      <Dialog open={open} onOpenChange={(next) => { if (!pending) setOpen(next); }}>
        <DialogContent className="w-[calc(100%-2rem)] border-[#58c8c3]/40 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-[#58c8c3]" /> Quick survey · {module}
            </DialogTitle>
            <DialogDescription>Your response is saved privately with this module’s name.</DialogDescription>
          </DialogHeader>
          {mutation.isSuccess ? (
            <div className="space-y-4" role="status" data-testid="module-survey-success">
              <div className="flex items-start gap-3 rounded-md border border-primary/30 bg-primary/10 p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="font-semibold">Thank you for taking the survey.</p>
                  <p className="mt-1 text-sm text-muted-foreground">Your response for {module} has been saved.</p>
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="w-full rounded-md bg-[#58c8c3] px-4 py-2 text-sm font-semibold text-[#082e35] hover:bg-[#7adbd6]">Done</button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold">How useful is this module?</legend>
                <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Module usefulness">
                  {[1, 2, 3, 4, 5].map(value => (
                    <button key={value} type="button" role="radio" aria-checked={rating === value} aria-label={`${value} out of 5`} data-testid={`button-survey-rating-${value}`} disabled={pending} onClick={() => setRating(value)}
                      className={`h-10 rounded border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#58c8c3] disabled:opacity-50 ${rating === value ? "border-[#58c8c3] bg-[#58c8c3] text-[#082e35]" : "border-input bg-background text-foreground hover:border-[#58c8c3]/70 hover:bg-[#58c8c3]/10"}`}>
                      {value}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between text-[11px] text-muted-foreground"><span>Not useful</span><span>Very useful</span></div>
              </fieldset>
              <div className="space-y-1.5">
                <label htmlFor="module-survey-message" className="text-sm font-semibold">What could we improve? <span className="font-normal text-muted-foreground">(optional)</span></label>
                <textarea id="module-survey-message" data-testid="input-module-survey-message" value={message} disabled={pending} onChange={event => { setMessage(event.target.value); if (mutation.isError) mutation.reset(); }} maxLength={1500} rows={4} placeholder="Share one suggestion for this module…" className="w-full resize-y rounded-md border border-input bg-background p-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#58c8c3]" />
                <div className="text-right text-xs text-muted-foreground">{message.length.toLocaleString()} / 1,500</div>
              </div>
              {mutation.isError && <p role="alert" data-testid="module-survey-error" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">We couldn’t save your survey response. Please try again.</p>}
              <div className="flex justify-end gap-2">
                <button type="button" disabled={pending} onClick={() => setOpen(false)} className="rounded-md border border-input px-4 py-2 text-sm hover:bg-accent disabled:opacity-50">Cancel</button>
                <button type="submit" data-testid="button-submit-module-survey" disabled={pending || rating < 1} className="flex items-center gap-2 rounded-md bg-[#58c8c3] px-4 py-2 text-sm font-semibold text-[#082e35] hover:bg-[#7adbd6] disabled:opacity-50">
                  {pending && <Loader2 className="h-4 w-4 animate-spin" />}{pending ? "Saving…" : "Submit survey"}
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
