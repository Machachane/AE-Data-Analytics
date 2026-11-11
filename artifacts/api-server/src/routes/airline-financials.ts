import { Router, type IRouter } from "express";
import {
  GetAirlineFinancialsQueryParams, GetAirlineFinancialsResponse,
  GetAirlineFinancialRecordsQueryParams, GetAirlineFinancialRecordsResponse,
  GetAirlineFinancialOptionsResponse, GetAirlineFinancialStatementParams, GetAirlineFinancialStatementResponse,
} from "@workspace/api-zod";
import { financialOptions, financialDashboard, financialRecords, financialStatement, financialExport, FinancialQueryError } from "../lib/airline-financials";

const router: IRouter = Router();
router.get("/airline-financials/options", async (_req, res): Promise<void> => {
  res.json(GetAirlineFinancialOptionsResponse.parse(await financialOptions()));
});
router.get("/airline-financials", async (req, res): Promise<void> => {
  const q = GetAirlineFinancialsQueryParams.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: q.error.message }); return; }
  try { res.json(GetAirlineFinancialsResponse.parse(await financialDashboard(q.data))); }
  catch (error) { if (error instanceof FinancialQueryError) { res.status(400).json({ error: error.message }); return; } throw error; }
});
router.get("/airline-financials/records", async (req, res): Promise<void> => {
  const q = GetAirlineFinancialRecordsQueryParams.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: q.error.message }); return; }
  try { res.json(GetAirlineFinancialRecordsResponse.parse(await financialRecords(q.data))); }
  catch (error) { if (error instanceof FinancialQueryError) { res.status(400).json({ error: error.message }); return; } throw error; }
});
router.get("/airline-financials/export", async (req, res): Promise<void> => {
  const q = GetAirlineFinancialRecordsQueryParams.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: q.error.message }); return; }
  try { await financialExport(q.data, res); }
  catch (error) {
    if (res.headersSent) { req.log.error({ err: error }, "Financial export failed"); res.end(); return; }
    if (error instanceof FinancialQueryError) { res.status(400).json({ error: error.message }); return; }
    throw error;
  }
});
router.get("/airline-financials/statements/:id", async (req, res): Promise<void> => {
  const p = GetAirlineFinancialStatementParams.safeParse(req.params);
  if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const statement = await financialStatement(p.data.id);
  if (!statement) { res.status(404).json({ error: "Statement not found" }); return; }
  res.json(GetAirlineFinancialStatementResponse.parse(statement));
});
export default router;
