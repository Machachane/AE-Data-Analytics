import { useState, type FormEvent } from "react";
import { AlertTriangle, ArrowRight, Loader2, Lock, Plane, User } from "lucide-react";

interface TeamLoginProps {
  onSubmit: (username: string, password: string) => void;
  pending: boolean;
  error: string | null;
}

const fieldWrap =
  "group relative flex items-center rounded-md border border-input bg-[hsl(207_55%_12%)] transition-[border-color,box-shadow,background-color] duration-150 hover:border-[hsl(207_30%_48%)] focus-within:border-[hsl(var(--ring))] focus-within:shadow-[0_0_0_3px_hsl(178_55%_45%/0.18)] has-[input:disabled]:opacity-60";
const inputCls =
  "h-11 w-full bg-transparent pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none disabled:cursor-not-allowed";
const iconCls =
  "pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground transition-colors duration-150 group-focus-within:text-[hsl(var(--ring))]";

export function TeamLogin({ onSubmit, pending, error }: TeamLoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    onSubmit(username.trim(), password);
  };

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[hsl(207_55%_11%)] px-4 py-10 text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(hsl(207 35% 22% / 0.5) 1px, transparent 1px), linear-gradient(90deg, hsl(207 35% 22% / 0.5) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
        }}
      />
      <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
        <path d="M-5 80 Q 40 20 105 35" fill="none" stroke="hsl(178 55% 45% / 0.22)" strokeWidth="0.15" strokeDasharray="0.8 0.8" vectorEffect="non-scaling-stroke" />
        <path d="M-5 30 Q 55 70 105 60" fill="none" stroke="hsl(207 40% 50% / 0.18)" strokeWidth="0.15" strokeDasharray="0.8 0.8" vectorEffect="non-scaling-stroke" />
      </svg>

      <div className="relative w-full max-w-[400px]">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md border border-[hsl(178_55%_40%/0.4)] bg-[hsl(178_55%_38%/0.12)]">
            <Plane className="h-5 w-5 -rotate-45 text-[hsl(178_55%_55%)]" aria-hidden />
          </div>
          <div>
            <div className="text-[15px] font-semibold tracking-tight">
              AE<span className="text-[hsl(178_55%_55%)]">+</span> Data Analytics
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Airline Economics
            </div>
          </div>
        </div>

        <section className="rounded-lg border border-card-border bg-card shadow-[0_20px_50px_-20px_rgb(0_0_0/0.6)]">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-[hsl(178_55%_45%/0.6)] to-transparent" />
          <div className="p-6 sm:p-7">
            <h1 className="text-lg font-semibold tracking-tight">Team access</h1>
            <p className="mt-1 text-sm text-muted-foreground">Sign in with the shared team credentials.</p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate={false} aria-busy={pending}>
              <div className="space-y-1.5">
                <label htmlFor="login-username" className="text-xs font-medium text-muted-foreground">Username</label>
                <div className={fieldWrap}>
                  <User className={iconCls} aria-hidden />
                  <input
                    id="login-username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    disabled={pending}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    aria-invalid={!!error}
                    aria-describedby={error ? "login-error" : undefined}
                    className={inputCls}
                    data-testid="login-username"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="login-password" className="text-xs font-medium text-muted-foreground">Password</label>
                <div className={fieldWrap}>
                  <Lock className={iconCls} aria-hidden />
                  <input
                    id="login-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    disabled={pending}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-invalid={!!error}
                    aria-describedby={error ? "login-error" : undefined}
                    className={inputCls}
                    data-testid="login-password"
                  />
                </div>
              </div>

              {error && (
                <div
                  id="login-error"
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-[hsl(0_65%_50%/0.4)] bg-[hsl(0_65%_50%/0.1)] px-3 py-2.5 text-sm text-[hsl(0_80%_80%)]"
                  data-testid="login-error"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={pending}
                className="group/btn flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground transition-[background-color,box-shadow] duration-150 hover:bg-[hsl(178_55%_33%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-70"
                data-testid="login-submit"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                <span>Sign in</span>
                {!pending && (
                  <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover/btn:translate-x-0.5" aria-hidden />
                )}
              </button>
            </form>
          </div>
        </section>

        <p className="mt-5 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
          Authorised team use only
        </p>
      </div>
    </main>
  );
}

export default TeamLogin;
