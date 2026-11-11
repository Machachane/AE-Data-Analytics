import { Router, type IRouter } from "express";
import { Readable } from "node:stream";
import { GetEmissionsOptionsResponse, GetEmissionsQueryParams, GetEmissionsRecordsQueryParams, GetEmissionsRecordsResponse, GetEmissionsResponse } from "@workspace/api-zod";
import { emissionsDashboard, emissionsExport, emissionsOptions, emissionsRecords } from "../lib/emissions";

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
router.get("/emissions/export", async (req, res): Promise<void> => {
  const q = GetEmissionsRecordsQueryParams.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: "Invalid emissions export parameters" }); return; }
  const csv = await emissionsExport(q.data);
  res.type("text/csv").attachment("emissions-filtered.csv");
  const stream = Readable.from(csv);
  stream.on("error", error => { req.log.error({ err: error }, "Emissions export failed"); res.destroy(error); });
  res.on("close", () => stream.destroy());
  stream.pipe(res);
});
export default router;
