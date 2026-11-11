import { useMemo, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const LIMIT = 100;

/** Searchable single-select. Renders at most 100 matches so very large lists (32k MSNs) stay fast. */
export function SingleSelect({ label, options, value, onChange, id, display }: { label: string; options: string[]; value: string; onChange: (v: string) => void; id: string; display?: (v: string) => string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const show = (v: string) => (v === "" ? "(Blank)" : display ? display(v) : v);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter((o) => o.toLowerCase().includes(s) || (display ? display(o).toLowerCase().includes(s) : false));
  }, [q, options, display]);
  const shown = matches.slice(0, LIMIT);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
        {value && <button data-testid={`clear-${id}`} onClick={() => onChange("")} className="text-[10px] text-primary hover:underline">Clear</button>}
      </div>
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
        <PopoverTrigger asChild>
          <button data-testid={`select-${id}`} title={value ? show(value) : undefined} className={`flex h-7 w-full items-center justify-between rounded-[3px] border px-2 text-left text-[12px] transition-colors hover:border-primary ${value ? "border-primary bg-primary/10" : "border-input bg-card"}`}>
            <span className="truncate">{value ? show(value) : "All"}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[280px] p-0">
          <div className="flex items-center gap-1.5 border-b px-2 py-1.5">
            <Search className="h-3.5 w-3.5 opacity-60" />
            <input data-testid={`search-${id}`} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${options.length.toLocaleString("en-US")} ${label.toLowerCase()} options`} className="h-6 w-full bg-transparent text-[12px] outline-none" />
            {q && <button onClick={() => setQ("")} aria-label="Clear search"><X className="h-3.5 w-3.5" /></button>}
          </div>
          <div className="thin-scroll max-h-[280px] overflow-y-auto py-1">
            <button onClick={() => { onChange(""); setOpen(false); }} className="flex w-full items-center gap-2 px-2 py-1 text-left text-[12px] hover:bg-accent">
              <span className="flex h-3.5 w-3.5 items-center justify-center">{!value && <Check className="h-3 w-3 text-primary" />}</span>All
            </button>
            {shown.length === 0 && <div className="px-3 py-4 text-center text-[12px] text-muted-foreground">No matches for "{q}"</div>}
            {shown.map((o) => (
              <button key={o} data-testid={`option-${id}-${o}`} onClick={() => { onChange(o); setOpen(false); setQ(""); }} title={o} className="flex w-full items-center gap-2 px-2 py-1 text-left text-[12px] hover:bg-accent">
                <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">{value === o && <Check className="h-3 w-3 text-primary" />}</span>
                <span className={`truncate ${o === "" ? "italic text-muted-foreground" : ""}`}>{show(o)}</span>
                {display && o && display(o) !== o && <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">{o}</span>}
              </button>
            ))}
          </div>
          <div className="border-t px-2 py-1.5 text-[11px] text-muted-foreground tnum">
            {matches.length > LIMIT ? `Showing first ${LIMIT} of ${matches.length.toLocaleString("en-US")} matches. Type to narrow.` : `${matches.length.toLocaleString("en-US")} of ${options.length.toLocaleString("en-US")} options`}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
