import { useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, MessageSquarePlus } from "lucide-react";
import { FeedbackInputModule, useSubmitFeedback } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SUMMARY_COLORS } from "@/lib/summary";
import { GenerateReportButton } from "@/components/generate-report-button";

export function FeedbackButton({ defaultModule = "Summary" }: { defaultModule?: FeedbackInputModule }) {
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
      <GenerateReportButton pageLabel={defaultModule} />
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
