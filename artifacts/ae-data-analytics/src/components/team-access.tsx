import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getTeamSession, loginTeam, logoutTeam, type TeamSession } from "@workspace/api-client-react";
import { Loader2, LogOut, ShieldCheck } from "lucide-react";
import { TeamLogin } from "@/components/team-login";

function errorMessage(error: unknown, fallback: string) {
  const typed = error as { status?: number; data?: { error?: unknown } };
  return typeof typed?.data?.error === "string" ? typed.data.error : fallback;
}

export function TeamAccess({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [session, setSession] = useState<TeamSession | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [checking, setChecking] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkError, setCheckError] = useState(false);
  const revision = useRef(0);

  const clearPrivateData = useCallback(() => {
    void client.cancelQueries();
    client.clear();
    try {
      sessionStorage.removeItem("ae-assistant-chat-v1");
      sessionStorage.removeItem("ae-assistant-open");
    } catch { /* Browser storage may be disabled. */ }
  }, [client]);

  const refresh = useCallback(async () => {
    const requestRevision = ++revision.current;
    try {
      const next = await getTeamSession();
      if (requestRevision !== revision.current) return;
      if (!next.authenticated) clearPrivateData();
      setSession(next);
      setCheckError(false);
    } catch {
      if (requestRevision !== revision.current) return;
      clearPrivateData();
      setSession(null);
      setCheckError(true);
    } finally {
      if (requestRevision === revision.current) setChecking(false);
    }
  }, [clearPrivateData]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 60000);
    const focus = () => void refresh();
    const expired = () => {
      if (!sessionRef.current?.authenticated) return;
      revision.current++;
      setSession({ authenticated: false });
      clearPrivateData();
      setError("Your session has ended. Please sign in again.");
    };
    const storage = (event: StorageEvent) => { if (event.key === "ae-team-auth-change") void refresh(); };
    window.addEventListener("focus", focus);
    window.addEventListener("ae-auth-expired", expired);
    window.addEventListener("storage", storage);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", focus);
      window.removeEventListener("ae-auth-expired", expired);
      window.removeEventListener("storage", storage);
    };
  }, [refresh, clearPrivateData]);

  useEffect(() => {
    if (!session?.authenticated || !session.expiresAt) return;
    const timer = window.setTimeout(() => {
      window.dispatchEvent(new Event("ae-auth-expired"));
    }, Math.max(0, Date.parse(session.expiresAt) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [session]);

  const notifyOtherTabs = () => {
    try { localStorage.setItem("ae-team-auth-change", String(Date.now())); } catch { /* No storage required for sign-in. */ }
  };

  const signIn = async (username: string, password: string) => {
    if (pending) return;
    revision.current++;
    setPending(true);
    setError(null);
    try {
      const next = await loginTeam({ username, password });
      revision.current++;
      clearPrivateData();
      setSession(next);
      setCheckError(false);
      notifyOtherTabs();
    } catch (cause) {
      setError(errorMessage(cause, "Could not sign in. Please try again."));
    } finally { setPending(false); }
  };

  const signOut = async () => {
    if (pending) return;
    revision.current++;
    setPending(true);
    setError(null);
    try {
      await logoutTeam();
      revision.current++;
      setSession({ authenticated: false });
      clearPrivateData();
      notifyOtherTabs();
    } catch (cause) {
      setError(errorMessage(cause, "Could not sign out. Please try again."));
    } finally { setPending(false); }
  };

  if (checking) return <main className="flex min-h-screen items-center justify-center gap-2 bg-background text-muted-foreground" role="status"><Loader2 className="h-5 w-5 animate-spin" /> Checking team access…</main>;
  if (checkError) return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <h1 className="text-lg font-semibold">Team access is temporarily unavailable</h1>
      <p className="text-sm text-muted-foreground">We couldn’t verify your session. Please try again.</p>
      <button onClick={() => { setChecking(true); void refresh(); }} className="rounded-md bg-primary px-4 py-2 text-primary-foreground">Try again</button>
    </main>
  );
  if (!session?.authenticated) return <TeamLogin onSubmit={signIn} pending={pending} error={error} />;
  return (
    <>
      <div className="flex min-h-8 items-center justify-between gap-3 border-b border-border bg-[#0d2332] px-3 py-1 text-xs print:hidden">
        <span className="flex items-center gap-1.5 text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> Team access</span>
        <div className="flex items-center gap-3">
          {error && <span role="alert" className="text-red-300">{error}</span>}
          <button data-testid="button-sign-out" onClick={signOut} disabled={pending} className="flex items-center gap-1.5 rounded px-2 py-1 text-foreground hover:bg-white/10 disabled:opacity-50">
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />} Sign out
          </button>
        </div>
      </div>
      {children}
    </>
  );
}
