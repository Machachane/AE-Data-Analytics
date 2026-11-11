import { Router, type IRouter } from "express";
import { GetJurisdictionRiskResponse } from "@workspace/api-zod";
import { jurisdictionRisk } from "../lib/jurisdiction-risk";

const router: IRouter = Router();
router.get("/jurisdiction-risk", async (req, res): Promise<void> => {
  try {
    res.json(GetJurisdictionRiskResponse.parse(await jurisdictionRisk()));
  } catch (error) {
    req.log.error({ err: error }, "Jurisdiction risk source could not be loaded");
    res.status(503).json({ error: "Jurisdiction risk source is temporarily unavailable. Please retry." });
  }
});
export default router;
