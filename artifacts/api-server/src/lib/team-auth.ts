import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { and, eq, gt } from "drizzle-orm";
import { db, teamSessionsTable } from "@workspace/db";

export const TEAM_USERNAME = "aeteam";
export const SESSION_COOKIE = "__Host-ae-team";
export const SESSION_DURATION = 12 * 60 * 60 * 1000;
export const cookieOptions = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" };
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export function credentialVersion() {
  const password = process.env.TEAM_LOGIN_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  if (!password || !secret) throw new Error("Team authentication is not configured");
  return createHmac("sha256", secret).update(password).digest("hex");
}

export function credentialsMatch(username: string, password: string) {
  const expected = process.env.TEAM_LOGIN_PASSWORD;
  if (!expected) return false;
  const passwordMatches = timingSafeEqual(
    createHash("sha256").update(password).digest(),
    createHash("sha256").update(expected).digest(),
  );
  return passwordMatches && username === TEAM_USERNAME;
}

export function requestToken(req: Request): string | null {
  const token = req.cookies?.[SESSION_COOKIE];
  return typeof token === "string" && /^[a-f0-9]{64}$/.test(token) ? token : null;
}

export async function sessionFor(req: Request) {
  const version = credentialVersion();
  const token = requestToken(req);
  if (!token) return null;
  const [session] = await db.select({ expiresAt: teamSessionsTable.expiresAt })
    .from(teamSessionsTable).where(and(
      eq(teamSessionsTable.tokenHash, tokenHash(token)),
      eq(teamSessionsTable.credentialVersion, version),
      gt(teamSessionsTable.expiresAt, new Date()),
    )).limit(1);
  return session ?? null;
}

// Cookies never authorize cross-origin writes, even from related subdomains.
export function sameOriginWrite(req: Request, res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) { next(); return; }
  const origin = req.get("origin");
  const hosts = [req.get("host"), req.get("x-forwarded-host")?.split(",")[0].trim()].filter(Boolean);
  let allowed = req.get("sec-fetch-site") !== "cross-site";
  if (origin) {
    try { allowed = allowed && hosts.includes(new URL(origin).host); }
    catch { allowed = false; }
  }
  if (!allowed) { res.status(403).json({ error: "Please submit this request from the platform." }); return; }
  next();
}

export async function requireTeamSession(req: Request, res: Response, next: NextFunction) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (!await sessionFor(req)) {
      res.status(401).json({ error: "Please sign in to access the platform." });
      return;
    }
    next();
  } catch {
    req.log.error({ category: "team_auth_unavailable" }, "Team authentication unavailable");
    res.status(503).json({ error: "Sign-in is temporarily unavailable. Please try again shortly." });
  }
}
