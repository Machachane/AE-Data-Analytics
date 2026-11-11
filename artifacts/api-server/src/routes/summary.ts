import { Router, type IRouter } from "express";
import { GetSummaryQueryParams, GetSummaryResponse, GetSummaryOptionsResponse, GetSummaryRecordsQueryParams, GetSummaryRecordsResponse } from "@workspace/api-zod";
import { summaryOptions, SummaryQueryError } from "../lib/summary-sources";
import { summaryDashboard } from "../lib/summary";
import { summaryRecords, summaryExport } from "../lib/summary-fleet";
const router: IRouter = Router();
router.get("/summary/options", async (_req, res): Promise<void> => {
  res.json(GetSummaryOptionsResponse.parse(await summaryOptions()));
});
router.get("/summary", async (req, res): Promise<void> => {
  const q = GetSummaryQueryParams.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: q.error.message }); return; }
  try { res.json(GetSummaryResponse.parse(await summaryDashboard(q.data))); }
  catch (e) { if (e instanceof SummaryQueryError) { res.status(400).json({ error: e.message }); return; } throw e; }
});
router.get("/summary/records", async (req, res): Promise<void> => {
  const q = GetSummaryRecordsQueryParams.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: q.error.message }); return; }
  try { res.json(GetSummaryRecordsResponse.parse(await summaryRecords(q.data))); }
  catch (e) { if (e instanceof SummaryQueryError) { res.status(400).json({ error: e.message }); return; } throw e; }
});
router.get("/summary/export", async (req, res): Promise<void> => {
  const q = GetSummaryRecordsQueryParams.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: q.error.message }); return; }
  try {
    const csv = await summaryExport(q.data);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="ae-summary-aircraft.csv"');
    for (const chunk of csv) {
      if (res.destroyed) return;
      if (!res.write(chunk)) {
        const writable = await new Promise<boolean>(resolve => {
          const finish = (ok: boolean) => { res.off("drain", drained); res.off("close", closed); resolve(ok); };
          const drained = () => finish(true), closed = () => finish(false);
          res.once("drain", drained); res.once("close", closed);
        });
        if (!writable) return;
      }
    }
    res.end();
  } catch (e) {
    if (res.headersSent) { req.log.error({ err: e }, "Summary export failed"); res.end(); return; }
    if (e instanceof SummaryQueryError) { res.status(400).json({ error: e.message }); return; }
    throw e;
  }
});
export default router;
