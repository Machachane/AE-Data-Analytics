import { Router, type IRouter } from "express";
import { GenerateDashboardReportBody } from "@workspace/api-zod";
import { collectReportData, ReportSelectionError } from "../lib/dashboard-report-data";
import { writeReportNarrative } from "../lib/dashboard-report-ai";
import { renderDashboardReport } from "../lib/dashboard-report-pdf";
import { ReportGenerationError } from "../lib/dashboard-report-errors";

const router: IRouter = Router();
let active = 0;
const limits = new Map<string, { count: number; reset: number; active: boolean }>();
router.post("/reports/dashboard", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  const parsed = GenerateDashboardReportBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Select a valid dashboard and filters before generating a report." }); return; }
  if (!process.env.OPENAI_API_KEY) { res.status(503).json({ error: "AI report generation is not configured." }); return; }
  const now = Date.now();
  for (const [id, quota] of limits) if (quota.reset <= now && !quota.active) limits.delete(id);
  const key = req.ip ?? req.socket.remoteAddress ?? "shared";
  const quota = limits.get(key) ?? { count: 0, reset: now + 3600000, active: false };
  if (active >= 3 || quota.active || quota.count >= 12 || limits.size > 5000) {
    res.setHeader("Retry-After", "60");
    res.status(429).json({ error: "Report generation is busy or the report limit has been reached. Please wait before trying again." }); return;
  }
  quota.count++; quota.active = true; active++; limits.set(key, quota);
  const controller = new AbortController();
  let stage: "data_collection" | "ai_commentary" | "pdf_render" = "data_collection";
  const timer = setTimeout(() => controller.abort(), 115000);
  const close = () => { if (!res.writableEnded) controller.abort(); };
  res.on("close", close);
  try {
    const data = await collectReportData(parsed.data);
    controller.signal.throwIfAborted();
    stage = "ai_commentary";
    const narrative = await writeReportNarrative(data, controller.signal, code =>
      req.log.info({ stage, code, module: parsed.data.module }, "Retrying unverified report commentary"));
    controller.signal.throwIfAborted();
    stage = "pdf_render";
    const pdf = await renderDashboardReport(data, narrative);
    if (controller.signal.aborted || res.destroyed) return;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="AE-Plus-${data.module}-report-${data.generatedAt.slice(0, 10)}.pdf"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(pdf);
  } catch (error) {
    const fileCode = error && typeof error === "object" && "code" in error &&
      ["ENOENT", "EACCES", "ENOMEM"].includes(String(error.code)) ? String(error.code) : undefined;
    req.log.warn({
      category: error instanceof ReportSelectionError ? "invalid_report_scope" : "report_unavailable",
      stage, module: parsed.data.module, elapsedMs: Date.now() - now,
      code: error instanceof ReportGenerationError ? error.code : controller.signal.aborted ? "request_aborted" :
        error instanceof ReportSelectionError ? "invalid_filters" : fileCode ?? "unexpected_error",
      providerStatus: error instanceof ReportGenerationError ? error.providerStatus : undefined,
    }, "Dashboard report failed");
    if (!res.destroyed) res.status(error instanceof ReportSelectionError ? 400 : 503).json({ error: error instanceof ReportSelectionError
      ? error.message : controller.signal.aborted ? "Report generation timed out. Please try again."
      : error instanceof ReportGenerationError ? error.message
      : stage === "pdf_render" ? "The report summary was prepared, but the PDF could not be created. Please contact your platform administrator."
      : "The AI report could not be generated. Please try again shortly; your dashboard selections have not changed." });
  } finally {
    clearTimeout(timer); res.off("close", close); quota.active = false; active--;
  }
});
export default router;
