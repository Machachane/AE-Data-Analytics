import { Router, type IRouter } from "express";
import { GetAviationFinanceQueryParams, GetAviationFinanceResponse } from "@workspace/api-zod";
import { aviationFinance, FinanceFilterError } from "../lib/aviation-finance";

const router: IRouter = Router();

router.get("/aviation-finance", async (req, res): Promise<void> => {
  const parsed = GetAviationFinanceQueryParams.safeParse(req.query);
  if (!parsed.success || Object.values(req.query).some(v => typeof v !== "string")) {
    res.status(400).json({ error: "Use a single year and reporting period" }); return;
  }
  try {
    res.json(GetAviationFinanceResponse.parse(await aviationFinance(parsed.data)));
  } catch (error) {
    if (error instanceof FinanceFilterError) {
      res.status(400).json({ error: error.message }); return;
    }
    throw error;
  }
});

export default router;
