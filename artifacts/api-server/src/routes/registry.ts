import { Router, type IRouter } from "express";
import { Readable } from "node:stream";
import { GetRegistryOptionsResponse, GetRegistryQueryParams, GetRegistryRecordsQueryParams, GetRegistryRecordsResponse, GetRegistryResponse } from "@workspace/api-zod";
import { registryDashboard, registryExport, registryOptions, registryRecords } from "../lib/registry";

const router: IRouter = Router();
router.get("/registry/options", async (_req, res): Promise<void> => {
  res.json(GetRegistryOptionsResponse.parse(await registryOptions()));
});
router.get("/registry", async (req, res): Promise<void> => {
  const q = GetRegistryQueryParams.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: "Invalid registry filters" }); return; }
  res.json(GetRegistryResponse.parse(await registryDashboard(q.data)));
});
router.get("/registry/records", async (req, res): Promise<void> => {
  const q = GetRegistryRecordsQueryParams.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: "Invalid registry table parameters" }); return; }
  res.json(GetRegistryRecordsResponse.parse(await registryRecords(q.data)));
});
router.get("/registry/export", async (req, res): Promise<void> => {
  const q = GetRegistryRecordsQueryParams.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: "Invalid registry export filters" }); return; }
  const rows = await registryExport(q.data);
  res.type("text/csv").attachment("aircraft-registry-filtered.csv");
  const stream = Readable.from(rows);
  stream.on("error", error => { req.log.error({ err: error }, "Registry CSV export failed"); res.destroy(error); });
  res.on("close", () => stream.destroy());
  stream.pipe(res);
});
export default router;
