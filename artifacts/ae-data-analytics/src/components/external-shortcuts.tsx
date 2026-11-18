import { ArrowUpRight } from "lucide-react";

export const EXTERNAL_SHORTCUTS = [
  { id: "ratings", label: "AE+ Aviation Ratings®", href: "https://www.aviationnews-online.com/ae-aviation-ratings" },
  { id: "tracker", label: "Flight Tracker", href: "https://www.aviationnews-online.com/flight-tracker-aog" },
  { id: "ground", label: "Aircraft On Ground", href: "https://www.aviationnews-online.com/aog-status" },
  { id: "flyward", label: "Flyward", href: "https://www.aviationnews-online.com/subscriber-dashboard" },
] as const;

export const EXTERNAL_SHORTCUT_IDS: ReadonlySet<string> = new Set(EXTERNAL_SHORTCUTS.map((s) => s.id));

export function ExternalShortcuts() {
  return (
    <nav aria-label="AE+ services" className="border-b border-white/10 bg-[#0a1c29] px-3 py-1.5 sm:px-5 print:hidden">
      <ul className="thin-scroll flex w-max min-w-full items-center justify-end gap-1.5 overflow-x-auto">
        <li className="mr-auto hidden shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:block">AE+ Services</li>
        {EXTERNAL_SHORTCUTS.map((s) => (
          <li key={s.id} className="shrink-0">
            <a
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              data-testid={`link-external-${s.id}`}
              className="group flex h-8 cursor-pointer items-center gap-1.5 rounded-[4px] border border-[#53e5b1] bg-[#1fd18b] px-3 text-[12px] font-semibold text-[#062b1d] shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-[#8af0c9] hover:bg-[#55e2ad] hover:shadow-[0_3px_12px_rgba(31,209,139,0.2)] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8af0c9] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a1c29]"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#087a53]" aria-hidden="true" />
              {s.label}
              <ArrowUpRight className="h-3 w-3 text-[#07583e] transition-transform duration-150 group-hover:-translate-y-px group-hover:translate-x-px" aria-hidden="true" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
