import { Router, type IRouter } from "express";
import { AskAssistantBody, AskAssistantResponse } from "@workspace/api-zod";
import { assistantAnswer } from "../lib/assistant";

const router: IRouter = Router();
const limits = new Map<string, { count: number; reset: number; active: boolean }>();
let active = 0;
router.post("/assistant/chat", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const parsed = AskAssistantBody.safeParse(req.body);
  if (!parsed.success || parsed.data.messages.at(-1)?.role !== "user" ||
      parsed.data.messages.reduce((n, m) => n + m.content.length, 0) > 36000) {
    res.status(400).json({ error: "Send a conversation of at most 12 messages ending with a user question (36,000 characters total)." }); return;
  }
  if (!process.env.ANALYTICS_API_KEY) {
    res.status(503).json({ error: "The assistant's server API key has not been configured." }); return;
  }
  const now = Date.now();
  for (const [key, value] of limits) if (value.reset <= now && !value.active) limits.delete(key);
  // Do not trust arbitrary X-Forwarded-For headers for quota identity.
  const key = req.ip ?? req.socket.remoteAddress ?? "shared";
  const quota = limits.get(key) ?? { count: 0, reset: now + 3600000, active: false };
  if (quota.count >= 30 || quota.active || active >= 6 || limits.size > 5000) {
    res.setHeader("Retry-After", "60");
    res.status(429).json({ error: "The assistant is busy or the request limit was reached. Please wait before trying again." }); return;
  }
  quota.count++; quota.active = true; active++; limits.set(key, quota);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 150000);
  const close = () => { if (!res.writableEnded) controller.abort(); };
  res.on("close", close);
  try {
    const result = await assistantAnswer(parsed.data, controller.signal);
    if (!res.destroyed) res.json(AskAssistantResponse.parse(result));
  } catch (error) {
    // Log only a classification; never prompts, source data, provider payloads or credentials.
    req.log.warn({ category: controller.signal.aborted ? "timeout_or_disconnect" : "assistant_unavailable" }, "Assistant request failed");
    if (!res.destroyed) res.status(503).json({ error: controller.signal.aborted
      ? "The request timed out. Try a narrower question."
      : error instanceof Error ? error.message : "The assistant is temporarily unavailable." });
  } finally {
    clearTimeout(timeout); res.off("close", close); quota.active = false; active--;
  }
});
export default router;
