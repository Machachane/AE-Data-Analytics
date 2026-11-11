import { Router, type IRouter } from "express";
import { GetMarketRatesResponse } from "@workspace/api-zod";
import { marketRates } from "../lib/market-rates";

const router: IRouter = Router();

router.get("/market-value-lease-rates", async (_req, res): Promise<void> => {
  res.json(GetMarketRatesResponse.parse(await marketRates()));
});

export default router;
