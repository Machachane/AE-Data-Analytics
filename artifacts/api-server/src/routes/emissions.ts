import { Router, type IRouter } from "express";
import { GetEmissionsOptionsResponse, GetEmissionsQueryParams, GetEmissionsRecordsQueryParams, GetEmissionsRecordsResponse, GetEmissionsResponse } from "@workspace/api-zod";
import { emissionsDashboard, emissionsOptions, emissionsRecords } from "../lib/emissions";

const router: IRouter = Router();
router.get("/emissions/options", async (_req, res): Promise<void> => {
  res.json(GetEmissionsOptionsResponse.parse(await emissionsOptions()));
});
router.get("/emissions", async (req, res): Promise<void> => {
  const q = GetEmissionsQueryParams.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: "Invalid emissions filters" }); return; }
  res.json(GetEmissionsResponse.parse(await emissionsDashboard(q.data)));
});
router.get("/emissions/records", async (req, res): Promise<void> => {
  const q = GetEmissionsRecordsQueryParams.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: "Invalid emissions table parameters" }); return; }
  res.json(GetEmissionsRecordsResponse.parse(await emissionsRecords(q.data)));
});
export default router;
