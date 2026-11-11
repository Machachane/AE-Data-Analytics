import { Router, type IRouter } from "express";
import { GetUtilisationOptionsResponse, GetUtilisationQueryParams, GetUtilisationResponse } from "@workspace/api-zod";
import { utilisationDashboard, utilisationOptions } from "../lib/utilisation";

const router: IRouter = Router();

router.get("/utilisation/options", async (_req, res): Promise<void> => {
  res.json(GetUtilisationOptionsResponse.parse(await utilisationOptions()));
});

function validDate(value: string | undefined) {
  if (value === undefined) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

router.get("/utilisation", async (req, res): Promise<void> => {
  const query = GetUtilisationQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Invalid utilisation filters" }); return;
  }
  const q = query.data;
  const options = await utilisationOptions();
  const from = q.from ?? options.minDate, to = q.to ?? options.maxDate;
  if (!validDate(from) || !validDate(to) || from > to || from < options.minDate || to > options.maxDate) {
    res.status(400).json({ error: "Use a valid date range within the fleet snapshot" }); return;
  }
  res.json(GetUtilisationResponse.parse(await utilisationDashboard({ ...q, from, to })));
});

export default router;
