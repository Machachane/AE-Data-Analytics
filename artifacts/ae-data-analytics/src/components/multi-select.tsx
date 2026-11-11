import { useMemo, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function MultiSelect({ label, options, value, onChange, id }: { label: string; options: string[]; value: string[]; onChange: (v: string[]) => void; id: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => o.toLowerCase().includes(s)) : options;
  }, [q, options]);
  const toggle = (o: string) => onChange(value.includes(o) ? value.filter((v) => v !== o) : [...value, o]);
  const text = value.length === 0 ? "All" : value.length === 1 ? value[0] : `${value.length} selected`;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
        {value.length > 0 && (
          <button data-testid={`clear-${id}`} onClick={() => onChange([])} className="text-[10px] text-primary hover:underline">Clear</button>
        )}
      </div>
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
        <PopoverTrigger asChild>
          <button data-testid={`select-${id}`} className={`flex h-7 w-full items-center justify-between rounded-[3px] border px-2 text-left text-[12px] transition-colors hover:border-primary ${value.length ? "border-primary bg-primary/10" : "border-input bg-card"}`}>
            <span className="truncate">{text}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[280px] p-0">
          <div className="flex items-center gap-1.5 border-b px-2 py-1.5">
            <Search className="h-3.5 w-3.5 opacity-60" />
            <input data-testid={`search-${id}`} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${options.length} ${label.toLowerCase()} options`} className="h-6 w-full bg-transparent text-[12px] outline-none" />
            {q && <button onClick={() => setQ("")} aria-label="Clear search"><X className="h-3.5 w-3.5" /></button>}
          </div>
          <div className="thin-scroll max-h-[280px] overflow-y-auto py-1">
            {shown.length === 0 && <div className="px-3 py-4 text-center text-[12px] text-muted-foreground">No matches for "{q}"</div>}
            {shown.map((o) => {
              const on = value.includes(o);
              return (
                <button key={o} onClick={() => toggle(o)} className="flex w-full items-center gap-2 px-2 py-1 text-left text-[12px] hover:bg-accent">
                  <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[2px] border ${on ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}>{on && <Check className="h-3 w-3" />}</span>
                  <span className="truncate">{o}</span>
                </button>
              );
            })}
          </div>
          <div className="flex justify-between border-t px-2 py-1.5 text-[11px] text-muted-foreground">
            <span>{value.length} of {options.length} selected</span>
            <button onClick={() => onChange([])} className="text-primary hover:underline">Select all</button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
