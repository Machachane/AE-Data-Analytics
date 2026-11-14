import { ExternalLink } from "lucide-react";

export function AeFinanceButton() {
  return (
    <a
      href="https://machachane.github.io/AE-Finance/"
      target="_blank"
      rel="noopener noreferrer"
      data-testid="button-ae-finance"
      aria-label="AE+ Finance (opens in a new tab)"
      className="inline-flex h-8 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[3px] border border-teal-200/60 bg-teal-300 px-4 text-[12px] font-bold text-teal-950 shadow-[0_0_16px_rgba(45,212,191,0.18)] transition-colors hover:bg-teal-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-100 focus-visible:ring-offset-2 focus-visible:ring-offset-background print:hidden"
    >
      AE+ Finance <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
    </a>
  );
}
