import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import type { Dispatch, SetStateAction } from "react";

/** Share the same persisted theme across every dashboard module. */
export function useDashboardTheme() {
  const { theme, setTheme } = useTheme();
  const isDark = theme !== "light";
  const setDark: Dispatch<SetStateAction<boolean>> = (next) => {
    const dark = typeof next === "function" ? next(isDark) : next;
    setTheme(dark ? "dark" : "light");
  };
  return { isDark, setDark };
}

export function ThemeToggle({ isDark, onToggle }: { isDark: boolean; onToggle: () => void }) {
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";
  const Icon = isDark ? Sun : Moon;
  return (
    <button
      type="button"
      data-testid="button-theme"
      onClick={onToggle}
      aria-label={label}
      title={label}
      className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[4px] border border-primary/50 bg-primary/10 px-3 text-[12px] font-semibold text-foreground transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background print:hidden"
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
      {isDark ? "Light mode" : "Dark mode"}
    </button>
  );
}
