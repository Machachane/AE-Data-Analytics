import { Router, type IRouter } from "express";
import { db, feedbackTable } from "@workspace/db";
import { SubmitFeedbackBody, SubmitFeedbackResponse } from "@workspace/api-zod";

const router: IRouter = Router();
const limits = new Map<string, { count: number; reset: number }>();

// Intentionally no public listing route: feedback may contain private information.
router.post("/feedback", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const parsed = SubmitFeedbackBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.message.trim()) {
    res.status(400).json({ error: "Select a valid module and enter feedback of up to 5,000 characters." });
    return;
  }
  const now = Date.now();
  for (const [key, limit] of limits) if (limit.reset <= now) limits.delete(key);
  const key = req.ip ?? req.socket.remoteAddress ?? "shared";
  const limit = limits.get(key) ?? { count: 0, reset: now + 60000 };
  if (limit.count >= 10 || limits.size > 5000) {
    res.setHeader("Retry-After", "60");
    res.status(429).json({ error: "Please wait a minute before sending more feedback." });
    return;
  }
  limit.count++;
  limits.set(key, limit);
  try {
    const [saved] = await db.insert(feedbackTable).values({
      module: parsed.data.module,
      message: parsed.data.message.trim(),
    }).returning({ id: feedbackTable.id, createdAt: feedbackTable.createdAt });
    res.status(201).json(SubmitFeedbackResponse.parse({
      id: saved.id, createdAt: saved.createdAt.toISOString(),
    }));
  } catch {
    req.log.error({ category: "feedback_storage_unavailable" }, "Could not save feedback");
    res.status(503).json({ error: "Your feedback could not be saved. Please try again shortly." });
  }
});

export default router;
