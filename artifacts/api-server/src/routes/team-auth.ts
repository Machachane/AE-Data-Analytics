import { randomBytes } from "node:crypto";
import { Router, type IRouter } from "express";
import { eq, lt } from "drizzle-orm";
import { db, teamSessionsTable } from "@workspace/db";
import { LoginTeamBody, LoginTeamResponse, GetTeamSessionResponse } from "@workspace/api-zod";
import {
  SESSION_COOKIE, SESSION_DURATION, TEAM_USERNAME, cookieOptions, credentialsMatch,
  credentialVersion, requestToken, sessionFor, tokenHash,
} from "../lib/team-auth";

const router: IRouter = Router();
const attempts = new Map<string, { count: number; expires: number }>();
router.use("/auth", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });

router.get("/auth/session", async (req, res): Promise<void> => {
  try {
    const session = await sessionFor(req);
    res.json(GetTeamSessionResponse.parse(session ? {
      authenticated: true, username: TEAM_USERNAME, expiresAt: session.expiresAt.toISOString(),
    } : { authenticated: false }));
  } catch {
    res.status(503).json({ error: "Sign-in is temporarily unavailable. Please try again shortly." });
  }
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.expires <= now) attempts.delete(key);
  const key = req.ip ?? req.socket.remoteAddress ?? "shared";
  const quota = attempts.get(key) ?? { count: 0, expires: now + 15 * 60000 };
  if (quota.count >= 10 || attempts.size > 5000) {
    res.setHeader("Retry-After", String(Math.max(1, Math.ceil((quota.expires - now) / 1000))));
    res.status(429).json({ error: "Too many sign-in attempts. Please try again in 15 minutes." });
    return;
  }
  quota.count++;
  attempts.set(key, quota);
  const parsed = LoginTeamBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Enter your username and password." }); return; }
  try {
    const version = credentialVersion();
    if (!credentialsMatch(parsed.data.username, parsed.data.password)) {
      res.status(401).json({ error: "Incorrect username or password." }); return;
    }
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(now + SESSION_DURATION);
    await db.delete(teamSessionsTable).where(lt(teamSessionsTable.expiresAt, new Date()));
    const oldToken = requestToken(req);
    if (oldToken) await db.delete(teamSessionsTable).where(eq(teamSessionsTable.tokenHash, tokenHash(oldToken)));
    await db.insert(teamSessionsTable).values({ tokenHash: tokenHash(token), credentialVersion: version, expiresAt });
    attempts.delete(key);
    res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_DURATION });
    res.json(LoginTeamResponse.parse({ authenticated: true, username: TEAM_USERNAME, expiresAt: expiresAt.toISOString() }));
  } catch {
    req.log.error({ category: "team_login_unavailable" }, "Could not create team session");
    res.status(503).json({ error: "Sign-in is temporarily unavailable. Please try again shortly." });
  }
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  try {
    const token = requestToken(req);
    if (token) await db.delete(teamSessionsTable).where(eq(teamSessionsTable.tokenHash, tokenHash(token)));
    res.clearCookie(SESSION_COOKIE, cookieOptions);
    res.sendStatus(204);
  } catch {
    res.status(503).json({ error: "Could not sign out. Please try again." });
  }
});

export default router;
