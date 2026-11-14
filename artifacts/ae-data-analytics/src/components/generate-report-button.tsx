import { useEffect, useRef, useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { generateDashboardReport } from "@workspace/api-client-react";
import { MODULE_LABELS, useAssistantController } from "@/lib/assistant-controller";

export function GenerateReportButton({ pageLabel }: { pageLabel: string }) {
  const { live, getLive } = useAssistantController();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [downloaded, setDownloaded] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); }, []);
  const ready = !!live?.ready && MODULE_LABELS[live.module] === pageLabel;
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
  return (
    <>
      <button type="button" data-testid="button-generate-ai-report" onClick={generate} disabled={!ready || busy}
        aria-busy={busy} title="Download an AI-powered PDF summary using your current selections"
        className="flex w-full items-center justify-center gap-1.5 rounded-[3px] bg-teal-300 px-2 py-2 text-center text-[12px] font-bold text-teal-950 transition-colors hover:bg-teal-200 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-100 focus-visible:ring-offset-2 focus-visible:ring-offset-background print:hidden">
        {busy ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <FileDown className="h-3.5 w-3.5 shrink-0" />}
        {busy ? "Generating summary…" : "Generate AI Summary"}
      </button>
      {busy && <p role="status" className="text-[11px] text-muted-foreground print:hidden">Preparing the PDF from your captured selections. This may take a minute.</p>}
      {error && <p role="alert" className="text-[11px] text-destructive print:hidden">{error}</p>}
      {downloaded && !busy && <p role="status" className="text-[11px] text-muted-foreground print:hidden">PDF ready — download started.</p>}
    </>
  );
}
