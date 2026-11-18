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
      <ul className="thin-scroll flex items-center gap-1.5 overflow-x-auto">
        <li className="mr-1 hidden shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:block">AE+ Services</li>
        {EXTERNAL_SHORTCUTS.map((s) => (
          <li key={s.id} className="shrink-0">
            <a
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              data-testid={`link-external-${s.id}`}
              className="group flex h-7 items-center gap-1.5 rounded-[4px] border border-white/10 bg-white/[0.03] px-2.5 text-[12px] font-medium text-foreground/85 transition-colors duration-150 hover:border-primary/60 hover:bg-primary/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-[#0a1c29]"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-primary/70 transition-colors group-hover:bg-primary" aria-hidden="true" />
              {s.label}
              <ArrowUpRight className="h-3 w-3 text-muted-foreground transition-transform duration-150 group-hover:-translate-y-px group-hover:translate-x-px group-hover:text-primary" aria-hidden="true" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
