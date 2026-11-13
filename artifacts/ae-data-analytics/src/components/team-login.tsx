import { useState, type FormEvent } from "react";
import { AlertTriangle, ArrowRight, Loader2, Lock, ShieldCheck, User } from "lucide-react";

interface TeamLoginProps {
  onSubmit: (username: string, password: string) => void;
  pending: boolean;
  error: string | null;
}

const logoSrc = import.meta.env.BASE_URL + "airline-economics-logo.webp";

const fieldWrap =
  "group relative flex items-center rounded-[4px] border border-[hsl(207_28%_30%)] bg-[hsl(208_50%_10%)] transition-[border-color,box-shadow,background-color] duration-200 hover:border-[hsl(207_25%_44%)] focus-within:border-[hsl(178_50%_46%)] focus-within:bg-[hsl(208_50%_9%)] focus-within:shadow-[0_0_0_3px_hsl(178_55%_45%/0.14)] has-[input:disabled]:opacity-60";
const inputCls =
  "h-12 w-full bg-transparent pl-11 pr-3 text-[15px] text-foreground placeholder:text-muted-foreground/50 outline-none disabled:cursor-not-allowed";
const iconCls =
  "pointer-events-none absolute left-3.5 h-4 w-4 text-[hsl(205_18%_55%)] transition-colors duration-200 group-focus-within:text-[hsl(178_55%_55%)]";
const labelCls = "text-[11px] font-medium uppercase tracking-[0.14em] text-[hsl(205_20%_70%)]";

export function TeamLogin({ onSubmit, pending, error }: TeamLoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    onSubmit(username.trim(), password);
  };

  return (
    <main className="relative flex min-h-[100dvh] flex-col bg-[hsl(208_52%_9%)] text-foreground lg:flex-row">
      {/* Brand panel */}
      <aside className="relative flex flex-col justify-between overflow-hidden border-b border-[hsl(207_35%_18%)] bg-[linear-gradient(160deg,hsl(207_52%_14%)_0%,hsl(208_55%_9%)_70%)] px-6 py-8 sm:px-10 lg:w-[46%] lg:border-b-0 lg:border-r lg:px-14 lg:py-14">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(hsl(207 35% 30% / 0.18) 1px, transparent 1px), linear-gradient(90deg, hsl(207 35% 30% / 0.18) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
            maskImage: "linear-gradient(to bottom, black, transparent 85%)",
            WebkitMaskImage: "linear-gradient(to bottom, black, transparent 85%)",
          }}
        />
        <div aria-hidden className="pointer-events-none absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b from-[hsl(150_45%_55%)] via-[hsl(178_55%_45%)] to-[hsl(195_75%_45%)] opacity-80 max-lg:hidden" />

        <img
          src={logoSrc}
          alt="Airline Economics+"
          width={1200}
          height={236}
          className="relative h-auto w-[220px] select-none sm:w-[260px] lg:w-[320px]"
          draggable={false}
          data-testid="img-login-logo"
        />

        <div className="relative mt-8 hidden lg:block">
          <div className="mb-5 h-px w-12 bg-[hsl(178_55%_45%)]" />
          <h2 className="max-w-[22ch] text-[30px] font-light leading-[1.2] tracking-tight text-[hsl(205_30%_94%)]">
            Data Analytics
          </h2>
          <p className="mt-3 max-w-[38ch] text-sm leading-relaxed text-[hsl(205_18%_64%)]">
            Private aviation intelligence workspace for the Airline Economics+ team.
          </p>
        </div>

        <p className="relative mt-10 hidden font-mono text-[10px] uppercase tracking-[0.2em] text-[hsl(205_15%_50%)] lg:block">
          Airline Economics+ &middot; Restricted
        </p>
      </aside>

      {/* Form panel */}
      <section className="flex flex-1 items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-[400px] animate-in fade-in slide-in-from-bottom-2 duration-500">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[hsl(178_50%_55%)]">Team access</p>
          <h1 className="mt-3 text-[26px] font-semibold tracking-tight text-[hsl(205_30%_96%)]">Sign in to your workspace</h1>
          <p className="mt-2 text-sm text-[hsl(205_18%_64%)]">Use the shared team credentials to continue.</p>

          <form onSubmit={handleSubmit} className="mt-9 space-y-5" noValidate={false} aria-busy={pending}>
            <div className="space-y-2">
              <label htmlFor="login-username" className={labelCls}>Username</label>
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

            <div className="space-y-2">
              <label htmlFor="login-password" className={labelCls}>Password</label>
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
                className="flex items-start gap-2.5 rounded-[4px] border-l-2 border-[hsl(0_65%_55%)] bg-[hsl(0_60%_50%/0.1)] px-3.5 py-3 text-sm text-[hsl(0_75%_82%)]"
                data-testid="login-error"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={pending}
              className="group/btn mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-[4px] bg-[hsl(178_55%_36%)] text-sm font-semibold tracking-wide text-[hsl(0_0%_98%)] shadow-[inset_0_1px_0_hsl(178_60%_60%/0.25)] transition-[background-color,transform] duration-200 hover:bg-[hsl(178_55%_31%)] active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(178_55%_50%)] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(208_52%_9%)] disabled:cursor-not-allowed disabled:opacity-70"
              data-testid="login-submit"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              <span>Sign in</span>
              {!pending && (
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover/btn:translate-x-0.5" aria-hidden />
              )}
            </button>
          </form>

          <div className="mt-10 flex items-center gap-2 border-t border-[hsl(207_35%_18%)] pt-5 text-[11px] text-[hsl(205_15%_52%)]">
            <ShieldCheck className="h-3.5 w-3.5 text-[hsl(178_45%_48%)]" aria-hidden />
            <span className="font-mono uppercase tracking-[0.16em]">Authorised team use only</span>
          </div>
        </div>
      </section>
    </main>
  );
}

export default TeamLogin;
